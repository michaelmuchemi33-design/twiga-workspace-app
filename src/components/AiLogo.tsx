import { cn } from "@/lib/utils";

export default function AiLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: "h-9 w-9",
    md: "h-11 w-11",
    lg: "h-14 w-14",
  }[size];

  const icon = {
    sm: "h-4.5 w-4.5",
    md: "h-5.5 w-5.5",
    lg: "h-7 w-7",
  }[size];

  return (
    <span
      className={cn(
        "ai-logo relative flex shrink-0 items-center justify-center rounded-2xl",
        dims,
        className
      )}
    >
      <span className="ai-logo__ring" aria-hidden />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("relative z-10 text-white", icon)}
      >
        <path
          d="M12 3.2l1.7 4.6 4.6 1.7-4.6 1.7L12 15.8l-1.7-4.6L5.7 9.5l4.6-1.7L12 3.2z"
          fill="currentColor"
        />
        <path
          d="M18.4 14.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}