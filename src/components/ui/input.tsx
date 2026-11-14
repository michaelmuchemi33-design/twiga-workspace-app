import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, type = "text", ...props }: InputHTMLAttributes<HTMLInputElement>) { return <input type={type} className={cn("flex h-10 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />; }
