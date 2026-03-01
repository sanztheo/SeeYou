import { useState, useEffect, useRef, useCallback } from "react";
import type { Camera } from "../../types/camera";
import { getProxyUrl } from "../../services/cameraService";

const REFRESH_INTERVAL_MS = 10_000;

interface CameraPlayerProps {
  camera: Camera | null;
  onClose: () => void;
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

  const buildSrc = useCallback((cam: Camera): string => {
    const proxy = getProxyUrl(cam.stream_url);
    if (cam.stream_type === "ImageRefresh") {
      return `${proxy}&_t=${Date.now()}`;
    }
    return proxy;
  }, []);

  useEffect(() => {
    if (!camera) return;
    setImgError(false);
    setImgSrc(buildSrc(camera));

    if (camera.stream_type !== "ImageRefresh") return;

    const id = setInterval(() => {
      setImgSrc(buildSrc(camera));
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, [camera, buildSrc]);

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

  if (!camera) return null;

  const isHls = camera.stream_type === "Hls";

  return (
    <div
      className="fixed z-50 w-80 rounded-lg overflow-hidden border border-gray-700/60 shadow-2xl bg-gray-900/90 backdrop-blur-md"
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
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700/60 text-gray-400 hover:text-gray-100 transition-colors flex-shrink-0"
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

      {/* Stream */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center">
        {isHls ? (
          <span className="text-xs text-gray-500 font-mono">
            HLS not supported yet
          </span>
        ) : imgError ? (
          <span className="text-xs text-red-400 font-mono">
            Stream unavailable
          </span>
        ) : (
          <img
            src={imgSrc}
            alt={camera.name}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-400 font-mono border-t border-gray-700/40">
        <span>{camera.city}</span>
        <span className="text-gray-600">|</span>
        <span className="px-1 py-px rounded bg-gray-700/60 text-gray-300 uppercase text-[9px] font-bold">
          {camera.source}
        </span>
        <span className="text-gray-600">|</span>
        <span>{camera.stream_type}</span>
      </div>
    </div>
  );
}
