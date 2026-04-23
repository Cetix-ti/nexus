"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props { organizationId: string; organizationSlug: string }

export function OrgDossierExportButton({ organizationId, organizationSlug }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/v1/organizations/${organizationId}/dossier/pdf`);
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? `HTTP ${res.status}`); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dossier-360-${organizationSlug}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="outline" onClick={downloadPdf} disabled={loading} className="gap-1.5">
        <FileDown className={`h-4 w-4 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Génération…" : "Dossier 360°"}
      </Button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
