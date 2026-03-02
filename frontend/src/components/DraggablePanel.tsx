import { useCallback, useEffect, useRef, useState } from "react";

let zTop = 50;

interface DraggablePanelProps {
  children: React.ReactNode;
}

export function DraggablePanel({ children }: DraggablePanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    x: number;
    y: number;
    w: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [zIndex, setZIndex] = useState(50);
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      if (e.clientY - rect.top > 44) return;
      if ((e.target as HTMLElement).closest("button, a")) return;

      e.preventDefault();

      const px = pos?.x ?? rect.left;
      const py = pos?.y ?? rect.top;

      startRef.current = { mx: e.clientX, my: e.clientY, px, py };
      if (!pos) {
        setPos({ x: rect.left, y: rect.top, w: rect.width });
      }
      setZIndex(++zTop);
      setIsDragging(true);
    },
    [pos],
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (e.clientY - rect.top > 44) return;
    setPos(null);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startRef.current.mx;
      const dy = e.clientY - startRef.current.my;
      setPos((prev) => ({
        x: Math.max(
          0,
          Math.min(window.innerWidth - 100, startRef.current.px + dx),
        ),
        y: Math.max(
          0,
          Math.min(window.innerHeight - 40, startRef.current.py + dy),
        ),
        w: prev?.w ?? 280,
      }));
    };

    const onUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const isDetached = pos !== null;

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className={`draggable-wrap ${isDragging ? "is-dragging select-none" : ""}`}
      style={
        isDetached
          ? {
              position: "fixed" as const,
              left: pos.x,
              top: pos.y,
              width: pos.w,
              zIndex,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
