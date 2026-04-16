"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUserAvatarStore } from "@/stores/user-avatar-store";
import {
  User,
  Shield,
  Bell,
  Mail,
  Settings as SettingsIcon,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/layout/language-selector";

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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mon compte</h1>
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
  const { data: sessionData } = useSession();
  const refreshAvatar = useUserAvatarStore((s) => s.refresh);
  const u = sessionData?.user as
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
      // Refresh the global avatar store so topbar/sidebar update immediately
      await refreshAvatar();
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
    if (res.ok) {
      setAvatar(null);
      await refreshAvatar();
    }
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
      <MfaSection />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Notifications & Preferences (placeholders honnêtes)
// ----------------------------------------------------------------------------

function MfaSection() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [setupData, setSetupData] = useState<{ qrCode: string; secretBase32: string } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetch("/api/v1/me/mfa")
      .then((r) => r.ok ? r.json() : { data: {} })
      .then((d) => { setMfaEnabled(d.data?.mfaEnabled ?? false); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function startSetup() {
    setMessage(null);
    const res = await fetch("/api/v1/me/mfa?action=setup");
    if (res.ok) {
      const d = await res.json();
      setSetupData(d.data);
    }
  }

  async function verifyAndEnable() {
    if (!code || code.length !== 6) { setMessage({ tone: "err", text: "Entrez un code à 6 chiffres" }); return; }
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/me/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "enable" }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setMfaEnabled(true);
        setSetupData(null);
        setCode("");
        setMessage({ tone: "ok", text: "MFA activé avec succès !" });
      } else {
        setMessage({ tone: "err", text: d.error || "Code invalide" });
      }
    } catch { setMessage({ tone: "err", text: "Erreur de vérification" }); }
    finally { setVerifying(false); }
  }

  async function disableMfa() {
    const userCode = prompt("Entrez votre code MFA pour désactiver :");
    if (!userCode) return;
    const res = await fetch("/api/v1/me/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: userCode, action: "disable" }),
    });
    if (res.ok) {
      setMfaEnabled(false);
      setSetupData(null);
      setMessage({ tone: "ok", text: "MFA désactivé" });
    } else {
      const d = await res.json().catch(() => ({}));
      setMessage({ tone: "err", text: d.error || "Code invalide" });
    }
  }

  if (loading) return <Card title="Authentification à deux facteurs (MFA)"><p className="text-sm text-slate-400">Chargement...</p></Card>;

  return (
    <Card title="Authentification à deux facteurs (MFA)">
      {message && (
        <div className={cn("rounded-lg border px-3 py-2 text-[13px] mb-4",
          message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
        )}>{message.text}</div>
      )}

      {mfaEnabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              MFA activé
            </span>
          </div>
          <p className="text-[13px] text-slate-500">
            Votre compte est protégé par l&apos;authentification à deux facteurs.
          </p>
          <Button variant="outline" size="sm" onClick={disableMfa}>
            Désactiver le MFA
          </Button>
        </div>
      ) : setupData ? (
        <div className="space-y-4">
          <p className="text-[13px] text-slate-600">
            Scannez ce QR code avec votre application d&apos;authentification (Google Authenticator, Microsoft Authenticator, Authy, etc.)
          </p>
          <div className="flex justify-center">
            <img src={setupData.qrCode} alt="QR Code MFA" className="w-48 h-48 rounded-lg border border-slate-200" />
          </div>
          <div className="text-center">
            <p className="text-[11px] text-slate-400 mb-1">Clé manuelle :</p>
            <code className="text-[12px] font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 select-all">
              {setupData.secretBase32}
            </code>
          </div>
          <div className="flex items-center gap-3">
            <Input
              label="Code de vérification"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="font-mono text-center text-lg tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={verifyAndEnable} loading={verifying} disabled={code.length !== 6}>
              Activer le MFA
            </Button>
            <Button variant="outline" onClick={() => setSetupData(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-slate-500">
            Protégez votre compte avec un deuxième facteur d&apos;authentification. Vous aurez besoin d&apos;une application comme Google Authenticator ou Microsoft Authenticator.
          </p>
          <Button variant="primary" onClick={startSetup}>
            Configurer le MFA
          </Button>
        </div>
      )}
    </Card>
  );
}

// Les préférences sont désormais chargées depuis l'API
// /api/v1/account/notifications (source de vérité côté serveur) et
// enregistrées via PUT au changement. Le catalogue d'événements est lui
// aussi retourné par l'API pour que front + back restent synchrones.
interface EventPref {
  email: boolean;
  inApp: boolean;
}
interface ApiEventCatalog {
  key: string;
  label: string;
  description?: string;
  category: string;
  defaults: EventPref;
}
interface ApiPrefs {
  channels: { inApp: boolean; email: boolean };
  events: Record<string, EventPref>;
}

