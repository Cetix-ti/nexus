"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DoubleScrollProps {
  children: React.ReactNode;
  className?: string;
  scrollClassName?: string;
}

/**
 * Wraps a horizontally scrolling area and adds a synchronized scrollbar
 * at the top, mirroring the native one at the bottom. Useful for wide
 * Kanban boards / tables.
 */
export function DoubleScroll({
  children,
  className,
  scrollClassName,
}: DoubleScrollProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const isSyncing = useRef(false);

  // Observe content width to size the top scrollbar
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const observer = new ResizeObserver(() => {
      setContentWidth(inner.scrollWidth);
    });
    observer.observe(inner);
    setContentWidth(inner.scrollWidth);
    return () => observer.disconnect();
  }, []);

  // Sync top → bottom
  function handleTopScroll() {
    if (isSyncing.current) {
      isSyncing.current = false;
      return;
    }
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (top && bottom && bottom.scrollLeft !== top.scrollLeft) {
      isSyncing.current = true;
      bottom.scrollLeft = top.scrollLeft;
    }
  }

  // Sync bottom → top
  function handleBottomScroll() {
    if (isSyncing.current) {
      isSyncing.current = false;
      return;
    }
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (top && bottom && top.scrollLeft !== bottom.scrollLeft) {
      isSyncing.current = true;
      top.scrollLeft = bottom.scrollLeft;
    }
  }

  return (
    <div className={className}>
      {/* Top phantom scrollbar */}
      <div
        ref={topRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto overflow-y-hidden mb-2"
        style={{ scrollbarWidth: "auto" }}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>

      {/* Real content with native bottom scrollbar */}
      <div
        ref={bottomRef}
        onScroll={handleBottomScroll}
        className={cn("overflow-x-auto", scrollClassName)}
      >
        <div ref={innerRef} className="inline-block min-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
