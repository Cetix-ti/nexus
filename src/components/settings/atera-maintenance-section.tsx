"use client";

// ============================================================================
// Settings → Intégrations → Atera → Maintenance
// ============================================================================
// Page d'administration pour purger les agents Atera inactifs (>365j par
// défaut). 4 onglets :
//   1. Analyse & Purge  — workflow principal
//   2. Historique       — batches passés (audit trail)
//   3. Exclusions       — whitelist d'agents à ne JAMAIS purger
//   4. Destinataires    — emails notifiés après chaque purge
//
// RBAC : super-admin uniquement (vérifié côté serveur ET ici via session).

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  Search,
  ShieldOff,
  Trash2,
  RefreshCw,
  History,
  Mail,
  Loader2,
  ExternalLink,
  X,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ----------------------------------------------------------------------------
// Types (miroir de la lib partagée — gardés ici pour autonomie du composant)
// ----------------------------------------------------------------------------

interface InactiveAgent {
  agentId: number;
  deviceGuid?: string;
  machineName: string;
  customerId: number;
  customerName: string;
  osType: string;
  online: boolean;
  lastActivityAt: string | null;
  lastActivityField: string;
  daysSinceLastSeen: number | null;
  excluded: null | {
    reason: string;
    expiresAt: string | null;
    addedAt: string;
    addedById: string;
  };
  linkedAsset: null | {
    id: string;
    name: string;
    status: string;
    ticketCount: number;
    noteCount: number;
    licenseCount: number;
    hasBlockingLinks: boolean;
  };
}

type LinkedAssetAction = "archive" | "keep" | "delete";

// ----------------------------------------------------------------------------
// Section principale
// ----------------------------------------------------------------------------

export function AteraMaintenanceSection() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as { role?: string } | undefined)?.role === "SUPER_ADMIN";

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <ShieldOff className="h-5 w-5 text-amber-600" />
          <div>
            <strong>Accès refusé.</strong> La maintenance Atera est réservée aux super-administrateurs.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Maintenance Atera</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Identifiez et purgez les agents Atera inactifs depuis longtemps.{" "}
          <strong className="text-foreground">Action irréversible côté Atera</strong> — les agents et leur historique (patches, alertes, scripts) sont retirés du tenant.
        </p>
      </div>

      <Tabs defaultValue="analyze" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="analyze" className="gap-2">
            <Search className="h-4 w-4" /> Analyse & Purge
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Historique
          </TabsTrigger>
          <TabsTrigger value="exclusions" className="gap-2">
            <ShieldOff className="h-4 w-4" /> Exclusions
          </TabsTrigger>
          <TabsTrigger value="recipients" className="gap-2">
            <Mail className="h-4 w-4" /> Destinataires
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="mt-6">
          <AnalyzeTab />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="exclusions" className="mt-6">
          <ExclusionsTab />
        </TabsContent>
        <TabsContent value="recipients" className="mt-6">
          <RecipientsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// ONGLET 1 — ANALYSE & PURGE
// ============================================================================