const CATEGORY_LABELS: Record<string, string> = {
  tickets: "Tickets",
  projects: "Projets",
  calendar: "Calendrier & rappels",
  infra: "Sauvegardes & monitoring",
  system: "Système",
};

function UserToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-slate-300"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"} translate-y-0.5`} />
    </button>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<ApiPrefs | null>(null);
  const [catalog, setCatalog] = useState<ApiEventCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/account/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setPrefs(data.prefs as ApiPrefs);
        setCatalog(data.catalog as ApiEventCatalog[]);
      })
      .catch((e) => setError(`Erreur ${e}`))
      .finally(() => setLoading(false));
  }, []);

  // Persiste immédiatement chaque changement via PUT. Le toggle est
  // donc "live" — chaque clic déclenche un enregistrement. Un petit
  // badge "Enregistré" apparaît 1.5s pour feedback.
  async function persist(next: ApiPrefs) {
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/account/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setToast("Enregistré");
      setTimeout(() => setToast(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleChannel(ch: "inApp" | "email") {
    if (!prefs) return;
    persist({ ...prefs, channels: { ...prefs.channels, [ch]: !prefs.channels[ch] } });
  }

  function toggleEvent(key: string, ch: "inApp" | "email") {
    if (!prefs) return;
    const current = prefs.events[key] ?? { inApp: false, email: false };
    persist({
      ...prefs,
      events: {
        ...prefs.events,
        [key]: { ...current, [ch]: !current[ch] },
      },
    });
  }

  if (loading) {
    return (
      <Card title="Notifications">
        <p className="text-[13px] text-slate-400">Chargement…</p>
      </Card>
    );
  }
  if (!prefs) {
    return (
      <Card title="Notifications">
        <p className="text-[13px] text-red-600">
          Impossible de charger les préférences. {error}
        </p>
      </Card>
    );
  }

  const byCategory = catalog.reduce<Record<string, ApiEventCatalog[]>>((acc, e) => {
    (acc[e.category] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed top-5 right-5 z-50 rounded-lg bg-emerald-600 text-white text-[12px] px-3 py-2 shadow-lg animate-in fade-in">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-[13px] px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Global channel toggles — per-user */}
      <Card title="Canaux de notification">
        <p className="text-[13px] text-slate-500 mb-4">
          Désactive un canal ici pour couper toutes les notifications de ce type — prioritaire sur les toggles par événement.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2.5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900">Notifications dans l&apos;app</p>
                <p className="text-[12px] text-slate-500">Cloche en haut de l&apos;écran + toasts</p>
              </div>
            </div>
            <UserToggle checked={prefs.channels.inApp} onChange={() => toggleChannel("inApp")} />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-900">Email</p>
                <p className="text-[12px] text-slate-500">Courriels envoyés à {" "}
                  {/* Le mail affiché côté UI vient de la session — feature "nice to have" */}
                  votre adresse d&apos;agent
                </p>
              </div>
            </div>
            <UserToggle checked={prefs.channels.email} onChange={() => toggleChannel("email")} />
          </div>
        </div>
      </Card>

      {/* Per-event preferences groupées par catégorie */}
      {Object.entries(byCategory).map(([cat, events]) => (
        <Card key={cat} title={CATEGORY_LABELS[cat] ?? cat}>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Événement</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-20">Email</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-20 pr-6">In-app</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => {
                  const pref = prefs.events[e.key] ?? e.defaults;
                  return (
                    <tr key={e.key} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3">
                        <div className="text-[13px] font-medium text-slate-800">{e.label}</div>
                        {e.description && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{e.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-center">
                          <UserToggle
                            checked={pref.email}
                            onChange={() => toggleEvent(e.key, "email")}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 pr-6">
                        <div className="flex justify-center">
                          <UserToggle
                            checked={pref.inApp}
                            onChange={() => toggleEvent(e.key, "inApp")}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <p className="text-[11px] text-slate-400 text-center">
        {saving ? "Enregistrement…" : "Les changements sont enregistrés automatiquement."}
      </p>
    </div>
  );
}

function PreferencesTab() {
  return (
    <div className="space-y-5">
      <Card title="Langue d'affichage">
        <p className="text-[13px] text-slate-500 mb-4">
          Sélectionnez la langue dans laquelle vous souhaitez utiliser Nexus.
        </p>
        <LanguageSelector />
      </Card>
      <Card title="Fuseau horaire">
        <p className="text-[13px] text-slate-500">
          Fuseau horaire : America/Toronto (EST/EDT). La personnalisation sera disponible prochainement.
        </p>
      </Card>
    </div>
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
