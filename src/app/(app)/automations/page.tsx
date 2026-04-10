"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Zap,
  Play,
  CheckCircle2,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Bell,
  UserPlus,
  AlertTriangle,
  Mail,
  Tag,
  Clock,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AutomationRuleModal } from "@/components/automations/automation-rule-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerIcon: React.ElementType;
  conditions: string;
  actions: string;
  active: boolean;
  executions: number;
  lastExecuted: string;
}

// ---------------------------------------------------------------------------
// Trigger icon mapping
// ---------------------------------------------------------------------------

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  ticket_created: Zap,
  sla_breached: Clock,
  sla_warning: ShieldAlert,
  status_changed: ArrowRightLeft,
  scheduled: Clock,
  organization_created: Mail,
  assigned: UserPlus,
  tagged: Tag,
  notification: Bell,
};

function triggerIconFor(trigger: string): React.ElementType {
  return TRIGGER_ICONS[trigger] ?? Zap;
}

function formatJsonField(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    return entries.map(([, v]) => String(v)).join(", ") || "—";
  }
  return "—";
}

// ---------------------------------------------------------------------------
// Trigger icon mapping
// ---------------------------------------------------------------------------

function TriggerBadge({ trigger, Icon }: { trigger: string; Icon: React.ElementType }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
      <Icon className="h-3 w-3" />
      {trigger}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/v1/automations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data)) return;
        setRules(
          data.map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ""),
            description: String(r.description ?? ""),
            trigger: String(r.trigger ?? ""),
            triggerIcon: triggerIconFor(String(r.trigger ?? "")),
            conditions: formatJsonField(r.conditions),
            actions: formatJsonField(r.actions),
            active: Boolean(r.isActive ?? r.active),
            executions: Number(r.executions ?? 0),
            lastExecuted: r.lastExecutedAt
              ? new Date(String(r.lastExecutedAt)).toLocaleString("fr-CA")
              : "Jamais exécutée",
          }))
        );
      })
      .catch((e) => console.error("automations load failed", e))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = rules.filter((r) => r.active).length;
  const totalExecutions = rules.reduce((sum, r) => sum + r.executions, 0);
  const successRate = 98.7;

  function toggleRule(id: string) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r))
    );
  }

  function saveRule(r: AutomationRule) {
    setRules((prev) => {
      const exists = prev.some((p) => p.id === r.id);
      if (exists) return prev.map((p) => (p.id === r.id ? r : p));
      return [r, ...prev];
    });
  }

  function deleteRule(id: string) {
    if (!confirm("Supprimer cette règle d'automatisation ?")) return;
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900">
            Automatisations
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Automatisez les tâches répétitives de votre service desk
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle règle
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Règles actives</p>
              <p className="text-xl font-bold text-neutral-900">
                {activeCount}{" "}
                <span className="text-sm font-normal text-neutral-400">
                  / {rules.length}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Play className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Exécutions (30j)</p>
              <p className="text-xl font-bold text-neutral-900">{totalExecutions}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <CheckCircle2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-neutral-500">Taux de succès</p>
              <p className="text-xl font-bold text-neutral-900">{successRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rule Cards */}
      <div className="space-y-4">
        {rules.map((rule) => (
          <Card
            key={rule.id}
            className={rule.active ? "" : "opacity-60"}
          >
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {/* Left: Rule info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-neutral-900">
                      {rule.name}
                    </h3>
                    <Badge variant={rule.active ? "success" : "default"}>
                      {rule.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-neutral-500">{rule.description}</p>

                  {/* Trigger */}
                  <div>
                    <TriggerBadge trigger={rule.trigger} Icon={rule.triggerIcon} />
                  </div>

                  {/* Conditions */}
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Si
                    </span>
                    <p className="text-sm text-neutral-600">{rule.conditions}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Alors
                    </span>
                    <p className="text-sm text-neutral-600">{rule.actions}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      {rule.executions} exécutions
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {rule.lastExecuted}
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">
                      {rule.active ? "Activée" : "Désactivée"}
                    </span>
                    <Switch
                      checked={rule.active}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AutomationRuleModal
        open={!!editing || creating}
        rule={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSave={saveRule}
      />
    </div>
  );
}
