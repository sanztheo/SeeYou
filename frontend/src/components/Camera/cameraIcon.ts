const SIZE = 32;

function buildSvg(fill: string, stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.5">
  <rect x="2" y="6" width="14" height="12" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <path d="M16 10l4.5-2.5v9L16 14" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="9" cy="12" r="2.5" fill="none" stroke="${stroke}" stroke-width="1.2"/>
</svg>`;
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const onlineSvg = buildSvg("#16a34a", "#ffffff");
const offlineSvg = buildSvg("#991b1b", "#ef4444");

export const CAMERA_ICON_ONLINE = svgToDataUri(onlineSvg);
export const CAMERA_ICON_OFFLINE = svgToDataUri(offlineSvg);
