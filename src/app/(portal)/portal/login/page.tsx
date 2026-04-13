"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Portal login now uses the unified login page.
 * This page redirects to /login.
 */
export default function PortalLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);
  return null;
}
