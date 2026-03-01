import { useRef, useState, useCallback, useEffect } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

const PLACEMENT: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const ARROW: Record<string, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-t-zinc-800 border-x-transparent border-b-transparent border-4",
  bottom:
    "bottom-full left-1/2 -translate-x-1/2 border-b-zinc-800 border-x-transparent border-t-transparent border-4",
  left: "left-full top-1/2 -translate-y-1/2 border-l-zinc-800 border-y-transparent border-r-transparent border-4",
  right:
    "right-full top-1/2 -translate-y-1/2 border-r-zinc-800 border-y-transparent border-l-transparent border-4",
};

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 200,
}: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(() => {
    timer.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 ${PLACEMENT[position]} pointer-events-none`}
          role="tooltip"
        >
          <div className="relative whitespace-nowrap rounded bg-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-200 shadow-lg ring-1 ring-zinc-700/50">
            {content}
            <span className={`absolute ${ARROW[position]}`} />
          </div>
        </div>
      )}
    </div>
  );
}
