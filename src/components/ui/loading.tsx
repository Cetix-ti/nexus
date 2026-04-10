import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Spinner ---

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div className={cn("flex items-center justify-center", className)} {...props}>
      <Loader2 className={cn("animate-spin text-blue-600", sizeClasses[size])} />
    </div>
  );
}

// --- Page Loading ---

function PageLoading({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-full min-h-[200px] items-center justify-center", className)}
      {...props}
    >
      <Spinner size="lg" />
    </div>
  );
}

// --- Skeleton ---

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-neutral-200", className)}
      {...props}
    />
  );
}

// --- Skeleton Rows (for table-like loading) ---

function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-8 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Skeleton Card ---

function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-6 shadow-sm",
        className
      )}
      {...props}
    >
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

export { Spinner, PageLoading, Skeleton, SkeletonRows, SkeletonCard };
