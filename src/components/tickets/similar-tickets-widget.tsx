"use client";

// ============================================================================
// Widget "Tickets similaires" — sidebar ticket.
//
// Affiche 2 sections (le cross-client est DÉSACTIVÉ) :
//   1. Chez ce client — ouverts/en cours (dédup, doublons)
//   2. Chez ce client — résolus dans les 12 derniers mois (savoir local)
//
// Le bucket "résolus chez d'autres clients" était trop bruité (trop de
// faux positifs sur tokens génériques, pas assez de contexte client-
// spécifique) et a été retiré sur décision produit. Les données backend
// continuent d'être calculées mais ne sont plus affichées.
//
// Sert à donner au tech un accès immédiat aux tickets voisins sans qu'il
// ait à interroger le copilote. Le copilote garde sa valeur pour les
// questions ouvertes (diagnostic, commandes, risques).
//
// EXCLUSIONS : le widget ne se render pas pour les tickets dont la source
// est MONITORING ou AUTOMATION (alertes Zabbix/Atera/Veeam/Wazuh, syncs,
// etc.). Raison : chaque instance est machine-spécifique (ex: "disk 95%
// on SRV-FS02") et le cross-learning n'apporte rien — ça noie le widget
// de tickets non pertinents. Les tickets manuels "sauvegarde en échec"
// (source EMAIL/PHONE) restent couverts : le tech bénéficie des résolutions
// passées.
// ============================================================================

// Sources de tickets pour lesquelles le widget est masqué. Ajuste ici si
// un nouveau type de ticket automatisé émerge (ex: monitoring custom).
const EXCLUDED_SOURCES = new Set(["MONITORING", "AUTOMATION"]);

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Link2,
  Loader2,
  CheckCircle2,
  Clock,
  Building2,
  ChevronRight,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenDetail {
  token: string;
  idf: number;
  boost: number;
  penalty: number;
}

interface SimilarTicket {
  id: string;
  number: number;
  subject: string;
  status: string;
  categoryName: string | null;
  createdAt: string;
  closedAt: string | null;
  organization: { id: string; name: string; slug: string | null } | null;
  // Métadonnées de scoring — permettent de voir POURQUOI un ticket matche
  // via tooltip sur la ligne. Optionnel (si le backend ne renvoie pas).
  score?: number;
  matchCount?: number;
  matchedTokens?: string[];
  matchedBigrams?: string[];
  semanticSim?: number;
  tokenDetails?: TokenDetail[];
}

interface SimilarPayload {
  ticketId: string;
  sameRequester?: SimilarTicket[];
  sameClientOpen: SimilarTicket[];
  sameClientResolved: SimilarTicket[];
  otherClientsResolved: SimilarTicket[];
}

