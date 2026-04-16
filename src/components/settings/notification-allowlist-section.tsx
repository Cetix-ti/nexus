"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ============================================================================
// NOTIFICATION ALLOWLIST SECTION
//
// Garde-fou critique : pendant la cohabitation avec Freshservice sur
// billets@cetix.ca, seuls les courriels de contacts explicitement listés ici
// peuvent recevoir des notifications de Nexus. Les agents (staff Cetix)
// restent toujours notifiés, quelle que soit la configuration.
// ============================================================================

interface AllowlistState {
  enabled: boolean;
  allowedEmails: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export function NotificationAllowlistSection() {
  const [state, setState] = useState<AllowlistState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; msg: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/v1/settings/notification-allowlist")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: AllowlistState) => setState(data))
      .catch((e) => setError(`Chargement impossible (${e})`))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<AllowlistState>) {
    if (!state) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/settings/notification-allowlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const next = (await res.json()) as AllowlistState;
      setState(next);
      setToast({ tone: "ok", msg: "Enregistré" });
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(enabled: boolean) {
    if (!state) return;
    if (!enabled) {
      const ok = confirm(
        "ATTENTION — désactiver cette garde fait que TOUS les contacts actifs recevront les courriels de Nexus. À n'utiliser qu'en production, quand Freshservice est retiré.\n\nContinuer ?",
      );
      if (!ok) return;
    }
    await save({ enabled });
  }

  async function handleAddEmail() {
    if (!state) return;
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Adresse invalide");
      return;
    }
    if (state.allowedEmails.includes(trimmed)) {
      setError("Cette adresse est déjà dans la liste");
      return;
    }
    await save({ allowedEmails: [...state.allowedEmails, trimmed] });
    setNewEmail("");
  }

  async function handleRemoveEmail(email: string) {
    if (!state) return;
    if (!confirm(`Retirer ${email} de la liste blanche ?`)) return;
    await save({
      allowedEmails: state.allowedEmails.filter((e) => e !== email),
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-red-500">
          Impossible de charger la configuration.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        state.enabled
          ? "border-amber-200 bg-amber-50/40"
          : "border-emerald-200 bg-emerald-50/30"
      }
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
              state.enabled
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {state.enabled ? (
              <Shield className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <CardTitle>Garde d&apos;envoi aux contacts (dev-safety)</CardTitle>
            <CardDescription className="mt-1">
              Empêche Nexus d&apos;envoyer des courriels à de vrais contacts
              clients pendant que Freshservice écoute toujours
              <span className="font-mono"> billets@cetix.ca</span>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* État global */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-slate-900">
                {state.enabled
                  ? "Mode développement — garde active"
                  : "Mode production — tous les contacts notifiés"}
              </p>
              <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
                {state.enabled
                  ? "Seules les adresses listées ci-dessous peuvent recevoir des courriels. Les agents Cetix restent toujours notifiés."
                  : "ATTENTION : tous les contacts actifs reçoivent les courriels. À n'activer qu'après le retrait de Freshservice."}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={state.enabled}
                disabled={saving}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>
        </div>

        {/* Bannière d'avertissement active */}
        {state.enabled && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800 leading-relaxed">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Cohabitation Freshservice :</strong> Freshservice est
              toujours actif sur <span className="font-mono">billets@cetix.ca</span>{" "}
              et envoie déjà les confirmations aux clients. Tant que ce mode
              est actif, seules les adresses de test ci-dessous recevront des
              courriels de Nexus — les vrais clients continuent de n&apos;être
              contactés que par Freshservice.
            </div>
          </div>
        )}

        {/* Ajout d'une adresse */}
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
            Adresses autorisées à recevoir des courriels de test
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setError(null);
              }}
              placeholder="vous@cetix.ca"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddEmail();
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={saving || !newEmail.includes("@")}
              onClick={handleAddEmail}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Ajoutez vos adresses personnelles et de test. Format libre, une
            adresse à la fois.
          </p>
        </div>

        {/* Liste des adresses */}
        {state.allowedEmails.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {state.allowedEmails.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50/60"
              >
                <span className="font-mono text-[13px] text-slate-700 truncate">
                  {email}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveEmail(email)}
                  disabled={saving}
                  title="Retirer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-slate-200 bg-white px-4 py-6 text-center">
            <p className="text-[12px] text-slate-500">
              Aucune adresse autorisée. Tant que cette liste est vide ET que la
              garde est active, <strong>aucun contact</strong> ne recevra de
              courriel de Nexus.
            </p>
          </div>
        )}

        {/* Metadata */}
        {state.updatedAt && (
          <p className="text-[11px] text-slate-400">
            Dernière modification :{" "}
            {new Date(state.updatedAt).toLocaleString("fr-CA")}
            {state.updatedBy ? ` par ${state.updatedBy}` : ""}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[12px] ${
              toast.tone === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {toast.tone === "ok" && <CheckCircle2 className="h-3.5 w-3.5" />}
            {toast.msg}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
