//! OFAC Specially Designated Nationals (SDN) list — vessel-type entries
//! only, bundled from `backend/data/sanctions/ofac_sdn_vessels.json` (U.S.
//! government work, public domain). Chosen over OpenSanctions per
//! `docs/plans/sources.md`'s Priorité 1 table: OpenSanctions is CC-BY-NC
//! 4.0 (non-commercial), a licensing trap for a project targeting
//! commercial contracts; OFAC's primary list carries no such restriction.
//!
//! Matching is exact call-sign only. Vessel *name* was tried and dropped
//! before shipping: live-tested against the real digitraffic feed, it
//! produced a confirmed false positive — a Finnish vessel named "LEO"
//! (call sign `OJTZ`, IMO 7363970, en route to a Finnish port) matched the
//! SDN list purely because an unrelated Russia/Ukraine-program vessel is
//! also named "LEO" (call sign `8P2467`). Display names are not unique
//! identifiers; call signs are assigned, structured identifiers and don't
//! collide the same way. Trades recall (~40% of SDN vessel rows carry no
//! call sign, so those can't be matched at all) for not flagging innocent
//! vessels — the right side of that tradeoff for a field with reputational
//! weight.

use std::collections::HashSet;
use std::sync::LazyLock;

use serde::Deserialize;

const OFAC_SDN_VESSELS_JSON: &str =
    include_str!("../../../data/sanctions/ofac_sdn_vessels.json");

#[derive(Debug, Deserialize)]
struct SdnVesselFile {
    vessels: Vec<SdnVessel>,
}

#[derive(Debug, Deserialize)]
struct SdnVessel {
    call_sign: Option<String>,
}

fn normalize(value: &str) -> String {
    value.trim().to_uppercase()
}

static SANCTIONED_CALL_SIGNS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let file: SdnVesselFile = serde_json::from_str(OFAC_SDN_VESSELS_JSON)
        .expect("bundled OFAC SDN vessel data must parse — built and validated in-repo");

    file.vessels
        .into_iter()
        .filter_map(|vessel| vessel.call_sign)
        .map(|call_sign| normalize(&call_sign))
        .collect()
});

/// Exact, case-insensitive match against the bundled OFAC SDN vessel list's
/// call signs. Returns `false` when `call_sign` is absent — callers that
/// need to distinguish "checked, clean" from "nothing to check" should look
/// at whether the AIS feed reported a call sign in the first place.
pub fn is_sanctioned_vessel(call_sign: Option<&str>) -> bool {
    let Some(call_sign) = call_sign else {
        return false;
    };
    SANCTIONED_CALL_SIGNS.contains(&normalize(call_sign))
}

#[cfg(test)]
mod tests {
    use super::is_sanctioned_vessel;

    // Call sign CL2192 ("MAR AZUL", Cuba program) is a real row in the
    // bundled OFAC SDN export (verified against the live SDN.CSV at the
    // time this was written; see the task's verification output).

    #[test]
    fn matches_a_real_sdn_vessel_by_call_sign() {
        assert!(is_sanctioned_vessel(Some("CL2192")));
    }

    #[test]
    fn call_sign_match_is_case_insensitive() {
        assert!(is_sanctioned_vessel(Some("cl2192")));
    }

    #[test]
    fn does_not_match_an_arbitrary_call_sign() {
        assert!(!is_sanctioned_vessel(Some("OJTZ")));
    }

    /// Regression: this exact scenario was a real false positive caught
    /// live before this fix (see the module doc comment) — same display
    /// name as a sanctioned vessel, unrelated call sign, must not match.
    #[test]
    fn a_shared_display_name_alone_does_not_match() {
        assert!(!is_sanctioned_vessel(Some("OJTZ"))); // real "LEO", Finland
    }

    #[test]
    fn returns_false_when_nothing_to_match() {
        assert!(!is_sanctioned_vessel(None));
    }
}
