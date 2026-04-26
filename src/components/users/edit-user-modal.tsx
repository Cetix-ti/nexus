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
import { UserOrgScopeSection } from "./user-org-scope-section";

export interface EditUserModalUser {
  id: string;
  name: string;
  email: string;
  /** Canonical UserRole enum value (e.g. TECHNICIAN). */
  role: string;
  /** Clé d'un rôle custom si l'utilisateur en a un — remplace `role` dans le dropdown. */
  customRoleKey?: string | null;
  /** "Actif" | "Inactif" — UI label. */
  status: string;
  phone?: string;
  /** Data URL ou chemin vers l'avatar. Chargé au mount si absent. */
  avatar?: string | null;
  capabilities?: string[];
}

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: EditUserModalUser | null;
  onSaved?: () => void;
}

// Rôles SYSTÈME — toujours disponibles. Les rôles CUSTOM sont chargés
// dynamiquement via /api/v1/roles et concaténés au dropdown.
const SYSTEM_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
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
  // Si l'utilisateur a un rôle custom, on l'affiche comme rôle "effectif"
  // dans le dropdown. Sinon, rôle système. Le backend dispatche au save.
  const [role, setRole] = useState(safeUser.customRoleKey || safeUser.role || "TECHNICIAN");
  // Rôles custom chargés dynamiquement depuis l'API (concaténés aux
  // rôles système dans le dropdown). Tableau vide si non chargé ou si
  // l'utilisateur courant n'est pas SUPER_ADMIN (API 403).
  const [customRoles, setCustomRoles] = useState<Array<{ key: string; label: string; color: string }>>([]);
  useEffect(() => {
    fetch("/api/v1/roles")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.roles) return;
        setCustomRoles(
          d.roles
            .filter((r: any) => !r.isSystem)
            .map((r: any) => ({ key: r.key, label: r.label, color: r.color ?? "#64748B" })),
        );
      })
      .catch(() => {});
  }, []);
  const [status, setStatus] = useState<"Actif" | "Inactif">(
    safeUser.status === "Inactif" ? "Inactif" : "Actif"
  );
  // Allocation km : si false, l'agent ne reçoit aucun remboursement
  // kilométrique (véhicule d'entreprise / paie en temps). Le champ est
  // lu depuis la liste /api/v1/users (background fetch plus bas) pour
  // couvrir le cas où le parent ne le fournit pas.
  const [mileageAllocationEnabled, setMileageAllocationEnabled] = useState<boolean>(true);
  // Phase 11D — niveau technicien. Drive l'auto-sélection du palier
  // tarifaire à la saisie de temps. Null/undefined = pas de niveau défini.
  const [level, setLevel] = useState<number | "">("");
  // `capabilities` lu depuis le user pour compat (certains appels lisent
  // encore ce champ), mais plus d'UI pour le modifier — voir Rôles & Permissions.
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
    let cancelled = false;
    // Fetch avatar (si non fourni) + mileageAllocationEnabled dans un même
    // call. Le flag km n'est pas renvoyé par la liste par défaut — on
    // attrape un 404/absence gracieusement.
    fetch(
      `/api/v1/users?includeAvatar=true&role=${encodeURIComponent(safeUser.role)}`,
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; avatar: string | null; mileageAllocationEnabled?: boolean; level?: number | null }>) => {
        if (cancelled) return;
        const hit = Array.isArray(arr) ? arr.find((u) => u.id === safeUser.id) : null;
        if (hit) {
          if (hit.avatar && safeUser.avatar === undefined) setAvatar(hit.avatar);
          if (typeof hit.mileageAllocationEnabled === "boolean") {
            setMileageAllocationEnabled(hit.mileageAllocationEnabled);
          }
          if (typeof hit.level === "number") setLevel(hit.level);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [safeUser.id, safeUser.avatar, safeUser.role]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Compresse et redimensionne l'image côté client AVANT d'envoyer au
   * serveur. Raisons :
   *  - Next.js a un body-limit de ~1 Mo sur les Route Handlers → un
   *    upload brut de 2-5 Mo (JPG pleine résolution, photo de phone)
   *    déclenche un 413 avant même d'atteindre l'API.
   *  - Le serveur re-optimise ensuite en WebP 192 px (optimizeAvatar),
   *    donc envoyer plus gros est de toute façon gaspillé.
   * Cible : 384 px de côté max (2× la taille serveur pour gérer le
   * retina), JPEG qualité 0.85 → typiquement < 50 KB data-URL.
   */
  async function compressAvatar(file: File): Promise<string> {
    const MAX_DIM = 384;
    const QUALITY = 0.85;
    // On passe par createImageBitmap pour décoder sans saturer le DOM.
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.drawImage(bitmap, 0, 0, w, h);
    // JPEG pour compatibilité maximale. Le serveur re-encodera en WebP.
    return canvas.toDataURL("image/jpeg", QUALITY);
  }

  async function onAvatarFileSelected(file: File) {
    setAvatarError(null);
    // Garde-fou raisonnable avant même la compression : 10 Mo max en
    // entrée (photos RAW de smartphones). Au-delà c'est probablement
    // pas une photo de profil.
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError("Image trop lourde (max 10 Mo en entrée)");
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      setAvatarError("Format non supporté (PNG/JPG/WebP)");
      return;
    }
    try {
      const compressed = await compressAvatar(file);
      setAvatar(compressed);
      setAvatarDirty(true);
    } catch (e) {
      setAvatarError(
        "Impossible de traiter l'image : " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
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
          mileageAllocationEnabled,
          level: level === "" ? null : Number(level),
          // `capabilities` n'est plus géré via l'UI utilisateur — les
          // accès passent maintenant par Rôles & Permissions. On ne
          // transmet PAS le champ, le backend laisse les valeurs
          // existantes intactes (les overrides personnels legacy
          // continuent de fonctionner s'il y en avait).
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
                PNG, JPG ou WebP. Compressée automatiquement avant envoi et optimisée en WebP 192 px côté serveur.
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
                  {SYSTEM_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                  {customRoles.length > 0 && (
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-t border-slate-100 mt-1 pt-2">
                      Rôles personnalisés
                    </div>
                  )}
                  {customRoles.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.label}
                      </span>
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

          {/* Niveau technicien (Phase 11D) — drive l'auto-sélection du
              palier tarifaire à la saisie de temps. Optionnel. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <label className="text-[13px] font-medium text-slate-900 block mb-1">
              Niveau technicien
            </label>
            <p className="mb-2 text-[11.5px] text-slate-600 leading-relaxed">
              Optionnel. Si défini, à la saisie de temps sur un client qui a
              configuré ses paliers tarifaires avec un niveau associé,
              l&apos;agent verra son palier présélectionné automatiquement.
            </p>
            <select
              value={level === "" ? "" : String(level)}
              onChange={(e) => {
                const v = e.target.value;
                setLevel(v === "" ? "" : Number(v));
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">— Non défini —</option>
              <option value="1">Niveau 1</option>
              <option value="2">Niveau 2</option>
              <option value="3">Niveau 3</option>
              <option value="4">Niveau 4</option>
              <option value="5">Niveau 5</option>
            </select>
          </div>

          {/* Allocation kilométrique — désactiver pour les agents qui
              ont un véhicule d'entreprise ou qui sont compensés en
              temps plutôt qu'en argent pour leurs déplacements. */}
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
            <button
              type="button"
              onClick={() => setMileageAllocationEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${mileageAllocationEnabled ? "bg-blue-600" : "bg-slate-300"}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5 ${mileageAllocationEnabled ? "translate-x-[18px]" : "translate-x-0.5"}`}
              />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-slate-900">
                Allocation kilométrique activée
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-600 leading-relaxed">
                {mileageAllocationEnabled
                  ? "L'agent reçoit un remboursement monétaire par km selon le barème du client."
                  : "Aucun remboursement monétaire (véhicule d'entreprise ou paie en temps). L'agent reste tenu de logger ses saisies onsite pour la facturation client."}
              </p>
            </div>
          </div>

          {/* Les accès métier (Finances / Facturation / Achats / etc.)
              sont gérés uniquement dans Paramètres → Rôles & Permissions.
              L'UI d'override par utilisateur a été retirée ; pour
              accorder un accès à un seul agent, crée un rôle custom
              dédié et assigne-le-lui via le champ Rôle ci-dessus. */}

          {/* Périmètre par organisation (Phase 9) — pour les techniciens
              dédiés à un sous-ensemble de clients. Section self-contained :
              persiste indépendamment du formulaire principal. */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <UserOrgScopeSection userId={safeUser.id} userRole={safeUser.role} />
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
