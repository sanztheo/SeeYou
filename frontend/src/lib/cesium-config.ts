import { Ion } from "cesium";

export function initializeCesium(): void {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (token && token !== "your_cesium_ion_token_here") {
    Ion.defaultAccessToken = token;
  }
}

export function hasValidToken(): boolean {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
  return Boolean(token && token !== "your_cesium_ion_token_here");
}
