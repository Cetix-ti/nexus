"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, iconLeft, iconRight, id, ...props }, ref) => {
    const inputId = id || React.useId();

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {iconLeft && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
              {iconLeft}
            </div>
          )}
          <input
            type={type}
            id={inputId}
            className={cn(
              "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm transition-colors duration-200",
              "placeholder:text-slate-400",
              "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
              "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-50",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
              iconLeft && "pl-10",
              iconRight && "pr-10",
              className
            )}
            ref={ref}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          {iconRight && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400">
              {iconRight}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
