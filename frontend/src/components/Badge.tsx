interface BadgeProps {
  label: string;
  color?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

const SIZE_CLASSES = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
} as const;

export function Badge({
  label,
  color = "bg-zinc-700",
  size = "sm",
  pulse = false,
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-mono uppercase tracking-wider ${color} ${SIZE_CLASSES[size]} text-zinc-100`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-75`}
          />
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${color} ring-1 ring-white/20`}
          />
        </span>
      )}
      {label}
    </span>
  );
}
