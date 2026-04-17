"use client";

// ============================================================================
// BILLING LOCK SECTION — gestion des verrouillages de périodes mensuelles.
//
// Le responsable de la facturation voit la liste des mois passés avec leur
// statut (verrouillé ou ouvert) et peut verrouiller/déverrouiller d'un clic.
// Seuls les mois passés sont proposés (pas le mois en cours).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Lock, Unlock, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PeriodLock {
  id: string;
  period: string;
  lockedAt: string;
  notes: string | null;
  user: { id: string; firstName: string; lastName: string };
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatPeriod(p: string): string {
  const [y, m] = p.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function pastMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${yyyy}-${mm}`);
  }
  return result;
}

export function BillingLockSection() {
  const [locks, setLocks] = useState<PeriodLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/billing/period-locks");
    if (res.ok) {
      const d = await res.json();
      setLocks(d.items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const lockedPeriods = new Set(locks.map((l) => l.period));
  const months = pastMonths(12);

  async function toggleLock(period: string) {
    setBusy(period);
    if (lockedPeriods.has(period)) {
      if (!confirm(`Déverrouiller ${formatPeriod(period)} ? Les techniciens pourront à nouveau modifier les saisies de temps pour ce mois.`)) {
        setBusy(null);
        return;
      }
      await fetch(`/api/v1/billing/period-locks?period=${period}`, { method: "DELETE" });
    } else {
      await fetch("/api/v1/billing/period-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
    }
    await load();
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Lock className="h-4.5 w-4.5 text-amber-600" />
          Verrouillage de facturation
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Verrouillez un mois pour empêcher toute modification des saisies de temps
          de cette période. Les techniciens verront un message leur demandant de
          saisir leur temps dans le mois courant.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-5 py-8 text-center text-[13px] text-slate-400">Chargement…</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {months.map((period) => {
                const lock = locks.find((l) => l.period === period);
                const isLocked = !!lock;
                const isBusy = busy === period;
                return (
                  <div
                    key={period}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isLocked
                            ? "bg-red-100 text-red-600"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {isLocked ? <Lock className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">
                          {formatPeriod(period)}
                        </p>
                        {isLocked && lock && (
                          <p className="text-[11px] text-slate-500">
                            Verrouillé le {new Date(lock.lockedAt).toLocaleDateString("fr-CA")} par{" "}
                            {lock.user.firstName} {lock.user.lastName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isLocked ? (
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                          <AlertTriangle className="h-3 w-3" />
                          Verrouillé
                        </span>
                      ) : (
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Ouvert
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant={isLocked ? "outline" : "default"}
                        onClick={() => toggleLock(period)}
                        disabled={isBusy}
                        className={isLocked ? "" : "bg-red-600 hover:bg-red-700 text-white"}
                      >
                        {isBusy ? (
                          "…"
                        ) : isLocked ? (
                          <>
                            <Unlock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Déverrouiller</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Verrouiller</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg bg-amber-50/60 border border-amber-200/60 px-4 py-3 text-[12px] text-amber-900">
        <strong>Note :</strong> seuls les 12 derniers mois sont affichés. Le verrouillage
        est global — il s&apos;applique à tous les techniciens et toutes les organisations.
        Le mois en cours ne peut pas être verrouillé.
      </div>
    </div>
  );
}
