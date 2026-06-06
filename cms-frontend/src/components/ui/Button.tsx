import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "icon"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded font-inter transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-primary text-on-primary hover:bg-primary/90": variant === "primary",
            "border border-outline bg-transparent text-on-surface hover:bg-surface-variant": variant === "secondary" || variant === "outline",
            "hover:bg-surface-variant hover:text-on-surface text-on-surface-variant": variant === "ghost",
            "hover:bg-surface-variant hover:text-on-surface": variant === "icon",
          },
          {
            "h-9 px-4 py-2 text-sm": size === "default",
            "h-8 rounded px-3 text-xs": size === "sm",
            "h-10 rounded px-8 text-base": size === "lg",
            "h-9 w-9": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
