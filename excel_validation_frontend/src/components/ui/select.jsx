import React from "react";
import { cn } from "../../lib/utils";

const Select = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <select
      className={cn(
        "flex h-11 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-950 ring-offset-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

const SelectOption = ({ value, children }) => (
  <option value={value}>{children}</option>
);

export { Select, SelectOption };
