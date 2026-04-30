// ============================================================================
// Analytique → Rapports mensuels client
//
// Vue agrégée : tous les rapports mensuels de tous les clients. Pour la
// génération et l'édition par client, l'agent ouvre la fiche organisation
// (onglet "Rapports mensuels").
// ============================================================================

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Download,
  FileText,
  Filter,
  Loader2,
  Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ReportItem {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  period: string;
  generatedAt: string;
  generatedByName: string | null;
  fileSizeBytes: number | null;
  hasPdf: boolean;
  publishedToPortal: boolean;
  publishedAt: string | null;
}

function fmtMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("fr-CA", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MonthlyReportsPage() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/v1/reports/monthly`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (r) =>
        r.organizationName.toLowerCase().includes(s) ||
        r.period.includes(s),
    );
  }, [items, search]);

  const togglePublish = async (id: string, publish: boolean) => {
    setBusyId(id);
    try {
      await fetch(`/api/v1/reports/monthly/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publish }),
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Rapports mensuels client
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Liste consolidée des rapports PDF mensuels générés pour les
            clients. Pour générer un nouveau rapport, ouvrir la fiche de
            l&apos;organisation.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Rechercher par client ou mois (YYYY-MM)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            {loading ? "Chargement…" : `${filtered.length} rapport(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 italic">
              Aucun rapport. Ouvrez la fiche d&apos;un client et allez dans
              l&apos;onglet &quot;Rapports mensuels&quot; pour en générer un.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <Link
                        href={`/organisations/${r.organizationSlug}?tab=monthly_reports`}
                        className="font-medium text-slate-900 hover:text-blue-700"
                      >
                        {r.organizationName}
                      </Link>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-900 font-medium">
                        {fmtMonth(r.period)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Généré le {fmtDateTime(r.generatedAt)}
                      {r.generatedByName ? ` · par ${r.generatedByName}` : ""}
                    </div>
                  </div>
                  {r.publishedToPortal ? (
                    <Badge variant="success">Publié</Badge>
                  ) : (
                    <Badge variant="outline">Brouillon</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="Rapport PDF officiel (heures + déplacements, sans montants)"
                  >
                    <a
                      href={`/api/v1/reports/monthly/${r.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="Variante interne avec montants $ (agents seulement)"
                  >
                    <a
                      href={`/api/v1/reports/monthly/${r.id}/pdf?variant=with_amounts`}
                      target="_blank"
                      rel="noopener"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Avec montants&nbsp;$
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => togglePublish(r.id, !r.publishedToPortal)}
                  >
                    {busyId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : r.publishedToPortal ? (
                      "Dépublier"
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" />
                        Publier
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
