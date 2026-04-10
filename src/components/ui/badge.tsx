import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium leading-none ring-1 ring-inset transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default:
          "bg-slate-50 text-slate-700 ring-slate-200/80",
        primary:
          "bg-blue-50 text-blue-700 ring-blue-200/80",
        success:
          "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
        warning:
          "bg-amber-50 text-amber-800 ring-amber-200/80",
        danger:
          "bg-red-50 text-red-700 ring-red-200/80",
        outline:
          "bg-white text-slate-700 ring-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
