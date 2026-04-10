"use client";

import { useState } from "react";
import { X, UserCog, Upload, KeyRound, Save, Loader2 } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-semibold shadow-sm ring-2 ring-white">
              {initials(fullName)}
            </div>
            <div>
              <Button type="button" variant="outline" size="sm" disabled>
                <Upload className="h-4 w-4" />
                Changer la photo
              </Button>
              <p className="mt-1.5 text-[12px] text-slate-500">
                PNG ou JPG, max. 2 Mo
              </p>
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
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-slate-900">
                Mot de passe
              </p>
              <p className="text-[12.5px] text-slate-500">
                Réinitialisation par lien — à venir
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled>
              <KeyRound className="h-4 w-4" />
              Réinitialiser
            </Button>
          </div>

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
