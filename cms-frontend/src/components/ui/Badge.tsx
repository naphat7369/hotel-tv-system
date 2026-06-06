import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "error"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 uppercase tracking-widest",
        {
          "border-transparent bg-primary/10 text-primary": variant === "default",
          "border-transparent bg-green-500/10 text-green-500": variant === "success",
          "border-transparent bg-amber-500/10 text-amber-500": variant === "warning",
          "border-transparent bg-error/10 text-error": variant === "error",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