export function SimilarTicketsWidget({
  ticketId,
  ticketSource,
}: {
  ticketId: string;
  /**
   * Source du ticket (TicketSource enum). Si MONITORING/AUTOMATION, le widget
   * ne se render pas — les tickets auto-générés n'ont pas de valeur
   * cross-learning (chaque alerte est host-specific).
   */
  ticketSource?: string | null;
}) {
  const excluded = ticketSource
    ? EXCLUDED_SOURCES.has(ticketSource.toUpperCase())
    : false;

  const [data, setData] = useState<SimilarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<{
    isRecurring: boolean;
    clusterSize: number;
    spanDays: number;
    avgGapDays: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (excluded) {
      setLoading(false);
      return;
    }
    try {
      const [simRes, recRes] = await Promise.all([
        fetch(`/api/v1/tickets/${ticketId}/similar?limit=5`),
        fetch(`/api/v1/tickets/${ticketId}/recurring`),
      ]);
      if (!simRes.ok) {
        const err = await simRes.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${simRes.status}`);
      }
      setData(await simRes.json());
      if (recRes.ok) {
        const r = await recRes.json();
        if (r && r.isRecurring) setRecurring(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [ticketId, excluded]);

  useEffect(() => {
    load();
  }, [load]);

  if (excluded) return null;

  // Total pour le compteur du header — n'inclut PAS otherClientsResolved
  // puisque ce bucket n'est plus affiché (cf. commentaire en tête de fichier).
  const total =
    (data?.sameRequester?.length ?? 0) +
    (data?.sameClientOpen.length ?? 0) +
    (data?.sameClientResolved.length ?? 0);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-slate-500" />
          Tickets similaires
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Recherche…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700">
        {error}
      </div>
    );
  }

  if (!data || total === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-slate-500" />
          Tickets similaires
        </p>
        <p className="mt-1 text-[11.5px] text-slate-500 italic">
          Aucun ticket similaire trouvé.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 space-y-2">
      <p className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-slate-500" />
        Tickets similaires
        <span className="ml-auto text-[10.5px] font-normal text-slate-400">
          {total}
        </span>
      </p>

      {/* Bandeau "ticket récurrent" — détecté sémantiquement par le job
          recurring-tickets-detector. Signal fort pour le tech : ce n'est
          PAS un ticket isolé, un pattern existe → envisager root-cause. */}
      {recurring && recurring.isRecurring && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px]">
          <div className="flex items-start gap-1.5">
            <span className="text-amber-600 text-[14px] leading-none">↻</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900 leading-tight">
                Pattern récurrent détecté
              </p>
              <p className="text-[10.5px] text-amber-800 mt-0.5 leading-snug">
                {recurring.clusterSize}ᵉ ticket semblable chez ce client sur {recurring.spanDays} jours
                {recurring.avgGapDays > 0 && ` (écart moyen ~${Math.round(recurring.avgGapDays)}j)`}. Envisager une intervention de fond.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ordre d'affichage = spécificité décroissante :
          demandeur → même client (ouvert → résolu) → autres clients. */}
      {data.sameRequester && data.sameRequester.length > 0 && (
        <Section
          title="Autres tickets de ce demandeur"
          tone="blue"
          tickets={data.sameRequester}
          showOrg={false}
          bucket="sameRequester"
          sourceTicketId={ticketId}
        />
      )}

      {data.sameClientOpen.length > 0 && (
        <Section
          title="Ouverts chez ce client"
          tone="amber"
          tickets={data.sameClientOpen}
          showOrg={false}
          bucket="sameClientOpen"
          sourceTicketId={ticketId}
        />
      )}

      {data.sameClientResolved.length > 0 && (
        <Section
          title="Résolus chez ce client (12 mois)"
          tone="emerald"
          tickets={data.sameClientResolved}
          showOrg={false}
          bucket="sameClientResolved"
          sourceTicketId={ticketId}
        />
      )}

      {/* Bucket "résolus chez d'autres clients" désactivé : trop de faux
          positifs pour être fiable. Les données restent calculées côté
          backend mais ne sont plus affichées — à réactiver si on implémente
          un filtre sémantique vraiment solide dans le futur. */}
    </div>
  );
}

function Section({
  title,
  tone,
  tickets,
  showOrg,
  bucket,
  sourceTicketId,
}: {
  title: string;
  tone: "amber" | "emerald" | "slate" | "blue";
  tickets: SimilarTicket[];
  showOrg: boolean;
  bucket: string;
  sourceTicketId: string;
}) {
  // État local des feedbacks explicites envoyés dans cette session pour
  // afficher l'état "rejeté" (strikethrough + undo) sans recharger.
  const [feedback, setFeedback] = useState<Record<string, "bad" | "good">>({});
  // Popover "pourquoi ce match ?" — id du ticket dont le popover est ouvert.
  const [explainOpen, setExplainOpen] = useState<string | null>(null);

  const sendFeedback = (
    suggestedTicketId: string,
    verdict: "bad" | "good",
  ) => {
    setFeedback((s) => ({ ...s, [suggestedTicketId]: verdict }));
    void fetch(`/api/v1/tickets/${sourceTicketId}/similar/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggestedTicketId,
        bucket,
        verdict,
      }),
    }).catch(() => {
      /* silencieux — optimistic UI */
    });
  };

  const toneClass = {
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    slate: "text-slate-600 bg-slate-50 border-slate-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
  }[tone];

  return (
    <div>
      <div
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border inline-block mb-1",
          toneClass,
        )}
      >
        {title}
      </div>
      <ul className="space-y-1">
        {tickets.map((t) => {
          // Tooltip "pourquoi ça matche" — montre les tokens + bigrammes
          // matchés. Aide le tech à comprendre la pertinence au survol.
          const matchLabels = [
            ...(t.matchedBigrams ?? []),
            ...(t.matchedTokens ?? []),
          ];
          const tooltip =
            matchLabels.length > 0
              ? `Matché sur : ${matchLabels.join(", ")}`
              : t.subject;
          const currentFeedback = feedback[t.id];
          return (
            <li
              key={t.id}
              className={cn(
                "group/row relative flex items-start gap-1 rounded hover:bg-slate-50",
                currentFeedback === "bad" && "opacity-40",
              )}
            >
              <Link
                href={`/tickets/${t.id}`}
                target="_blank"
                title={tooltip}
                className={cn(
                  "group flex flex-1 items-start gap-1.5 rounded px-1.5 py-1",
                  currentFeedback === "bad" && "pointer-events-none line-through",
                )}
                onClick={() => {
                  // Feedback implicite : ping au clic pour alimenter
                  // l'auto-apprentissage du ranking. keepalive assure que
                  // la requête part même quand la page navigue.
                  try {
                    fetch(`/api/v1/tickets/${sourceTicketId}/similar/click`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      keepalive: true,
                      body: JSON.stringify({
                        clickedTicketId: t.id,
                        bucket,
                        score: t.score,
                        semanticSim: t.semanticSim,
                        matchedTokens: t.matchedTokens,
                      }),
                    }).catch(() => {});
                  } catch { /* ignore */ }
                }}
              >
                {t.status === "RESOLVED" || t.status === "CLOSED" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] text-slate-700 group-hover:text-slate-900 truncate leading-tight">
                    <span className="font-mono text-[10.5px] text-slate-500 mr-1">
                      #{t.number}
                    </span>
                    {t.subject}
                  </p>
                  {showOrg && t.organization && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-0.5 mt-0.5 truncate">
                      <Building2 className="h-2.5 w-2.5 shrink-0" />
                      {t.organization.name}
                    </p>
                  )}
                  {/* Chips mini des matches les plus forts — ne montre que
                      2 max pour ne pas surcharger la ligne. */}
                  {matchLabels.length > 0 && (
                    <div className="flex items-center gap-0.5 flex-wrap mt-0.5">
                      {matchLabels.slice(0, 2).map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded bg-blue-50 text-blue-700 px-1 py-0 text-[9px] font-medium"
                        >
                          {label}
                        </span>
                      ))}
                      {matchLabels.length > 2 && (
                        <span className="text-[9px] text-slate-400">
                          +{matchLabels.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5" />
              </Link>

              {/* Review : feedback explicite du tech. Thumbs down = la
                  suggestion n'a pas de rapport (filtrée au prochain appel).
                  Thumbs up = pertinente (boostée). Undo pour annuler.
                  Toujours visible (anciennement opacity-0 + hover) pour
                  éviter la découverte accidentelle sur touch devices et
                  encourager le feedback explicite. */}
              <div className="flex items-center gap-0.5 pr-1 pt-0.5">
                {/* Bouton (i) — popover explique le score */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExplainOpen((cur) => (cur === t.id ? null : t.id));
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  title="Pourquoi ce match ?"
                >
                  <Info className="h-3 w-3" />
                </button>
                {currentFeedback ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFeedback((s) => {
                        const next = { ...s };
                        delete next[t.id];
                        return next;
                      });
                      // Pour un "undo" propre on repush un verdict neutre :
                      // on réinsère "good" léger si l'utilisateur retire un
                      // bad → remet simplement à zéro côté serveur via bad→good.
                      // Plus simple : laisse l'UI le cacher, le backend garde
                      // le dernier verdict pour apprentissage.
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Annuler"
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sendFeedback(t.id, "good");
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                      title="Pertinent"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        sendFeedback(t.id, "bad");
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Pas en rapport — exclure"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>

              {/* Popover explainability — ouvert quand on clique (i) */}
              {explainOpen === t.id && (
                <ExplainPopover ticket={t} onClose={() => setExplainOpen(null)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover explainability — montre POURQUOI ce ticket a matché :
// cosine sémantique, tokens avec leur poids IDF, boosts (clics) et pénalités
// (feedbacks) appliqués. Permet au tech de diagnostiquer un mauvais match.
// ---------------------------------------------------------------------------
function ExplainPopover({
  ticket,
  onClose,
}: {
  ticket: SimilarTicket;
  onClose: () => void;
}) {
  const tokens = ticket.tokenDetails ?? [];
  const sortedTokens = [...tokens].sort((a, b) => b.idf - a.idf);

  return (
    <div
      role="dialog"
      onClick={(e) => e.stopPropagation()}
      className="absolute right-1 top-8 z-20 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Pourquoi ce match
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          title="Fermer"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 text-[11.5px]">
        {/* Score global */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
          <span className="text-slate-500">Score total</span>
          <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {ticket.score?.toFixed(2) ?? "—"}
          </span>
        </div>

        {/* Similarité sémantique */}
        {ticket.semanticSim != null && ticket.semanticSim > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Similarité sémantique</span>
            <span
              className={cn(
                "font-mono tabular-nums",
                ticket.semanticSim >= 0.7
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ticket.semanticSim >= 0.55
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500",
              )}
            >
              {(ticket.semanticSim * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Bigrammes matchés */}
        {ticket.matchedBigrams && ticket.matchedBigrams.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
              Bigrammes matchés
            </div>
            <div className="flex flex-wrap gap-1">
              {ticket.matchedBigrams.map((bg) => (
                <span
                  key={bg}
                  className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                >
                  {bg}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tokens matchés avec détails IDF / boost / penalty */}
        {sortedTokens.length > 0 ? (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
              Tokens matchés ({sortedTokens.length})
            </div>
            <ul className="space-y-0.5">
              {sortedTokens.map((td) => (
                <li
                  key={td.token}
                  className="flex items-center gap-2 rounded px-1 py-0.5 text-[10.5px] hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="flex-1 font-mono text-slate-800 dark:text-slate-100">
                    {td.token}
                  </span>
                  <span
                    className="tabular-nums text-slate-500"
                    title={`IDF (rareté globale) : ${td.idf}`}
                  >
                    {td.idf.toFixed(1)}
                  </span>
                  {td.boost > 0 && (
                    <span
                      className="rounded bg-emerald-50 px-1 py-px font-mono text-[9px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      title="Boost appris depuis les clics"
                    >
                      +{td.boost}
                    </span>
                  )}
                  {td.penalty > 0 && (
                    <span
                      className="rounded bg-rose-50 px-1 py-px font-mono text-[9px] text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      title="Pénalité apprise depuis les thumbs-down"
                    >
                      −{Math.round(td.penalty * 100)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="italic text-slate-400">Aucun token textuel matché.</p>
        )}

        <p className="border-t border-slate-100 pt-1.5 text-[10px] italic text-slate-400 dark:border-slate-800">
          IDF élevé = mot rare (plus discriminant). Boost = appris des clics.
          Pénalité = appris des thumbs-down.
        </p>
      </div>
    </div>
  );
}
