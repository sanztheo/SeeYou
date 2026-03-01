import { useEffect, useRef, useState } from "react";

interface TransitionProps {
  show: boolean;
  children: React.ReactNode;
  direction?: "left" | "right" | "up" | "down" | "fade";
  duration?: number;
}

const TRANSLATE: Record<string, string> = {
  left: "-translate-x-4",
  right: "translate-x-4",
  up: "-translate-y-4",
  down: "translate-y-4",
  fade: "",
};

export function Transition({
  show,
  children,
  direction = "fade",
  duration = 200,
}: TransitionProps): React.ReactElement | null {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (show) {
      setMounted(true);
      raf.current = requestAnimationFrame(() => {
        raf.current = requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const id = setTimeout(() => setMounted(false), duration);
      return () => clearTimeout(id);
    }
    return () => cancelAnimationFrame(raf.current);
  }, [show, duration]);

  if (!mounted) return null;

  const translate = TRANSLATE[direction];
  const entering = visible
    ? "opacity-100 translate-x-0 translate-y-0"
    : `opacity-0 ${translate}`;

  return (
    <div
      className={`transition-all ease-out ${entering}`}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
}
