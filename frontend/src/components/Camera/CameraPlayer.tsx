import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import type { Camera } from "../../types/camera";
import { getProxyUrl } from "../../services/cameraService";

const REFRESH_NORMAL_MS = 10_000;
const REFRESH_FOCUSED_MS = 5_000;
const ZOOM_STEP = 0.5;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;

interface CameraPlayerProps {
  camera: Camera | null;
  onClose: () => void;
}

function formatTimeAgo(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 2) return "just now";
  if (delta < 60) return `${delta}s ago`;
  return `${Math.floor(delta / 60)}m ago`;
}

export function CameraPlayer({
  camera,
  onClose,
}: CameraPlayerProps): React.ReactElement | null {
  const [imgSrc, setImgSrc] = useState("");
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const [imgError, setImgError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });

  // Tick counter to force re-render for "Xs ago" label
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSync) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [lastSync]);

  const lastSyncLabel = lastSync > 0 ? formatTimeAgo(lastSync) : "";

  const buildSrc = useCallback((cam: Camera): string => {
    const proxy = getProxyUrl(cam.stream_url);
    if (cam.stream_type === "ImageRefresh") {
      return `${proxy}&_t=${Date.now()}`;
    }
    return proxy;
  }, []);

  const refreshImage = useCallback((): void => {
    if (!camera) return;
    setImgError(false);
    setImgSrc(buildSrc(camera));
    setLastSync(Date.now());
  }, [camera, buildSrc]);

  // Reset state on camera change (state-based tracking, no refs in render)
  const cameraId = camera?.id;
  const [trackedCameraId, setTrackedCameraId] = useState<string | undefined>(
    undefined,
  );
  if (cameraId !== trackedCameraId) {
    setTrackedCameraId(cameraId);
    setImgError(false);
    setExpanded(false);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setLastSync(0);
    if (camera) {
      setImgSrc(getProxyUrl(camera.stream_url));
    }
  }

  // Set initial sync timestamp (async to avoid sync setState in effect)
  useEffect(() => {
    if (!camera) return;
    const t = setTimeout(() => setLastSync(Date.now()), 0);
    return () => clearTimeout(t);
  }, [camera]);

  // Auto-refresh interval: 1s when expanded, 10s otherwise
  useEffect(() => {
    if (!camera || camera.stream_type !== "ImageRefresh") return;

    const interval = expanded ? REFRESH_FOCUSED_MS : REFRESH_NORMAL_MS;
    const id = setInterval(refreshImage, interval);
    return () => clearInterval(id);
  }, [camera, expanded, refreshImage]);

  // HLS setup — load directly from CDN (not proxy) so hls.js can fetch segments
  useEffect(() => {
    if (!camera || camera.stream_type !== "Hls") return;

    const video = videoRef.current;
    if (!video) return;

    // Use stream URL directly: proxy can't handle HLS segment fetching
    const src = camera.stream_url;

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup(xhr) {
          xhr.withCredentials = false;
        },
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          // If direct fails, retry once via proxy (manifest-only streams)
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            !hls.url?.includes("/cameras/proxy")
          ) {
            hls.loadSource(getProxyUrl(src));
            return;
          }
          hls.destroy();
          setImgError(true);
        }
      });
      return () => hls.destroy();
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      const onError = () => setImgError(true);
      video.addEventListener("error", onError);
      return () => {
        video.removeEventListener("error", onError);
        video.removeAttribute("src");
        video.load();
      };
    }

    // Schedule fallback error asynchronously to satisfy lint rule
    const t = setTimeout(() => setImgError(true), 0);
    return () => clearTimeout(t);
  }, [camera]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent): void => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const onUp = (): void => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // Zoom with scroll wheel — native listener to allow preventDefault on non-passive event
  const streamRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setZoom((prev) => {
        const next = prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
        if (clamped === 1) setPanOffset({ x: 0, y: 0 });
        return clamped;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pan when zoomed
  const handlePanDown = useCallback(
    (e: React.MouseEvent): void => {
      if (zoom <= 1) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffsetStart.current = { ...panOffset };
    },
    [zoom, panOffset],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!isPanning.current) return;
      setPanOffset({
        x: panOffsetStart.current.x + (e.clientX - panStart.current.x),
        y: panOffsetStart.current.y + (e.clientY - panStart.current.y),
      });
    };
    const onUp = (): void => {
      isPanning.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!camera) return null;

  const isHls = camera.stream_type === "Hls";
  const widthClass = expanded ? "w-[640px]" : "w-80";

  return (
    <div
      className={`fixed z-50 ${widthClass} rounded-lg overflow-hidden border border-gray-700/60 shadow-2xl bg-gray-900/90 backdrop-blur-md transition-[width] duration-200`}
      style={{ left: position.x, top: position.y }}
    >
      {/* Header — draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none border-b border-gray-700/40"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${camera.is_online ? "bg-green-400" : "bg-red-400"}`}
          />
          <span className="text-xs font-semibold text-gray-100 truncate font-mono">
            {camera.name}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Refresh button */}
          <button
            onClick={refreshImage}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-100 transition-colors"
            aria-label="Refresh image"
            title="Refresh"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h5M20 20v-5h-5M20.49 9A9 9 0 005.64 5.64L4 4m16 16l-1.64-1.64A9 9 0 014.51 15"
              />
            </svg>
          </button>
          {/* Expand / collapse */}
          <button
            onClick={() => {
              setExpanded((prev) => !prev);
              setZoom(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-100 transition-colors"
            aria-label={expanded ? "Reduce" : "Expand"}
            title={expanded ? "Reduce" : "Expand"}
          >
            {expanded ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9L4 4m0 0v4m0-4h4m6 6l5 5m0 0v-4m0 4h-4"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                />
              </svg>
            )}
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-100 transition-colors"
            aria-label="Close camera player"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Stream */}
      <div
        ref={streamRef}
        className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden"
        onMouseDown={handlePanDown}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <div
          className="w-full h-full"
          style={{
            transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: "center",
            willChange: zoom > 1 ? "transform" : undefined,
          }}
        >
          {isHls ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain"
                style={{ display: imgError ? "none" : undefined }}
              />
              {imgError && (
                <span className="absolute inset-0 flex items-center justify-center text-xs text-red-400 font-mono">
                  Stream unavailable
                </span>
              )}
            </>
          ) : imgError ? (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-red-400 font-mono">
              Stream unavailable
            </span>
          ) : (
            <img
              src={imgSrc}
              alt={camera.name}
              className="w-full h-full object-contain select-none"
              draggable={false}
              onError={() => setImgError(true)}
            />
          )}
        </div>

        {/* Zoom indicator */}
        {zoom > 1 && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-gray-300 font-mono pointer-events-none">
            {zoom.toFixed(1)}x
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-700/40">
        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
          <span>{camera.city}</span>
          <span className="text-gray-600">|</span>
          <span className="px-1 py-px rounded bg-gray-700/60 text-gray-300 uppercase text-[9px] font-bold">
            {camera.source}
          </span>
          <span className="text-gray-600">|</span>
          <span>{camera.stream_type}</span>
        </div>
        {lastSync > 0 && (
          <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-2.5 h-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
            {lastSyncLabel}
            {expanded && (
              <span
                className="text-green-500 ml-0.5"
                title="Refreshing every 5s"
              >
                5s
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
