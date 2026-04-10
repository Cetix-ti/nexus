import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps["variant"];
  };
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>
      )}
      {action && (
        <Button
          variant={action.variant || "primary"}
          size="sm"
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
