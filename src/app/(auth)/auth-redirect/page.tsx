"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

/**
 * Post-OAuth redirect page.
 * Determines if the authenticated user is an agent or a portal client,
 * then redirects accordingly.
 */
export default function AuthRedirectPage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user) {
      window.location.href = "/login";
      return;
    }

    const user = session.user as any;
    const role = user.role;

    // Agent roles go to dashboard
    if (role && !role.startsWith("CLIENT_")) {
      window.location.href = "/dashboard";
      return;
    }

    // Client roles go to portal
    if (user.organizationId) {
      window.location.href = "/portal";
      return;
    }

    // Fallback
    window.location.href = "/dashboard";
  }, [session, status]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm text-slate-500">Redirection en cours...</p>
      </div>
    </div>
  );
}
