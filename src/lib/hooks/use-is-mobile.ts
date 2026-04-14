"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the viewport is mobile-sized (< 640px by default).
 * Safe for SSR: always returns false on first render, updates on mount.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return mobile;
}
