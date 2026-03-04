import { describe, it, expect } from "vitest";
import { getBasemapConfig } from "./basemapProviders";

describe("getBasemapConfig", () => {
  it("returns the satellite imagery provider config", () => {
    const config = getBasemapConfig("satellite");
    expect(config.url).toContain("World_Imagery");
    expect(config.credit).toContain("Esri");
  });

  it("returns the dark map provider config", () => {
    const config = getBasemapConfig("dark");
    expect(config.url).toContain("dark_all");
    expect(config.subdomains).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the light map provider config", () => {
    const config = getBasemapConfig("light");
    expect(config.url).toContain("light_all");
    expect(config.subdomains).toEqual(["a", "b", "c", "d"]);
  });
});
