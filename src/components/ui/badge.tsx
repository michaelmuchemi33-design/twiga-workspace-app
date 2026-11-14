import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" };

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variant === "outline" && "bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
