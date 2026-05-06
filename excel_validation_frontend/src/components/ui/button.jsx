import React from "react";
import { cn } from "../../lib/utils";

const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-red-600 text-white hover:bg-red-700 shadow-sm":
              variant === "default" || variant === "destructive",
            "bg-white text-red-600 border border-red-200 hover:bg-red-50":
              variant === "outline",
            "bg-red-100 text-red-700 hover:bg-red-200": variant === "ghost",
            "bg-red-600/10 text-red-600 hover:bg-red-600/20": variant === "soft",
            "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm":
              variant === "success",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-md px-3": size === "sm",
            "h-11 rounded-md px-8": size === "lg",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
