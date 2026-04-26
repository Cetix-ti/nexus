"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, Clock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  TIME_TYPE_ICONS,
  type TimeType,
  type TimeEntry,
} from "@/lib/billing/types";
import { decideBilling } from "@/lib/billing/engine";
import { mockBillingProfiles, mockContracts } from "@/lib/billing/mock-data";
import { CoverageBadge } from "./coverage-badge";
import {
  loadWorkTypes,
  type WorkTypeOption,
  type RateTierOption,
} from "./client-billing-overrides-section";

interface AddTimeModalProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  onSave: (entry: TimeEntry) => void | Promise<void>;
  /**
   * Saisie à éditer. Quand défini, la modale pré-remplit tous ses champs
   * depuis cette entrée au lieu d'utiliser les valeurs par défaut.
   */
  editingEntry?: TimeEntry | null;
}

const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

function todayISODate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function diffMinutes(date: string, start: string, end: string): number {
  if (!date || !start || !end) return 0;
  const s = new Date(`${date}T${start}:00`).getTime();
  const e = new Date(`${date}T${end}:00`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
}

export function AddTimeModal({
  open,
  onClose,
  ticketId,
  ticketNumber,
  organizationId,
  organizationName,
  onSave,
  editingEntry,
}: AddTimeModalProps) {
  const isEditing = !!editingEntry;
  // Types de travail filtrés pour cette organisation (configurés dans
  // Organisations → Facturation → "Types de travail"). Fallback au
  // catalogue complet si aucun n'est configuré.
  // On relit le localStorage chaque fois que la modale devient visible,
  // sinon une config faite dans un autre onglet n'est pas reflétée ici
  // tant que la page n'est pas rechargée (la modale reste montée entre
  // deux ouvertures).
  // Les libellés client viennent maintenant de la DB via /api/v1/organizations/[id]/work-types.
  // On garde un fallback localStorage pour ne pas casser l'UX si l'API
  // tarde à répondre, mais le serveur source de vérité est la table
  // OrgWorkType.
  const [workTypes, setWorkTypesState] = useState<WorkTypeOption[]>(() =>
    loadWorkTypes(organizationId),
  );
  const [workTypeId, setWorkTypeId] = useState<string>(
    () => loadWorkTypes(organizationId)[0]?.id ?? "",
  );

  // Paliers tarifaires — axe "combien". Chargés depuis la DB.
  const [rateTiers, setRateTiers] = useState<RateTierOption[]>([]);
  const [rateTierId, setRateTierId] = useState<string>("");

  /** Charge la liste des libellés via l'API DB. Fallback silencieux sur le
   *  cache localStorage si l'API échoue (mode offline / restart serveur). */
  const reloadWorkTypes = React.useCallback(async () => {
    try {
      const [wtRes, rtRes] = await Promise.all([
        fetch(`/api/v1/organizations/${organizationId}/work-types`, { cache: "no-store" }),
        fetch(`/api/v1/organizations/${organizationId}/rate-tiers`, { cache: "no-store" }),
      ]);
      if (wtRes.ok) {
        const json = await wtRes.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        const mapped: WorkTypeOption[] = rows.map((w: { id: string; label: string; timeType: WorkTypeOption["timeType"] }) => ({
          id: w.id,
          label: w.label,
          timeType: w.timeType,
        }));
        setWorkTypesState(mapped);
        setWorkTypeId((prev) => (mapped.find((w) => w.id === prev) ? prev : mapped[0]?.id ?? ""));
      }
      if (rtRes.ok) {
        const json = await rtRes.json();
        const rows = Array.isArray(json?.data) ? json.data : [];
        const mapped: RateTierOption[] = rows.map((t: { id: string; label: string; hourlyRate: number }) => ({
          id: t.id,
          label: t.label,
          hourlyRate: t.hourlyRate,
        }));
        setRateTiers(mapped);
        setRateTierId((prev) => (mapped.find((t) => t.id === prev) ? prev : mapped[0]?.id ?? ""));
      }
    } catch {
      // ignore
    }
  }, [organizationId]);

  useEffect(() => {
    if (!open) return;
    reloadWorkTypes();
    // En édition, on restaure le type de travail de la saisie au sein de
    // la liste fraîche.
    if (editingEntry) {
      // Sera ajusté quand reloadWorkTypes() résout.
      const list = loadWorkTypes(organizationId);
      const match = list.find((w) => w.timeType === editingEntry.timeType);
      if (match) setWorkTypeId(match.id);
    }
  }, [open, organizationId, editingEntry, reloadWorkTypes]);
  const selectedWorkType =
    workTypes.find((w) => w.id === workTypeId) ?? workTypes[0];
  const timeType: TimeType = selectedWorkType?.timeType ?? "remote_work";
  const [date, setDate] = useState(todayISODate());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [manualMode, setManualMode] = useState(true);
  const [manualMinutes, setManualMinutes] = useState(60);
  const [description, setDescription] = useState("");
  // Sur place est dérivé du type de travail sélectionné.
  const isOnsite = selectedWorkType?.timeType === "onsite_work";
  // Horaire : Jour par défaut. Les toggles De soir / Weekend peuvent
  // coexister (ex. samedi soir).
  const [isAfterHours, setIsAfterHours] = useState(false);
  const [isWeekend, setIsWeekend] = useState(false);
  const [forceNonBillable, setForceNonBillable] = useState(false);
  const [hasTravelBilled, setHasTravelBilled] = useState(false);
  // Temps de trajet (minutes) quand un déplacement est facturé. Synchronisé
  // avec l'onglet Déplacements du ticket (même donnée en source unique).
  const [travelDurationMinutes, setTravelDurationMinutes] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Pré-remplissage des champs depuis l'entrée à éditer. Déclenché quand
  // la modale s'ouvre en mode édition OU quand l'entrée passée change
  // (ex. l'utilisateur clique sur une autre ligne sans fermer).
  useEffect(() => {
    if (!open) return;
    if (!editingEntry) {
      // Création : réinitialise aux valeurs par défaut pour ne pas
      // conserver celles d'une précédente édition.
      setDate(todayISODate());
      setStartTime("09:00");
      setEndTime("10:00");
      setManualMode(true);
      setManualMinutes(60);
      setDescription("");
      setIsAfterHours(false);
      setIsWeekend(false);
      setForceNonBillable(false);
      setHasTravelBilled(false);
      setTravelDurationMinutes("");
      return;
    }
    // Édition : on reconstitue date/heure depuis startedAt/endedAt.
    const start = new Date(editingEntry.startedAt);
    const end = editingEntry.endedAt ? new Date(editingEntry.endedAt) : null;
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, "0");
    const dd = String(start.getDate()).padStart(2, "0");
    setDate(`${yyyy}-${mm}-${dd}`);
    setStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
    if (end) {
      setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
      setManualMode(false);
    } else {
      setManualMode(true);
    }
    setManualMinutes(editingEntry.durationMinutes);
    setDescription(editingEntry.description ?? "");
    setIsAfterHours(!!editingEntry.isAfterHours);
    setIsWeekend(!!editingEntry.isWeekend);
    setHasTravelBilled(!!editingEntry.hasTravelBilled);
    setTravelDurationMinutes(
      editingEntry.travelDurationMinutes != null ? editingEntry.travelDurationMinutes : "",
    );
    // "Forcer non facturable" n'est pas stocké — on le dérive du statut
    // de couverture (non_billable) pour préserver le choix de l'utilisateur.
    setForceNonBillable(editingEntry.coverageStatus === "non_billable");
  }, [open, editingEntry]);

  // Détection de déplacements déjà facturés ce même jour pour cette org.
  // Rechargé quand la date ou l'org change. Non-bloquant : si l'API échoue
  // on affiche juste pas d'avertissement.
  const [travelConflicts, setTravelConflicts] = useState<Array<{
    id: string;
    ticketId: string;
    ticketNumber: number | null;
    ticketSubject: string | null;
    agentName: string | null;
    startedAt: string;
  }>>([]);
  useEffect(() => {
    if (!organizationId || !date) { setTravelConflicts([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/v1/time-entries/travel-conflicts?orgId=${organizationId}&date=${date}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setTravelConflicts(d?.conflicts ?? []))
      .catch(() => { /* silent — non-bloquant */ });
    return () => ctrl.abort();
  }, [organizationId, date]);

  // Load current user name + role (le rôle détermine si on peut saisir
  // au nom d'un autre agent — réservé aux SUPERVISOR+).
  const [currentUserName, setCurrentUserName] = useState("—");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [canSaisieOnBehalf, setCanSaisieOnBehalf] = useState(false);
  useEffect(() => {
    fetch("/api/v1/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.firstName) setCurrentUserName(`${d.firstName} ${d.lastName}`);
      if (d?.id) setCurrentUserId(d.id);
      const r = d?.role as string | undefined;
      setCanSaisieOnBehalf(r === "SUPER_ADMIN" || r === "MSP_ADMIN" || r === "SUPERVISOR");
    }).catch(() => {});
  }, []);

  // Liste des agents (SUPERVISOR+ → on peut saisir pour eux). Chargée
  // uniquement si l'utilisateur a le droit, pour ne pas faire un appel
  // /users inutile aux techniciens standards.
  const [assignableAgents, setAssignableAgents] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  useEffect(() => {
    if (!canSaisieOnBehalf) return;
    fetch("/api/v1/users?role=SUPER_ADMIN,MSP_ADMIN,SUPERVISOR,TECHNICIAN")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d)) setAssignableAgents(d);
      })
      .catch(() => {});
  }, [canSaisieOnBehalf]);

  // Agent sur lequel on saisit le temps. Par défaut = soi-même. Quand le
  // user a le droit de saisir au nom d'un autre, ce select prend le focus.
  const [onBehalfOfAgentId, setOnBehalfOfAgentId] = useState<string>("");
  useEffect(() => {
    // Initialise sur soi-même quand l'id current est connu.
    if (currentUserId && !onBehalfOfAgentId) setOnBehalfOfAgentId(currentUserId);
  }, [currentUserId, onBehalfOfAgentId]);

  // Load billing profile for this org from API
  const [billingData, setBillingData] = useState<{ baseProfile: any; override: any; resolved: any } | null>(null);
  useEffect(() => {
    if (organizationId) {
      fetch(`/api/v1/organizations/${organizationId}/billing`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.data) setBillingData(d.data); })
        .catch(() => {});
    }
  }, [organizationId]);

  // Load contracts for this org
  const [orgContracts, setOrgContracts] = useState<any[]>([]);
  useEffect(() => {
    if (organizationId) {
      fetch(`/api/v1/contracts?organizationId=${organizationId}`)
        .then((r) => r.ok ? r.json() : [])
        .then((d) => setOrgContracts(Array.isArray(d) ? d : []))
        .catch(() => setOrgContracts([]));
    }
  }, [organizationId]);

  const durationMinutes = manualMode
    ? manualMinutes
    : diffMinutes(date, startTime, endTime);

  const billingProfile = billingData?.resolved ?? billingData?.baseProfile ?? mockBillingProfiles[0];
  const contract = useMemo(
    () => orgContracts.length > 0 ? orgContracts[0] : mockContracts.find((c) => c.organizationId === organizationId),
    [organizationId, orgContracts]
  );

  const decision = useMemo(() => {
    if (durationMinutes <= 0) return null;
    return decideBilling({
      timeType,
      durationMinutes,
      isOnsite,
      isAfterHours,
      isWeekend,
      isUrgent: false,
      organizationId,
      contract,
      billingProfile,
      forceNonBillable,
    });
  }, [
    timeType,
    durationMinutes,
    isOnsite,
    isAfterHours,
    isWeekend,
    organizationId,
    contract,
    billingProfile,
    forceNonBillable,
  ]);

  if (!open) return null;

  function reset() {
    const first = workTypes[0]?.id ?? "";
    setWorkTypeId(first);
    setDate(todayISODate());
    setStartTime("09:00");
    setEndTime("10:00");
    setManualMode(false);
    setManualMinutes(60);
    setDescription("");
    setIsAfterHours(false);
    setIsWeekend(false);
    setForceNonBillable(false);
    setHasTravelBilled(false);
    setTravelDurationMinutes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Guard contre double-submit : sans ça, un double-clic rapide ou un
    // appui répété sur Enter produisait deux POST identiques (on a constaté
    // plusieurs doublons en base).
    if (submitting) return;
    if (!decision || durationMinutes <= 0) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const startedAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endedAt = manualMode
        ? undefined
        : new Date(`${date}T${endTime}:00`).toISOString();
      const entry: TimeEntry = {
        id: `te_${Date.now()}`,
        ticketId,
        ticketNumber,
        organizationId,
        organizationName,
        contractId: contract?.id,
        agentId: onBehalfOfAgentId || currentUserId || "usr_current",
        agentName: (() => {
          if (!onBehalfOfAgentId || onBehalfOfAgentId === currentUserId) return currentUserName;
          const a = assignableAgents.find((u) => u.id === onBehalfOfAgentId);
          return a ? `${a.firstName} ${a.lastName}` : currentUserName;
        })(),
        timeType,
        startedAt,
        endedAt,
        durationMinutes,
        description,
        isAfterHours,
        isWeekend,
        isUrgent: false,
        isOnsite,
        hasTravelBilled,
        travelDurationMinutes: hasTravelBilled && typeof travelDurationMinutes === "number" && travelDurationMinutes > 0
          ? travelDurationMinutes
          : null,
        // Preview seulement — le serveur recalcule autoritairement via
        // resolveDecisionForEntry(). On l'envoie pour compat mais le POST
        // remplace ces 4 champs par la décision serveur.
        coverageStatus: decision.status,
        coverageReason: decision.reason,
        hourlyRate: decision.rate,
        amount: decision.amount,
        approvalStatus: "draft",
        createdAt: now,
        updatedAt: now,
        // Flag transmis au serveur pour qu'il honore le toggle "Forcer non
        // facturable" dans sa revalidation.
        ...(forceNonBillable ? { forceNonBillable: true } as any : {}),
        // Type de prestation choisi (axe "quoi" — drive isOnsite/coverage).
        ...(workTypeId ? { workTypeId } as any : {}),
        // Palier tarifaire choisi (axe "combien" — drive le taux horaire).
        ...(rateTierId ? { rateTierId } as any : {}),
        // Saisie au nom d'un autre agent — le serveur vérifie le rôle.
        ...(onBehalfOfAgentId && onBehalfOfAgentId !== currentUserId
          ? ({ onBehalfOfAgentId } as any)
          : {}),
      };
      // Awaité : sans await, on fermait la modale avant que le POST ait
      // rendu, et l'utilisateur pouvait ré-ouvrir puis re-poster.
      await onSave(entry);
      // La décrémentation du solde de banque d'heures est maintenant
      // faite côté serveur dans createTimeEntry(). Pas de double-compte.
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-3xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Clock className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {isEditing ? "Modifier la saisie de temps" : "Ajouter du temps"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Ticket {ticketNumber} — {organizationName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Type de travail
            </label>
            {workTypes.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Aucun type de travail configuré pour ce client. Configure-les
                dans Organisations → Facturation → Types de travail.
              </p>
            ) : (
              <Select value={workTypeId} onValueChange={setWorkTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workTypes.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {TIME_TYPE_ICONS[w.timeType]} {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {rateTiers.length > 0 ? (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Palier tarifaire
              </label>
              <Select value={rateTierId} onValueChange={setRateTierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rateTiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} — {t.hourlyRate.toFixed(2)} $/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {canSaisieOnBehalf && assignableAgents.length > 0 ? (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Saisir au nom de
              </label>
              <Select value={onBehalfOfAgentId} onValueChange={setOnBehalfOfAgentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.firstName} {a.lastName}
                      {a.id === currentUserId ? " (moi)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onBehalfOfAgentId && onBehalfOfAgentId !== currentUserId ? (
                <p className="mt-1 text-[11.5px] text-amber-700">
                  La saisie sera créée au nom de l&apos;agent sélectionné, pas le vôtre.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="flex items-end justify-end">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60">
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                    !manualMode ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500"
                  )}
                >
                  Plage horaire
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[11.5px] font-medium transition-all",
                    manualMode ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60" : "text-slate-500"
                  )}
                >
                  Durée manuelle
                </button>
              </div>
            </div>
          </div>

          {!manualMode ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Heure de début
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Heure de fin
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Durée (minutes)
              </label>
              <Input
                type="number"
                min={1}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(Number(e.target.value) || 0)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setManualMinutes(m)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                      manualMinutes === m
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Description du travail <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Décrivez le travail effectué..."
              className={cn(
                "w-full rounded-lg border bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 resize-none",
                description.trim()
                  ? "border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                  : "border-amber-300 focus:border-amber-500 focus:ring-amber-500/20",
              )}
              required
            />
          </div>

          {/* Horaire : Jour par défaut. De soir et Weekend sont des
              cases à cocher qui peuvent coexister (ex : samedi soir). */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Horaire
              </span>
              {!isAfterHours && !isWeekend && (
                <span className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">
                  Jour (par défaut)
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">De soir</span>
                <Switch checked={isAfterHours} onCheckedChange={setIsAfterHours} />
              </label>
              <label className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">Weekend</span>
                <Switch checked={isWeekend} onCheckedChange={setIsWeekend} />
              </label>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 space-y-1">
              <label className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">Facturer un déplacement</span>
                <Switch
                  checked={hasTravelBilled}
                  onCheckedChange={(v) => {
                    setHasTravelBilled(v);
                    // Si on désactive, efface la durée de trajet.
                    if (!v) setTravelDurationMinutes("");
                  }}
                />
              </label>
              {hasTravelBilled && (
                <div className="px-2 py-1.5">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] text-slate-700">
                      Temps de trajet (A/R) — minutes
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={24 * 60}
                      step={5}
                      value={travelDurationMinutes === "" ? "" : travelDurationMinutes}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTravelDurationMinutes(v === "" ? "" : Math.max(0, Number(v) || 0));
                      }}
                      placeholder="Ex : 45"
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] text-slate-900 text-right focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </label>
                  <p className="mt-1 text-[10.5px] text-slate-500 leading-relaxed">
                    Synchronisé avec l&apos;onglet <strong>Déplacements</strong> du ticket —
                    une seule saisie, visible des deux côtés.
                  </p>
                </div>
              )}
              <label className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">Forcer non-facturable</span>
                <Switch checked={forceNonBillable} onCheckedChange={setForceNonBillable} />
              </label>
            </div>
          </div>

          {/* Avertissement : un autre technicien a déjà facturé un déplacement
              chez ce client le même jour. Laisse la décision à l'utilisateur. */}
          {travelConflicts.length > 0 && hasTravelBilled && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 text-amber-600 mt-0.5">⚠️</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-amber-900">
                    Déplacement déjà facturé ce jour-là chez {organizationName}
                  </div>
                  <ul className="mt-1.5 space-y-1 text-[12.5px] text-amber-900">
                    {travelConflicts.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{c.agentName ?? "Technicien inconnu"}</span>
                        <span className="text-amber-700">·</span>
                        <span>
                          Ticket{" "}
                          {c.ticketNumber != null ? `#${c.ticketNumber}` : c.ticketId.slice(0, 8)}
                          {c.ticketSubject ? ` — ${c.ticketSubject}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] text-amber-800">
                    Vérifiez avec votre collègue avant de facturer un second déplacement. Décochez le toggle ci-dessus si non applicable.
                  </p>
                </div>
              </div>
            </div>
          )}

          {decision && (
            <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  Couverture
                </h3>
                <CoverageBadge status={decision.status} reason={decision.reason} />
              </div>
              <p className="text-[12.5px] text-slate-600 leading-relaxed">
                {decision.reason}
              </p>
              <div className="mt-3 flex items-center gap-4 text-[12px] text-slate-500">
                <span>
                  Durée :{" "}
                  <span className="font-semibold text-slate-900">
                    {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}min
                  </span>
                </span>
              </div>
              {/*
                Confidentialité : taux horaire et montants ne sont JAMAIS affichés
                dans l'interface ticket. Ils restent dans la section dédiée
                « Facturation » accessible uniquement aux rôles facturation /
                admin (cf. (app)/billing).
              */}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 flex-wrap">
            <div className="text-[11.5px] text-slate-500 min-w-0">
              {durationMinutes <= 0 && (
                <span className="text-amber-700">
                  La durée doit être supérieure à 0 {manualMode ? "minute" : "— vérifie l'heure de début/fin"}.
                </span>
              )}
              {durationMinutes > 0 && !description.trim() && (
                <span className="text-amber-700">
                  Ajoute une description pour pouvoir enregistrer.
                </span>
              )}
              {durationMinutes > 0 && description.trim() && !decision && (
                <span className="text-amber-700">
                  Impossible de calculer la couverture pour cette saisie.
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting || durationMinutes <= 0 || !description.trim() || !decision}
              >
                <Save className="h-4 w-4" strokeWidth={2.5} />
                {isEditing ? "Enregistrer les modifications" : "Enregistrer"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