function AnalyzeTab() {
  const [days, setDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<InactiveAgent[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [assetAction, setAssetAction] = useState<LinkedAssetAction>("archive");
  const [showConfirm, setShowConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    batchId: string;
    okCount: number;
    errorCount: number;
    skippedCount: number;
  } | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    setPurgeResult(null);
    try {
      const res = await fetch(`/api/v1/integrations/atera/inactive?days=${days}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Échec de l'analyse");
      setAgents(json.data.inactive);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Liste filtrée par recherche
  const filtered = useMemo(() => {
    if (!agents) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.machineName.toLowerCase().includes(q) ||
        a.customerName.toLowerCase().includes(q) ||
        a.osType.toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  // Sélectionnables = pas exclus + (si action=delete, pas de liens bloquants)
  const isSelectable = useCallback(
    (a: InactiveAgent) => {
      if (a.excluded) return false;
      if (assetAction === "delete" && a.linkedAsset?.hasBlockingLinks) return false;
      return true;
    },
    [assetAction]
  );

  const selectableInFiltered = useMemo(
    () => filtered.filter(isSelectable),
    [filtered, isSelectable]
  );

  const toggleAll = () => {
    if (selectedIds.size === selectableInFiltered.length && selectableInFiltered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableInFiltered.map((a) => a.agentId)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectedAgents = useMemo(
    () => (agents ?? []).filter((a) => selectedIds.has(a.agentId)),
    [agents, selectedIds]
  );

  const customersImpacted = useMemo(
    () => new Set(selectedAgents.map((a) => a.customerName)).size,
    [selectedAgents]
  );

  const linkedAssetsCount = useMemo(
    () => selectedAgents.filter((a) => !!a.linkedAsset).length,
    [selectedAgents]
  );

  const canSubmit =
    selectedIds.size > 0 && reason.trim().length >= 20 && !purging;

  const executePurge = async (confirmText: string) => {
    if (confirmText !== "SUPPRIMER") return;
    setPurging(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/integrations/atera/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentIds: [...selectedIds],
          reason,
          linkedAssetAction: assetAction,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        throw new Error(
          "Une autre purge est déjà en cours. Réessayez dans quelques minutes."
        );
      }
      if (!json.success) throw new Error(json.error || "Échec de la purge");
      setPurgeResult({
        batchId: json.data.batchId,
        okCount: json.data.okCount,
        errorCount: json.data.errorCount,
        skippedCount: json.data.skippedCount,
      });
      setShowConfirm(false);
      // On retire les agents purgés de la liste affichée
      setAgents((prev) =>
        prev ? prev.filter((a) => !selectedIds.has(a.agentId)) : prev
      );
      setSelectedIds(new Set());
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bandeau configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Critères d&apos;analyse</CardTitle>
          <CardDescription>
            Définissez le seuil d&apos;inactivité, puis lancez l&apos;analyse pour voir les agents candidats à la purge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium block mb-1">
                Seuil d&apos;inactivité (jours)
              </label>
              <Input
                type="number"
                min={30}
                max={3650}
                value={days}
                onChange={(e) => setDays(Math.max(30, Number(e.target.value) || 365))}
                className="w-32"
              />
            </div>
            <Button onClick={analyze} disabled={loading} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? "Analyse en cours…" : "Analyser"}
            </Button>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultat post-purge */}
      {purgeResult && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="text-sm">
              <strong>Purge terminée.</strong>{" "}
              <span className="text-emerald-700">{purgeResult.okCount} supprimés</span>
              {purgeResult.errorCount > 0 && (
                <span className="text-red-700"> · {purgeResult.errorCount} erreurs</span>
              )}
              {purgeResult.skippedCount > 0 && (
                <span className="text-amber-700"> · {purgeResult.skippedCount} skippés</span>
              )}
              <span className="text-muted-foreground ml-2">
                (batch <code className="text-xs">{purgeResult.batchId.slice(0, 8)}</code>)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tableau résultats */}
      {agents !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base">
                  {agents.length} agent{agents.length > 1 ? "s" : ""} inactif
                  {agents.length > 1 ? "s" : ""}
                </CardTitle>
                <CardDescription>
                  Triés du plus ancien au plus récent. Cochez ceux à supprimer.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filtrer (machine, client, OS)…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" size="sm" onClick={analyze} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Recharger
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <AgentsTable
              agents={filtered}
              selectedIds={selectedIds}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
              isSelectable={isSelectable}
              assetAction={assetAction}
            />
          </CardContent>
        </Card>
      )}

      {/* Barre d'action sticky */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-10">
          <Card className="border-red-300 shadow-lg">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <strong>{selectedIds.size}</strong> sélectionné
                  {selectedIds.size > 1 ? "s" : ""} ·{" "}
                  <span className="text-muted-foreground">
                    {customersImpacted} client{customersImpacted > 1 ? "s" : ""} ·{" "}
                    {linkedAssetsCount} asset{linkedAssetsCount > 1 ? "s" : ""} Nexus lié{linkedAssetsCount > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Action sur asset Nexus
                    </label>
                    <Select
                      value={assetAction}
                      onValueChange={(v) => setAssetAction(v as LinkedAssetAction)}
                    >
                      <SelectTrigger className="w-44 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="archive">Archiver (recommandé)</SelectItem>
                        <SelectItem value="keep">Conserver tel quel</SelectItem>
                        <SelectItem value="delete">Supprimer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Raison de la purge (≥ 20 caractères, journalisée pour audit)
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: nettoyage trimestriel des postes décommissionnés > 365 jours"
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Tout désélectionner
                </Button>
                <Button
                  variant="danger"
                  disabled={!canSubmit}
                  onClick={() => setShowConfirm(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer {selectedIds.size} agent{selectedIds.size > 1 ? "s" : ""}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de confirmation */}
      <ConfirmPurgeDialog
        open={showConfirm}
        onClose={() => !purging && setShowConfirm(false)}
        agents={selectedAgents}
        reason={reason}
        assetAction={assetAction}
        purging={purging}
        onConfirm={executePurge}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tableau des agents
// ----------------------------------------------------------------------------

function AgentsTable({
  agents,
  selectedIds,
  onToggleAll,
  onToggleOne,
  isSelectable,
  assetAction,
}: {
  agents: InactiveAgent[];
  selectedIds: Set<number>;
  onToggleAll: () => void;
  onToggleOne: (id: number) => void;
  isSelectable: (a: InactiveAgent) => boolean;
  assetAction: LinkedAssetAction;
}) {
  const sorted = useMemo(
    () =>
      [...agents].sort(
        (a, b) => (b.daysSinceLastSeen ?? 0) - (a.daysSinceLastSeen ?? 0)
      ),
    [agents]
  );

  if (sorted.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Aucun agent à afficher.
      </div>
    );
  }

  const allSelectable = sorted.filter(isSelectable);
  const allSelected =
    allSelectable.length > 0 &&
    allSelectable.every((a) => selectedIds.has(a.agentId));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-3 text-left w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Tout sélectionner"
              />
            </th>
            <th className="p-3 text-left">Machine</th>
            <th className="p-3 text-left">Client</th>
            <th className="p-3 text-left">OS</th>
            <th className="p-3 text-left">Dernière activité</th>
            <th className="p-3 text-right">Jours</th>
            <th className="p-3 text-left">Asset Nexus</th>
            <th className="p-3 text-left">État</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => {
            const selectable = isSelectable(a);
            const selected = selectedIds.has(a.agentId);
            const days = a.daysSinceLastSeen ?? 0;
            const dayColor =
              days >= 730
                ? "text-red-600 font-semibold"
                : days >= 365
                  ? "text-amber-600 font-medium"
                  : "";
            return (
              <tr
                key={a.agentId}
                className={`border-t hover:bg-muted/20 ${selected ? "bg-blue-50/40" : ""} ${a.excluded ? "opacity-60" : ""}`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selected}
                    disabled={!selectable}
                    onCheckedChange={() => onToggleOne(a.agentId)}
                    aria-label={`Sélectionner ${a.machineName}`}
                  />
                </td>
                <td className="p-3 font-medium">
                  {a.machineName}
                  <div className="text-xs text-muted-foreground font-normal">
                    AgentID {a.agentId}
                  </div>
                </td>
                <td className="p-3">{a.customerName}</td>
                <td className="p-3">
                  <Badge variant="outline" className="font-normal">
                    {a.osType}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {a.lastActivityAt
                    ? new Date(a.lastActivityAt).toLocaleDateString("fr-CA")
                    : "—"}
                  <div className="text-xs">{a.lastActivityField}</div>
                </td>
                <td className={`p-3 text-right ${dayColor}`}>{days}</td>
                <td className="p-3">
                  {a.linkedAsset ? (
                    <a
                      href={`/assets/${a.linkedAsset.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <span className="text-xs">
                        {a.linkedAsset.ticketCount}T · {a.linkedAsset.noteCount}N · {a.linkedAsset.licenseCount}L
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  {a.excluded ? (
                    <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700">
                      <ShieldOff className="h-3 w-3 mr-1" /> Exclu
                    </Badge>
                  ) : assetAction === "delete" && a.linkedAsset?.hasBlockingLinks ? (
                    <Badge variant="outline" className="bg-red-50 border-red-300 text-red-700">
                      Liens bloquants
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Purgeable</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Modal de confirmation
// ----------------------------------------------------------------------------

interface ConfirmPurgeDialogProps {
  open: boolean;
  onClose: () => void;
  agents: InactiveAgent[];
  reason: string;
  assetAction: LinkedAssetAction;
  purging: boolean;
  onConfirm: (confirmText: string) => void;
}

/**
 * Wrapper qui rend le body uniquement quand `open=true`. Le remontage
 * réinitialise naturellement `confirmText`, `doubleConfirm`, `timer` —
 * pas besoin d'un `useEffect` pour les reset (ce qui violait la règle
 * react-hooks/set-state-in-effect).
 */
function ConfirmPurgeDialog(props: ConfirmPurgeDialogProps) {
  const { open, onClose, purging } = props;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !purging && onClose()}>
      <DialogContent className="max-w-2xl">
        {open && <ConfirmPurgeDialogBody {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPurgeDialogBody({
  onClose,
  agents,
  assetAction,
  purging,
  onConfirm,
}: ConfirmPurgeDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [doubleConfirm, setDoubleConfirm] = useState(false);
  // Initialisé via le default de useState : pas de setState synchrone en effet.
  const [timer, setTimer] = useState(agents.length > 100 ? 5 : 0);

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer((v) => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [timer]);

  const customersImpacted = useMemo(
    () => new Set(agents.map((a) => a.customerName)).size,
    [agents]
  );
  const linkedAssetsCount = useMemo(
    () => agents.filter((a) => !!a.linkedAsset).length,
    [agents]
  );
  const oldest = useMemo(
    () =>
      [...agents]
        .sort((a, b) => (b.daysSinceLastSeen ?? 0) - (a.daysSinceLastSeen ?? 0))
        .slice(0, 5),
    [agents]
  );
  const newest = useMemo(
    () =>
      [...agents]
        .sort((a, b) => (a.daysSinceLastSeen ?? 0) - (b.daysSinceLastSeen ?? 0))
        .slice(0, 5),
    [agents]
  );

  const overThreshold = agents.length > 100;
  const canConfirm =
    confirmText === "SUPPRIMER" &&
    timer === 0 &&
    (!overThreshold || doubleConfirm) &&
    !purging;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          Confirmer la purge — action irréversible
        </DialogTitle>
        <DialogDescription>
          Vous êtes sur le point de supprimer définitivement{" "}
          <strong>{agents.length}</strong> agent{agents.length > 1 ? "s" : ""} dans Atera.
          Cette opération ne peut pas être annulée.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Agents" value={agents.length} />
            <Stat label="Clients impactés" value={customersImpacted} />
            <Stat label="Assets Nexus liés" value={linkedAssetsCount} />
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-xs">
            <div className="font-semibold mb-1">Action sur assets Nexus :</div>
            <div className="text-muted-foreground">
              {assetAction === "archive" &&
                "Les assets correspondants passent en statut RETIRED (historique préservé)."}
              {assetAction === "keep" &&
                "Les assets restent inchangés côté Nexus (plus de sync auto)."}
              {assetAction === "delete" &&
                "Les assets sans tickets/notes/licences seront supprimés ; ceux avec liens sont automatiquement skippés."}
            </div>
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium">
              Aperçu — 5 plus anciens / 5 plus récents
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-semibold mb-1">Plus anciens</div>
                {oldest.map((a) => (
                  <div key={a.agentId} className="truncate">
                    <span className="font-mono text-muted-foreground">{a.daysSinceLastSeen}j</span>{" "}
                    {a.machineName}
                  </div>
                ))}
              </div>
              <div>
                <div className="font-semibold mb-1">Plus récents</div>
                {newest.map((a) => (
                  <div key={a.agentId} className="truncate">
                    <span className="font-mono text-muted-foreground">{a.daysSinceLastSeen}j</span>{" "}
                    {a.machineName}
                  </div>
                ))}
              </div>
            </div>
          </details>

          <div>
            <label className="block text-sm font-medium mb-1">
              Tapez <code className="bg-muted px-1 rounded">SUPPRIMER</code> pour confirmer
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              className={confirmText === "SUPPRIMER" ? "border-emerald-500" : ""}
              autoFocus
            />
          </div>

          {overThreshold && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <strong>Plus de 100 agents sélectionnés.</strong>
                  {timer > 0 && <div className="text-amber-700 mt-1">Bouton activable dans {timer}s…</div>}
                </div>
              </div>
              <label className="flex items-start gap-2 mt-2 text-sm cursor-pointer">
                <Checkbox
                  checked={doubleConfirm}
                  onCheckedChange={(c) => setDoubleConfirm(!!c)}
                />
                <span>
                  Je confirme avoir vérifié la liste complète et accepte la suppression de masse.
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={purging}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={!canConfirm}
            onClick={() => onConfirm(confirmText)}
            className="gap-2"
          >
            {purging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Suppression en cours…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Confirmer la purge
              </>
            )}
          </Button>
        </DialogFooter>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

// ============================================================================
// ONGLET 2 — HISTORIQUE
// ============================================================================

interface PurgeBatch {
  batchId: string;
  purgedBy: { firstName: string; lastName: string; email: string } | null;
  startedAt: string;
  endedAt: string;
  totalCount: number;
  byStatus: Record<string, number>;
}

function HistoryTab() {
  const [batches, setBatches] = useState<PurgeBatch[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/integrations/atera/purge-log")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setBatches(json.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Chargement de l&apos;historique…
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucune purge n&apos;a encore été effectuée.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Acteur</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">OK</th>
              <th className="p-3 text-right">Erreurs</th>
              <th className="p-3 text-right">Skippés</th>
              <th className="p-3 text-left">Batch</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId} className="border-t hover:bg-muted/20">
                <td className="p-3">
                  {new Date(b.startedAt).toLocaleString("fr-CA")}
                </td>
                <td className="p-3">
                  {b.purgedBy
                    ? `${b.purgedBy.firstName} ${b.purgedBy.lastName}`
                    : "—"}
                </td>
                <td className="p-3 text-right">{b.totalCount}</td>
                <td className="p-3 text-right text-emerald-700">
                  {(b.byStatus.ok ?? 0) + (b.byStatus.already_deleted ?? 0)}
                </td>
                <td className="p-3 text-right text-red-700">
                  {b.byStatus.error ?? 0}
                </td>
                <td className="p-3 text-right text-amber-700">
                  {(b.byStatus.skipped_excluded ?? 0) +
                    (b.byStatus.skipped_blocked_by_links ?? 0)}
                </td>
                <td className="p-3">
                  <code className="text-xs text-muted-foreground">
                    {b.batchId.slice(0, 8)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ONGLET 3 — EXCLUSIONS
// ============================================================================

interface Exclusion {
  id: string;
  agentId: number;
  machineName: string | null;
  customerName: string | null;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  addedBy: { firstName: string; lastName: string; email: string } | null;
}

function ExclusionsTab() {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newMachine, setNewMachine] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/integrations/atera/exclusions");
    const json = await res.json();
    if (json.success) setExclusions(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (agentId: number) => {
    if (!confirm("Retirer cette exclusion ? L'agent redeviendra purgeable.")) return;
    await fetch(`/api/v1/integrations/atera/exclusions/${agentId}`, {
      method: "DELETE",
    });
    load();
  };

  const add = async () => {
    setSaving(true);
    try {
      await fetch("/api/v1/integrations/atera/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: Number(newAgentId),
          machineName: newMachine || undefined,
          reason: newReason,
          expiresAt: newExpiresAt
            ? new Date(newExpiresAt).toISOString()
            : null,
        }),
      });
      setShowAdd(false);
      setNewAgentId("");
      setNewMachine("");
      setNewReason("");
      setNewExpiresAt("");
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Whitelist d&apos;exclusions</CardTitle>
            <CardDescription>
              Agents Atera à NE JAMAIS purger automatiquement (serveurs DR, postes saisonniers, machines en maintenance).
            </CardDescription>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          </div>
        ) : exclusions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Aucune exclusion. Cliquez sur « Ajouter » pour en créer une.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 text-left">AgentID</th>
                <th className="p-3 text-left">Machine</th>
                <th className="p-3 text-left">Raison</th>
                <th className="p-3 text-left">Expire</th>
                <th className="p-3 text-left">Ajoutée par</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {exclusions.map((e) => {
                const expired = e.expiresAt && new Date(e.expiresAt) < new Date();
                return (
                  <tr key={e.id} className="border-t">
                    <td className="p-3 font-mono">{e.agentId}</td>
                    <td className="p-3">{e.machineName || "—"}</td>
                    <td className="p-3 text-muted-foreground">{e.reason}</td>
                    <td className="p-3">
                      {e.expiresAt ? (
                        <span className={expired ? "text-red-600" : ""}>
                          {new Date(e.expiresAt).toLocaleDateString("fr-CA")}
                          {expired && " (expirée)"}
                        </span>
                      ) : (
                        <Badge variant="outline">Permanente</Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {e.addedBy
                        ? `${e.addedBy.firstName} ${e.addedBy.lastName}`
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(e.agentId)}
                        aria-label="Retirer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => !o && setShowAdd(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une exclusion</DialogTitle>
            <DialogDescription>
              L&apos;agent listé ici sera ignoré par toutes les purges futures jusqu&apos;à ce qu&apos;il soit retiré ou que l&apos;exclusion expire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">AgentID Atera *</label>
              <Input
                type="number"
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                placeholder="ex: 1234"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Nom machine (snapshot, optionnel)
              </label>
              <Input
                value={newMachine}
                onChange={(e) => setNewMachine(e.target.value)}
                placeholder="ex: SRV-DR-01"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Raison *</label>
              <Textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Ex: serveur DR, redémarré 1 fois par trimestre"
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Expire le (optionnel)
              </label>
              <Input
                type="date"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Annuler
            </Button>
            <Button
              onClick={add}
              disabled={!newAgentId || newReason.length < 5 || saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// ONGLET 4 — DESTINATAIRES D'ALERTES
// ============================================================================

interface Recipient {
  id: string;
  userId: string | null;
  email: string | null;
  enabled: boolean;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

function RecipientsTab() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [resolvedEmails, setResolvedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v1/integrations/atera/alert-recipients");
    const json = await res.json();
    if (json.success) {
      setRecipients(json.data.recipients);
      setResolvedEmails(json.data.resolvedEmails);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: Recipient[]) => {
    setSaving(true);
    try {
      await fetch("/api/v1/integrations/atera/alert-recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: next.map((r) => ({
            userId: r.userId,
            email: r.email,
            enabled: r.enabled,
          })),
        }),
      });
      load();
    } finally {
      setSaving(false);
    }
  };

  const removeRecipient = (id: string) => {
    save(recipients.filter((r) => r.id !== id));
  };

  const addEmail = () => {
    const email = newEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (recipients.some((r) => r.email === email)) return;
    const next: Recipient[] = [
      ...recipients,
      { id: "new", userId: null, email, enabled: true, user: null },
    ];
    setNewEmail("");
    save(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinataires des alertes Atera</CardTitle>
          <CardDescription>
            Emails notifiés après chaque purge (récap + erreurs). Si la liste est vide, tous les super-admins actifs sont notifiés par défaut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">
                Ajouter un email
              </label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                placeholder="ex: alerts@cetix.ca"
              />
            </div>
            <Button onClick={addEmail} disabled={saving || !newEmail} className="gap-2">
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            </div>
          ) : recipients.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
              Aucun destinataire explicite — fallback automatique sur les super-admins.
            </div>
          ) : (
            <div className="space-y-2">
              {recipients.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <div className="text-sm">
                    {r.user ? (
                      <>
                        <strong>{r.user.firstName} {r.user.lastName}</strong>{" "}
                        <span className="text-muted-foreground">({r.user.email})</span>
                      </>
                    ) : (
                      <span>{r.email}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRecipient(r.id)}
                    disabled={saving}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {resolvedEmails.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-3 text-sm">
            <strong className="text-blue-900">Emails effectivement notifiés :</strong>{" "}
            <span className="text-blue-700">{resolvedEmails.join(", ")}</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
