"use client";

import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";

export function PortalImpersonationBanner() {
  const router = useRouter();
  const impersonating = usePortalImpersonation((s) => s.impersonating);
  const stop = usePortalImpersonation((s) => s.stopImpersonation);

  if (!impersonating) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 shadow-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-[12.5px] font-medium">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Vous visualisez le portail comme{" "}
            <strong>{impersonating.name}</strong> ({impersonating.email}) —{" "}
            {impersonating.organizationName} · rôle{" "}
            <strong>{impersonating.role}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            stop();
            router.push("/settings");
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/15 hover:bg-amber-950/25 px-2.5 py-1 text-[11.5px] font-semibold transition-colors shrink-0"
        >
          <X className="h-3 w-3" />
          Quitter l&apos;impersonation
        </button>
      </div>
    </div>
  );
}
