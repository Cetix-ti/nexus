"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  User,
  Shield,
  Bell,
  Settings as SettingsIcon,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Tab = "profile" | "security" | "notifications" | "preferences";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "profile", label: "Mon profil", icon: User },
  { key: "security", label: "Sécurité", icon: Shield },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "preferences", label: "Préférences", icon: SettingsIcon },
];

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}

function AccountInner() {
  const params = useSearchParams();
  const requestedTab = (params?.get("tab") as Tab | null) ?? "profile";
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === requestedTab) ? requestedTab : "profile"
  );
  useEffect(() => {
    if (TABS.some((t) => t.key === requestedTab)) setTab(requestedTab);
  }, [requestedTab]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mon compte</h1>
        <p className="text-[13px] text-slate-500">
          Gérez votre profil, votre sécurité et vos préférences personnelles.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1 ring-1 ring-inset ring-slate-200/60 self-start">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
                active
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "preferences" && <PreferencesTab />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Profile
// ----------------------------------------------------------------------------

function ProfileTab() {
  const session = useSession();
  const u = session.data?.user as
    | {
        id?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        role?: string;
        avatar?: string | null;
      }
    | undefined;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (u) {
      setFirstName(u.firstName ?? "");
      setLastName(u.lastName ?? "");
      setPhone(u.phone ?? "");
    }
  }, [u]);

  // Charge l'avatar courant depuis l'API (la session ne le contient pas
  // toujours suivant la config NextAuth).
  useEffect(() => {
    if (!u?.id) return;
    let cancelled = false;
    fetch("/api/v1/users?includeInactive=true&includeSystem=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        const me = data.find((x) => x.id === u.id);
        if (me?.avatar) setAvatar(me.avatar);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [u?.id]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !u?.id) return;
    setMessage(null);
    if (file.size > 500 * 1024) {
      setMessage({ tone: "err", text: "Image > 500 Ko (compressez-la)" });
      e.target.value = "";
      return;
    }
    setUploadingAvatar(true);
    try {
      // Lecture en data URI base64 côté client.
      const dataUri: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/v1/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, avatar: dataUri }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAvatar(dataUri);
      setMessage({ tone: "ok", text: "Photo mise à jour" });
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function handleAvatarDelete() {
    if (!u?.id || !confirm("Supprimer la photo de profil ?")) return;
    const res = await fetch("/api/v1/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, avatar: null }),
    });
    if (res.ok) setAvatar(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!u?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: u.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessage({ tone: "ok", text: "Profil mis à jour" });
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!u) {
    return (
      <Card>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      </Card>
    );
  }

  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

  return (
    <Card>
      <form onSubmit={handleSave} className="space-y-5">
        <div className="flex items-center gap-4">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={`${firstName} ${lastName}`}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-sm"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-semibold text-white shadow-sm ring-2 ring-white">
              {initials || "?"}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900">
              {firstName} {lastName}
            </h2>
            <p className="text-[12.5px] text-slate-500">{u.email}</p>
            {u.role ? (
              <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                {u.role}
              </span>
            ) : null}
            <div className="mt-2 flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50">
                {uploadingAvatar ? "Téléversement…" : "Changer la photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
              </label>
              {avatar ? (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  className="text-[11px] text-red-500 hover:text-red-700"
                >
                  Supprimer
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">
              PNG, JPG ou WebP — max 500 Ko
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Courriel" value={u.email ?? ""} disabled readOnly />
          <Input
            label="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 514 555-0000"
          />
        </div>

        {message ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-[13px]",
              message.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            )}
          >
            {message.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" strokeWidth={2.5} />
            )}
            Enregistrer
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Security
// ----------------------------------------------------------------------------

function SecurityTab() {
  const session = useSession();
  const u = session.data?.user as { id?: string } | undefined;
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (pw1.length < 8) {
      setMessage({ tone: "err", text: "Au moins 8 caractères" });
      return;
    }
    if (pw1 !== pw2) {
      setMessage({ tone: "err", text: "Les mots de passe ne correspondent pas" });
      return;
    }
    if (!u?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, password: pw1 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessage({ tone: "ok", text: "Mot de passe modifié" });
      setPw1("");
      setPw2("");
    } catch (err) {
      setMessage({
        tone: "err",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Mot de passe">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="Nouveau mot de passe"
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
          />
          <Input
            label="Confirmer le mot de passe"
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          {message ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-[13px]",
                message.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              )}
            >
              {message.text}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={saving}>
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </Card>
      <Card title="Authentification à deux facteurs">
        <p className="text-[13px] text-slate-500">
          La 2FA n&apos;est pas encore activable depuis cette interface. Cette
          fonctionnalité est en cours de développement.
        </p>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Notifications & Preferences (placeholders honnêtes)
// ----------------------------------------------------------------------------

function NotificationsTab() {
  return (
    <Card title="Préférences de notifications">
      <p className="text-[13px] text-slate-500">
        Les préférences de notifications (e-mail, in-app, fréquence des
        digests) seront bientôt disponibles ici. Pour le moment, toutes les
        notifications par défaut sont activées.
      </p>
    </Card>
  );
}

function PreferencesTab() {
  return (
    <Card title="Préférences du compte">
      <p className="text-[13px] text-slate-500">
        Langue, fuseau horaire et format de date sont actuellement fixés à
        Français (Canada) / America/Toronto. Une interface de personnalisation
        sera ajoutée prochainement.
      </p>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Card helper
// ----------------------------------------------------------------------------

function Card({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {title ? (
        <h3 className="mb-4 text-[14px] font-semibold text-slate-900">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}
