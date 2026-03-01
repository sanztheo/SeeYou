import { useEffect, useRef, useCallback } from "react";
import { useCesium } from "resium";
import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  SceneTransforms,
  Ellipsoid,
  Occluder,
  BoundingSphere,
} from "cesium";
import type { WeatherPoint } from "../../types/weather";

interface Particle {
  lon: number;
  lat: number;
  age: number;
  maxAge: number;
}

const MAX_PARTICLES = 4000;
const SPEED_FACTOR = 0.00015;
const TRAIL_FADE = 0.92;
const MIN_AGE = 40;
const MAX_AGE = 120;
const GRID_RES = 1;

interface WindCell {
  u: number;
  v: number;
}

function buildWindGrid(points: WeatherPoint[]): Map<number, WindCell> {
  const grid = new Map<number, WindCell>();
  for (let lat = -85; lat <= 85; lat += GRID_RES) {
    for (let lon = -180; lon <= 180; lon += GRID_RES) {
      grid.set(gridKey(lat, lon), idw(points, lon, lat));
    }
  }
  return grid;
}

function gridKey(lat: number, lon: number): number {
  const gLat = Math.round(lat / GRID_RES) * GRID_RES + 90;
  const gLon = Math.round(lon / GRID_RES) * GRID_RES + 180;
  return gLat * 361 + gLon;
}

function gridLookup(
  grid: Map<number, WindCell>,
  lon: number,
  lat: number,
): WindCell {
  const cell = grid.get(gridKey(lat, lon));
  return cell ?? { u: 0, v: 0 };
}

function idw(points: WeatherPoint[], lon: number, lat: number): WindCell {
  let sumU = 0;
  let sumV = 0;
  let sumW = 0;

  for (const p of points) {
    const dLon = p.lon - lon;
    const dLat = p.lat - lat;
    const d2 = dLon * dLon + dLat * dLat;
    if (d2 < 0.0001) {
      const rad = CesiumMath.toRadians(p.wind_direction_deg);
      return {
        u: -p.wind_speed_ms * Math.sin(rad),
        v: -p.wind_speed_ms * Math.cos(rad),
      };
    }
    const w = 1 / d2;
    const rad = CesiumMath.toRadians(p.wind_direction_deg);
    sumU += w * (-p.wind_speed_ms * Math.sin(rad));
    sumV += w * (-p.wind_speed_ms * Math.cos(rad));
    sumW += w;
  }

  return sumW > 0 ? { u: sumU / sumW, v: sumV / sumW } : { u: 0, v: 0 };
}

function randomParticle(): Particle {
  return {
    lon: Math.random() * 360 - 180,
    lat: Math.random() * 170 - 85,
    age: 0,
    maxAge: MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE),
  };
}

interface WindParticleLayerProps {
  points: WeatherPoint[];
  opacity: number;
}

export function WindParticleLayer({
  points,
  opacity,
}: WindParticleLayerProps): null {
  const { viewer } = useCesium();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef(0);
  const gridRef = useRef<Map<number, WindCell>>(new Map());
  const opacityRef = useRef(opacity);

  useEffect(() => {
    if (points.length > 0) {
      gridRef.current = buildWindGrid(points);
    }
  }, [points]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  const setupCanvas = useCallback(() => {
    if (!viewer || viewer.isDestroyed()) return null;
    const container = viewer.container as HTMLElement;
    if (!container) return null;

    let canvas = canvasRef.current;
    if (canvas && canvas.parentElement === container) return canvas;

    canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    container.appendChild(canvas);
    canvasRef.current = canvas;
    return canvas;
  }, [viewer]);

  const hasPoints = points.length > 0;

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !hasPoints) return;

    const canvas = setupCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;

    const particles: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push(randomParticle());
    }
    particlesRef.current = particles;

    const scratchCart3 = new Cartesian3();
    const scratchCartographic = new Cartographic(0, 0, 0);
    const globeSphere = new BoundingSphere(
      Cartesian3.ZERO,
      Ellipsoid.WGS84.maximumRadius,
    );

    function animate() {
      if (!viewer || viewer.isDestroyed() || !canvas || !ctx) return;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const scaledW = Math.floor(w * dpr);
      const scaledH = Math.floor(h * dpr);
      if (canvas.width !== scaledW || canvas.height !== scaledH) {
        canvas.width = scaledW;
        canvas.height = scaledH;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      const grid = gridRef.current;
      if (grid.size === 0) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const occluder = new Occluder(globeSphere, viewer.camera.positionWC);

      for (const p of particlesRef.current) {
        const wind = gridLookup(grid, p.lon, p.lat);
        const speed = Math.sqrt(wind.u * wind.u + wind.v * wind.v);

        p.lon += wind.u * SPEED_FACTOR;
        p.lat += wind.v * SPEED_FACTOR;
        p.age++;

        if (
          p.age > p.maxAge ||
          p.lon < -180 ||
          p.lon > 180 ||
          p.lat < -85 ||
          p.lat > 85
        ) {
          Object.assign(p, randomParticle());
          continue;
        }

        scratchCartographic.longitude = CesiumMath.toRadians(p.lon);
        scratchCartographic.latitude = CesiumMath.toRadians(p.lat);
        scratchCartographic.height = 0;
        Cartesian3.fromRadians(
          scratchCartographic.longitude,
          scratchCartographic.latitude,
          scratchCartographic.height,
          Ellipsoid.WGS84,
          scratchCart3,
        );

        if (!occluder.isPointVisible(scratchCart3)) continue;

        const screenPos = SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          scratchCart3,
        );
        if (!screenPos) continue;

        const ageFrac = p.age / p.maxAge;
        const alpha = opacityRef.current * Math.sin(ageFrac * Math.PI) * 0.8;
        const hue = Math.max(0, Math.min(240, 240 - speed * 12));

        ctx.fillStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      const c = canvasRef.current;
      canvasRef.current = null;
      if (c?.parentElement) {
        c.parentElement.removeChild(c);
      }
    };
  }, [viewer, hasPoints, setupCanvas]);

  return null;
}
