"use client";

// ============================================================================
// Widget "Tickets exemplaires" — sidebar ticket.
//
// N'apparaît que si l'assigné courant a peu d'expérience (< 5 tickets
// résolus) dans la catégorie du ticket. Affiche les 3-5 tickets exemplaires
// résolus RAPIDEMENT et PROPREMENT par des techs expérimentés.
//
// Objectif : guider sans bloquer. Le tech voit "voici comment d'autres
// techs seniors ont géré des tickets similaires".
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, Loader2, Clock, User } from "lucide-react";

interface Exemplar {
  ticketId: string;
  ticketNumber: number;
  subject: string;
  assigneeName: string;
  resolutionMinutes: number;
  internalCommentChars: number;
  qualityScore: number;
}

interface ApprentiPayload {
  shouldShow: boolean;
  assigneeExperienceInCategory: number;
  exemplars: Exemplar[];
  medianMinutes: number | null;
}

export function ApprentiExemplarsWidget({ ticketId }: { ticketId: string }) {
  const [data, setData] = useState<ApprentiPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/v1/tickets/${ticketId}/apprenti-exemplars`,
        );
        if (!res.ok) return;
        const payload = (await res.json()) as ApprentiPayload;
        if (!cancelled) setData(payload);
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (loading || !data || !data.shouldShow || data.exemplars.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="border-b border-amber-200 px-4 py-2.5 dark:border-amber-900">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Tickets exemplaires
          </span>
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Apprentissage
          </span>
        </div>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Tickets résolus rapidement et proprement par des techs expérimentés
          dans cette catégorie. Inspire-toi de leur approche.
        </p>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-900">
        {data.exemplars.map((e) => (
          <Link
            key={e.ticketId}
            href={`/tickets/${e.ticketId}`}
            className="block px-4 py-3 transition hover:bg-amber-100/50 dark:hover:bg-amber-900/40"
          >
            <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-mono font-medium">#{e.ticketNumber}</span>
              <span className="text-amber-400">•</span>
              <Clock className="h-3 w-3" />
              <span>
                résolu en {formatMinutes(e.resolutionMinutes)}
                {data.medianMinutes
                  ? ` (médiane : ${formatMinutes(data.medianMinutes)})`
                  : ""}
              </span>
            </div>
            <div className="mt-1 truncate text-sm text-slate-800 dark:text-slate-100">
              {e.subject}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <User className="h-3 w-3" />
              <span>par {e.assigneeName}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}
