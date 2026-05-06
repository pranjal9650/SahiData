import React from "react";
import { cn } from "../../lib/utils";

const Toggle = React.forwardRef(
  ({ className, pressed, onPressedChange, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50",
        pressed
          ? "bg-red-100 text-red-700"
          : "bg-transparent hover:bg-red-50 hover:text-red-700",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Toggle.displayName = "Toggle";

export { Toggle };
