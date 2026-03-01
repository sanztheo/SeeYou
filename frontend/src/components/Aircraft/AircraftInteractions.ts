import {
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Viewer,
} from "cesium";
import type { AircraftPosition } from "../../types/aircraft";

function extractIcao(picked: { id?: unknown } | undefined): string | undefined {
  if (!picked) return undefined;
  if (typeof picked.id === "string") return picked.id;
  const entity = picked.id as { id?: unknown } | undefined;
  if (entity && typeof entity.id === "string") return entity.id;
  return undefined;
}

export function setupInteractions(
  viewer: Viewer,
  canvas: HTMLCanvasElement,
  aircraftRef: { current: Map<string, AircraftPosition> },
  onSelectRef: {
    current: ((ac: AircraftPosition) => void) | undefined;
  },
  onHoverRef: {
    current:
      | ((ac: AircraftPosition | null, x: number, y: number) => void)
      | undefined;
  },
): () => void {
  const container = canvas.parentElement as HTMLElement;
  const setCursor = (c: string): void => {
    container.style.cursor = c;
  };
  setCursor("grab");
  let isDragging = false;
  let isHoveringEntity = false;

  const handler = new ScreenSpaceEventHandler(canvas);

  handler.setInputAction((event: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(event.position);
    const icao = extractIcao(defined(picked) ? picked : undefined);
    if (icao) {
      const ac = aircraftRef.current.get(icao);
      if (ac) onSelectRef.current?.(ac);
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  const onPointerDown = (): void => {
    isDragging = true;
    setCursor("grabbing");
    if (isHoveringEntity) {
      isHoveringEntity = false;
      onHoverRef.current?.(null, 0, 0);
    }
  };

  const onPointerUp = (): void => {
    isDragging = false;
    setCursor(isHoveringEntity ? "pointer" : "grab");
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (isDragging) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const picked = viewer.scene.pick(new Cartesian2(x, y));
    const icao = extractIcao(defined(picked) ? picked : undefined);
    if (icao) {
      const ac = aircraftRef.current.get(icao);
      if (ac) {
        isHoveringEntity = true;
        setCursor("pointer");
        onHoverRef.current?.(ac, e.clientX, e.clientY);
        return;
      }
    }

    if (isHoveringEntity) {
      isHoveringEntity = false;
      setCursor("grab");
      onHoverRef.current?.(null, 0, 0);
    }
  };

  container.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointermove", onPointerMove);

  return (): void => {
    handler.destroy();
    container.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    container.removeEventListener("pointermove", onPointerMove);
  };
}
