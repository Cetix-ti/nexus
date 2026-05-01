"use client";

// ============================================================================
// TicketPresenceStack — pile compacte d'avatars indiquant les autres
// agents qui consultent le même ticket en ce moment.
//
// Flux :
//   - Mount : POST /viewers (heartbeat initial) + GET (load viewers)
//   - Toutes les 15s : POST + GET (heartbeat + refresh)
//   - Unmount : DELETE /viewers (cleanup propre)
//
// Affichage :
//   - Aucun viewer → composant absent (pas de chrome inutile)
//   - 1-3 viewers → avatars empilés avec tooltip (nom)
//   - 4+ viewers → 3 avatars + badge +N
// ============================================================================

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

interface ViewerInfo {
  userId: string;
  name: string;
  avatar: string | null;
  lastSeenAt: string;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

export function TicketPresenceStack({ ticketId }: { ticketId: string }) {
  const [viewers, setViewers] = useState<ViewerInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        // Heartbeat : signale notre présence ET refresh la liste des autres.
        // On ignore les erreurs réseau silencieusement — la présence n'est
        // pas critique, on retentera au prochain cycle.
        await fetch(`/api/v1/tickets/${ticketId}/viewers`, {
          method: "POST",
          cache: "no-store",
        }).catch(() => {});
        const r = await fetch(`/api/v1/tickets/${ticketId}/viewers`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && Array.isArray(d.viewers)) {
          setViewers(d.viewers as ViewerInfo[]);
        }
      } catch {
        // ignore
      }
    }

    void tick();
    timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      // Cleanup au unmount — supprime notre entrée pour que les autres
      // viewers ne nous voient plus immédiatement (au lieu d'attendre
      // que la fenêtre 30s expire).
      fetch(`/api/v1/tickets/${ticketId}/viewers`, {
        method: "DELETE",
        cache: "no-store",
        keepalive: true, // permet l'envoi pendant la navigation
      }).catch(() => {});
    };
  }, [ticketId]);

  if (viewers.length === 0) return null;

  const visible = viewers.slice(0, 3);
  const overflow = viewers.length - visible.length;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-1 text-[11px] text-amber-900"
      title={
        viewers.length === 1
          ? `${viewers[0].name} consulte aussi ce ticket`
          : `${viewers.length} agents consultent ce ticket : ${viewers.map((v) => v.name).join(", ")}`
      }
    >
      <Eye className="h-3 w-3 shrink-0" />
      <div className="flex -space-x-1.5">
        {visible.map((v) => (
          <Avatar key={v.userId} viewer={v} />
        ))}
        {overflow > 0 ? (
          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[9px] font-semibold text-amber-900 ring-2 ring-amber-50">
            +{overflow}
          </div>
        ) : null}
      </div>
      <span className="font-medium hidden sm:inline">
        {viewers.length === 1
          ? `${viewers[0].name.split(" ")[0]} consulte aussi`
          : `${viewers.length} agents`}
      </span>
    </div>
  );
}

function Avatar({ viewer }: { viewer: ViewerInfo }) {
  const initials = viewer.name
    .split(" ")
    .map((s) => s[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  if (viewer.avatar) {
    return (
      <img
        src={viewer.avatar}
        alt={viewer.name}
        className="h-5 w-5 rounded-full ring-2 ring-amber-50 object-cover"
      />
    );
  }
  return (
    <div className="h-5 w-5 rounded-full bg-amber-200 text-amber-900 text-[9px] font-semibold flex items-center justify-center ring-2 ring-amber-50">
      {initials}
    </div>
  );
}
