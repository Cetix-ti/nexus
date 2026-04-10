"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 focus-visible:ring-slate-900",
        primary:
          "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-600",
        secondary:
          "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:bg-violet-800 focus-visible:ring-violet-600",
        danger:
          "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-600",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
        outline:
          "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 focus-visible:ring-slate-300",
      },
      size: {
        sm: "h-8 px-3 text-[12.5px] rounded-md",
        md: "h-10 px-4 text-[13px]",
        lg: "h-11 px-5 text-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
