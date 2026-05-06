import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const Dialog = ({ open, onOpenChange, children }) => {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onOpenChange?.(false);
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-50">{children}</div>
    </div>
  );
};

const DialogContent = React.forwardRef(
  ({ className, children, onClose, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto",
        className
      )}
      {...props}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={16} />
        </button>
      )}
      {children}
    </div>
  )
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 mb-4", className)} {...props} />
);

const DialogTitle = ({ className, ...props }) => (
  <h2 className={cn("text-lg font-semibold text-gray-900", className)} {...props} />
);

const DialogDescription = ({ className, ...props }) => (
  <p className={cn("text-sm text-gray-500", className)} {...props} />
);

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex justify-end gap-2 mt-6", className)} {...props} />
);

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
