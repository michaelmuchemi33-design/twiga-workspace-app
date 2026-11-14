import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
export function Switch({ className, ...props }: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) { return <SwitchPrimitive.Root className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-neutral-200 transition-colors data-[state=checked]:bg-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300", className)} {...props}><SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" /></SwitchPrimitive.Root>; }
