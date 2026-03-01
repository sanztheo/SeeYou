import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useViewerCallbacks } from "./useViewerCallbacks";

const mockHandlerInstances: Array<{
  setInputAction: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("cesium", () => {
  const toDegrees = (rad: number) => rad * (180 / Math.PI);
  const toRadians = (deg: number) => deg * (Math.PI / 180);

  class MockScreenSpaceEventHandler {
    setInputAction = vi.fn();
    isDestroyed = vi.fn(() => false);
    destroy = vi.fn();

    constructor() {
      mockHandlerInstances.push(this);
    }
  }

  return {
    Cartographic: {
      fromCartesian: vi.fn(() => ({
        latitude: toRadians(48.8566),
        longitude: toRadians(2.3522),
        height: 0,
      })),
    },
    Math: {
      toDegrees,
      toRadians,
    },
    ScreenSpaceEventHandler: MockScreenSpaceEventHandler,
    ScreenSpaceEventType: { MOUSE_MOVE: 6 },
    defined: (v: unknown) => v !== undefined && v !== null,
  };
});

function createMockViewer() {
  const cameraListeners: Array<() => void> = [];
  return {
    isDestroyed: vi.fn(() => false),
    camera: {
      positionCartographic: {
        latitude: (48.8566 * Math.PI) / 180,
        longitude: (2.3522 * Math.PI) / 180,
        height: 2500,
      },
      heading: 0,
      pitch: (-45 * Math.PI) / 180,
      changed: {
        addEventListener: vi.fn((fn: () => void) => cameraListeners.push(fn)),
        removeEventListener: vi.fn((fn: () => void) => {
          const idx = cameraListeners.indexOf(fn);
          if (idx >= 0) cameraListeners.splice(idx, 1);
        }),
      },
      pickEllipsoid: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
    },
    scene: {
      canvas: document.createElement("canvas"),
      globe: {
        ellipsoid: {},
      },
    },
    _cameraListeners: cameraListeners,
  };
}

describe("useViewerCallbacks", () => {
  let viewer: ReturnType<typeof createMockViewer>;

  beforeEach(() => {
    viewer = createMockViewer();
    mockHandlerInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when viewer is null", () => {
    const onCamera = vi.fn();
    const { unmount } = renderHook(() => useViewerCallbacks(null, onCamera));

    expect(onCamera).not.toHaveBeenCalled();
    unmount();
  });

  it("does nothing when viewer is destroyed", () => {
    viewer.isDestroyed.mockReturnValue(true);
    const onCamera = vi.fn();

    renderHook(() => useViewerCallbacks(viewer as never, onCamera));

    expect(onCamera).not.toHaveBeenCalled();
    expect(viewer.camera.changed.addEventListener).not.toHaveBeenCalled();
  });

  it("fires initial camera read on mount", () => {
    const onCamera = vi.fn();

    renderHook(() => useViewerCallbacks(viewer as never, onCamera));

    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: expect.closeTo(48.8566, 2),
        lon: expect.closeTo(2.3522, 2),
        altitude: 2500,
      }),
    );
  });

  it("subscribes to camera.changed", () => {
    renderHook(() => useViewerCallbacks(viewer as never, vi.fn()));

    expect(viewer.camera.changed.addEventListener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from camera.changed on unmount", () => {
    const { unmount } = renderHook(() =>
      useViewerCallbacks(viewer as never, vi.fn()),
    );

    unmount();

    expect(viewer.camera.changed.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("skips cleanup when viewer is destroyed at unmount", () => {
    const { unmount } = renderHook(() =>
      useViewerCallbacks(viewer as never, vi.fn()),
    );

    viewer.isDestroyed.mockReturnValue(true);
    unmount();

    expect(viewer.camera.changed.removeEventListener).not.toHaveBeenCalled();
  });

  it("creates a ScreenSpaceEventHandler for mouse moves", () => {
    renderHook(() => useViewerCallbacks(viewer as never, undefined, vi.fn()));

    expect(mockHandlerInstances.length).toBe(1);
    expect(mockHandlerInstances[0].setInputAction).toHaveBeenCalled();
  });

  it("destroys ScreenSpaceEventHandler on unmount", () => {
    const { unmount } = renderHook(() =>
      useViewerCallbacks(viewer as never, undefined, vi.fn()),
    );

    unmount();

    expect(mockHandlerInstances[0].destroy).toHaveBeenCalled();
  });

  it("camera state contains heading and pitch in degrees", () => {
    const onCamera = vi.fn();
    renderHook(() => useViewerCallbacks(viewer as never, onCamera));

    const state = onCamera.mock.calls[0][0];
    expect(state.heading).toBeCloseTo(0, 1);
    expect(state.pitch).toBeCloseTo(-45, 1);
  });

  it("updates callback refs without re-subscribing", () => {
    const onCamera1 = vi.fn();
    const onCamera2 = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useViewerCallbacks(viewer as never, cb),
      { initialProps: { cb: onCamera1 } },
    );

    expect(viewer.camera.changed.addEventListener).toHaveBeenCalledTimes(1);

    rerender({ cb: onCamera2 });

    expect(viewer.camera.changed.addEventListener).toHaveBeenCalledTimes(1);
    expect(viewer.camera.changed.removeEventListener).not.toHaveBeenCalled();
  });
});
