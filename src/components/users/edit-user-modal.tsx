"use client";

import { useEffect, useRef, useState } from "react";
import { X, UserCog, Upload, KeyRound, Save, Loader2, Mail, Link2, Copy, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface EditUserModalUser {
  id: string;
  name: string;
  email: string;
  /** Canonical UserRole enum value (e.g. TECHNICIAN). */
  role: string;
  /** "Actif" | "Inactif" — UI label. */
  status: string;
  phone?: string;
  /** Data URL ou chemin vers l'avatar. Chargé au mount si absent. */
  avatar?: string | null;
}

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: EditUserModalUser | null;
  onSaved?: () => void;
}

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SUPER_ADMIN", label: "Super admin" },
  { value: "MSP_ADMIN", label: "Admin MSP" },
  { value: "SUPERVISOR", label: "Superviseur" },
  { value: "TECHNICIAN", label: "Technicien" },
  { value: "CLIENT_ADMIN", label: "Client admin" },
  { value: "CLIENT_USER", label: "Utilisateur client" },
  { value: "READ_ONLY", label: "Lecture seule" },
];

function splitName(name: string): { first: string; last: string } {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function initials(name: string): string {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Wrapper that remounts the inner form whenever the target user changes,
 * so initial state is derived from props without `setState` inside an effect.
 */
export function EditUserModal(props: EditUserModalProps) {
  if (!props.open || !props.user) return null;
  return <EditUserModalForm key={props.user.id} {...props} />;
}

function EditUserModalForm({ onClose, user, onSaved }: EditUserModalProps) {
  // Wrapper guarantees user is non-null when this component mounts.
  const safeUser = user!;
  const initial = splitName(safeUser.name);
  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [email, setEmail] = useState(safeUser.email || "");
  const [phone, setPhone] = useState(safeUser.phone || "");
  const [role, setRole] = useState(safeUser.role || "TECHNICIAN");
  const [status, setStatus] = useState<"Actif" | "Inactif">(
    safeUser.status === "Inactif" ? "Inactif" : "Actif"
  );
  // Avatar : optionnel sur le props (l'UI parente peut ne pas l'avoir
  // chargé). On part de l'initial et on fetch l'avatar existant en
  // background — l'endpoint de liste exclut le champ par défaut pour
  // garder les payloads légers, donc sans ce fetch on démarre toujours
  // à null et on effacerait l'avatar existant au PATCH.
  const [avatar, setAvatar] = useState<string | null>(safeUser.avatar ?? null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (safeUser.avatar !== undefined) return; // déjà fourni par le parent
    let cancelled = false;
    fetch(
      `/api/v1/users?includeAvatar=true&role=${encodeURIComponent(safeUser.role)}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; avatar: string | null }>) => {
        if (cancelled) return;
        const hit = Array.isArray(arr) ? arr.find((u) => u.id === safeUser.id) : null;
        if (hit && hit.avatar) setAvatar(hit.avatar);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [safeUser.id, safeUser.avatar, safeUser.role]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onAvatarFileSelected(file: File) {
    setAvatarError(null);
    // Limite côté client : 2 Mo avant compression. L'API re-optimise en
    // WebP 192px via optimizeAvatar, donc même une grosse image rentrera
    // ensuite dans la contrainte serveur (max 700 KB data-URL).
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Image trop lourde (max 2 Mo)");
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      setAvatarError("Format non supporté (PNG/JPG/WebP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === "string" ? reader.result : "";
      if (!dataUri.startsWith("data:image/")) {
        setAvatarError("Lecture de l'image impossible");
        return;
      }
      setAvatar(dataUri);
      setAvatarDirty(true);
    };
    reader.onerror = () => setAvatarError("Lecture de l'image impossible");
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    setAvatar(null);
    setAvatarDirty(true);
    setAvatarError(null);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: safeUser.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role,
          isActive: status === "Actif",
          // On n'envoie avatar que s'il a été modifié — évite de renvoyer
          // inutilement un gros data-URL à chaque submit.
          ...(avatarDirty ? { avatar } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  const fullName = `${firstName} ${lastName}`.trim() || safeUser.name;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <UserCog className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Modifier l&apos;utilisateur
              </h2>
              <p className="text-[12.5px] text-slate-500">{safeUser.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            {avatar ? (
              <img
                src={avatar}
                alt={fullName}
                className="h-16 w-16 rounded-full object-cover shadow-sm ring-2 ring-white"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-semibold shadow-sm ring-2 ring-white">
                {initials(fullName)}
              </div>
            )}
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAvatarFileSelected(f);
                  // Reset pour pouvoir re-sélectionner le même fichier si besoin.
                  e.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {avatar ? "Changer la photo" : "Téléverser une photo"}
                </Button>
                {avatar && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAvatar}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-slate-500">
                PNG, JPG ou WebP — max. 2 Mo. Automatiquement optimisé en WebP 192 px.
              </p>
              {avatarError && (
                <p className="mt-1 text-[12px] text-red-600">{avatarError}</p>
              )}
            </div>
          </div>

          {/* Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
            <Input
              label="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>

          {/* Email + phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 514 555-0000"
            />
          </div>

          {/* Role + status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Rôle
              </label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Statut
              </label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "Actif" | "Inactif")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Actif">Actif</SelectItem>
                  <SelectItem value="Inactif">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Password reset */}
          <PasswordResetSection userId={user?.id || ""} />

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" strokeWidth={2.5} />
              )}
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password Reset Section
// ---------------------------------------------------------------------------
function PasswordResetSection({ userId }: { userId: string }) {
  const [mode, setMode] = useState<null | "direct" | "email" | "link">(null);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleDirect() {
    if (newPassword.length < 8) { setResult({ ok: false, message: "Minimum 8 caractères" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword }),
      });
      const d = await res.json();
      setResult(d.success ? { ok: true, message: "Mot de passe défini avec succès" } : { ok: false, message: d.error || "Erreur" });
      if (d.success) setNewPassword("");
    } catch { setResult({ ok: false, message: "Erreur réseau" }); }
    finally { setLoading(false); }
  }

  async function handleSendEmail() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sendEmail: true }),
      });
      const d = await res.json();
      setResult(d.success ? { ok: true, message: "Courriel de réinitialisation envoyé" } : { ok: false, message: d.error || "Erreur" });
    } catch { setResult({ ok: false, message: "Erreur réseau" }); }
    finally { setLoading(false); }
  }

  async function handleGenerateLink() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, generateLink: true }),
      });
      const d = await res.json();
      if (d.success && d.resetUrl) {
        setResetLink(d.resetUrl);
        setResult({ ok: true, message: "Lien généré — copiez-le et partagez-le à l'utilisateur" });
      } else {
        setResult({ ok: false, message: d.error || "Erreur" });
      }
    } catch { setResult({ ok: false, message: "Erreur réseau" }); }
    finally { setLoading(false); }
  }

  function copyLink() {
    if (resetLink) {
      navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-slate-900">Mot de passe</p>
          <p className="text-[12px] text-slate-500">Réinitialiser le mot de passe de l&apos;utilisateur</p>
        </div>
        <KeyRound className="h-4 w-4 text-slate-400" />
      </div>

      {/* Mode selector */}
      {!mode && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { setMode("direct"); setResult(null); }} className="rounded-lg border border-slate-200 bg-white p-3 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all">
            <KeyRound className="h-4 w-4 text-slate-500 mx-auto mb-1" />
            <p className="text-[11px] font-medium text-slate-700">Définir directement</p>
          </button>
          <button onClick={() => { setMode("email"); setResult(null); }} className="rounded-lg border border-slate-200 bg-white p-3 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all">
            <Mail className="h-4 w-4 text-slate-500 mx-auto mb-1" />
            <p className="text-[11px] font-medium text-slate-700">Envoyer par courriel</p>
          </button>
          <button onClick={() => { setMode("link"); setResult(null); }} className="rounded-lg border border-slate-200 bg-white p-3 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all">
            <Link2 className="h-4 w-4 text-slate-500 mx-auto mb-1" />
            <p className="text-[11px] font-medium text-slate-700">Générer un lien</p>
          </button>
        </div>
      )}

      {/* Direct password set */}
      {mode === "direct" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input type="password" placeholder="Nouveau mot de passe (min. 8 car.)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="flex-1" />
            <Button type="button" variant="primary" size="sm" loading={loading} onClick={handleDirect} disabled={newPassword.length < 8}>
              Définir
            </Button>
          </div>
          <button onClick={() => setMode(null)} className="text-[11px] text-slate-400 hover:text-slate-600">← Retour</button>
        </div>
      )}

      {/* Send email */}
      {mode === "email" && !result?.ok && (
        <div className="space-y-2">
          <p className="text-[12px] text-slate-600">Un courriel sera envoyé à l&apos;utilisateur avec un lien de réinitialisation valide 24h.</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" size="sm" loading={loading} onClick={handleSendEmail}>
              <Mail className="h-3.5 w-3.5" /> Envoyer le courriel
            </Button>
            <button onClick={() => setMode(null)} className="text-[11px] text-slate-400 hover:text-slate-600">← Retour</button>
          </div>
        </div>
      )}

      {/* Generate link */}
      {mode === "link" && (
        <div className="space-y-2">
          {!resetLink ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="primary" size="sm" loading={loading} onClick={handleGenerateLink}>
                <Link2 className="h-3.5 w-3.5" /> Générer le lien
              </Button>
              <button onClick={() => setMode(null)} className="text-[11px] text-slate-400 hover:text-slate-600">← Retour</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input readOnly value={resetLink} className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-mono text-slate-700 select-all" onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400">Ce lien expire dans 24 heures</p>
              <button onClick={() => { setMode(null); setResetLink(null); }} className="text-[11px] text-slate-400 hover:text-slate-600">← Retour</button>
            </div>
          )}
        </div>
      )}

      {/* Result message */}
      {result && (
        <div className={`rounded-lg px-3 py-2 text-[12px] ${result.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {result.message}
        </div>
      )}
    </div>
  );
}
