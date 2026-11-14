import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" | "secondary" | "destructive"; size?: "default" | "sm" | "lg" | "icon" };
export function Button({ className, variant = "default", size = "default", type = "button", ...props }: Props) {
 const variants = { default: "bg-orange-500 text-white hover:bg-orange-600", outline: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50", ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100", secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200", destructive: "bg-red-600 text-white hover:bg-red-700" };
 const sizes = { default: "h-10 px-4 py-2", sm: "h-8 rounded-lg px-3 text-xs", lg: "h-12 rounded-xl px-6", icon: "h-9 w-9" };
 return <button type={type} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} {...props} />;
}
