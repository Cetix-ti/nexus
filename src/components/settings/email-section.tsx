"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Send,
  Server,
  Reply,
  XCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        } translate-y-0.5`}
      />
    </button>
  );
}

interface SmtpForm {
  host: string;
  port: number;
  secure: "tls" | "ssl" | "none";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  subjectPrefix: string;
  ticketCreationEnabled: boolean;
  allowInvalidCerts: boolean;
  isConfigured: boolean;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  lastTestError?: string;
}

const EMPTY: SmtpForm = {
  host: "",
  port: 587,
  secure: "tls",
  username: "",
  password: "",
  fromEmail: "",
  fromName: "",
  replyTo: "",
  subjectPrefix: "",
  ticketCreationEnabled: false,
  allowInvalidCerts: false,
  isConfigured: false,
};

type Status = { type: "success" | "error"; message: string } | null;

export function EmailSection() {
  const [cfg, setCfg] = useState<SmtpForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testStatus, setTestStatus] = useState<Status>(null);
  const [sendStatus, setSendStatus] = useState<Status>(null);
  const [saveStatus, setSaveStatus] = useState<Status>(null);

  useEffect(() => {
    fetch("/api/v1/integrations/smtp/config")
      .then((r) => r.json())
      .then((data) => {
        setCfg({ ...EMPTY, ...data });
      })
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof SmtpForm>(key: K, value: SmtpForm[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  async function saveConfig() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/v1/integrations/smtp/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (res.ok) {
        setCfg((c) => ({ ...c, isConfigured: data.isConfigured }));
        setSaveStatus({ type: "success", message: "Configuration enregistrée." });
      } else {
        setSaveStatus({ type: "error", message: data.error || "Erreur lors de l'enregistrement." });
      }
    } catch (e) {
      setSaveStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 4000);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestStatus(null);
    try {
      // Save first so the server has the latest values
      await fetch("/api/v1/integrations/smtp/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const res = await fetch("/api/v1/integrations/smtp/test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestStatus({ type: "success", message: data.message || "Connexion réussie." });
        setCfg((c) => ({
          ...c,
          lastTestAt: new Date().toISOString(),
          lastTestSuccess: true,
          lastTestError: undefined,
        }));
      } else {
        setTestStatus({ type: "error", message: data.error || "Échec de la connexion." });
        setCfg((c) => ({ ...c, lastTestSuccess: false, lastTestError: data.error }));
      }
    } catch (e) {
      setTestStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    setSendingTest(true);
    setSendStatus(null);
    try {
      await fetch("/api/v1/integrations/smtp/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const res = await fetch("/api/v1/integrations/smtp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSendStatus({ type: "success", message: `Email de test envoyé à ${testEmail}.` });
      } else {
        setSendStatus({ type: "error", message: data.error || "Échec de l'envoi." });
      }
    } catch (e) {
      setSendStatus({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la configuration SMTP...
      </div>
    );
  }

  const isConnected = cfg.isConfigured && cfg.lastTestSuccess === true;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Configuration SMTP
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Paramètres du serveur d&apos;envoi de courriels
        </p>
      </div>

      {/* Serveur SMTP */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Serveur SMTP</CardTitle>
              <CardDescription>
                Identifiants de connexion à votre fournisseur de courriels
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Hôte SMTP"
              value={cfg.host}
              onChange={(e) => update("host", e.target.value)}
              placeholder="smtp.gmail.com"
            />
            <Input
              label="Port"
              type="number"
              value={cfg.port}
              onChange={(e) => update("port", parseInt(e.target.value) || 0)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Sécurité
              </label>
              <Select
                value={cfg.secure}
                onValueChange={(v) => update("secure", v as "tls" | "ssl" | "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">STARTTLS (port 587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (port 465)</SelectItem>
                  <SelectItem value="none">Aucune</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Nom d'utilisateur (optionnel)"
              value={cfg.username}
              onChange={(e) => update("username", e.target.value)}
              placeholder="Laisser vide pour relay anonyme"
            />
            <Input
              label="Mot de passe (optionnel)"
              type="password"
              value={cfg.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="••••••••"
            />
            <Input
              label="Courriel d'envoi par défaut"
              value={cfg.fromEmail}
              onChange={(e) => update("fromEmail", e.target.value)}
              placeholder="support@cetix.ca"
            />
            <Input
              label="Nom d'expéditeur"
              value={cfg.fromName}
              onChange={(e) => update("fromName", e.target.value)}
              placeholder="Cetix Support"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-slate-800">
                Ignorer les erreurs de certificat TLS
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Activer pour les relays internes avec un certificat auto-signé.
                À utiliser uniquement sur un réseau de confiance.
              </p>
            </div>
            <Toggle
              checked={cfg.allowInvalidCerts}
              onChange={() => update("allowInvalidCerts", !cfg.allowInvalidCerts)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Adresse de réponse */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 shrink-0">
              <Reply className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Adresse de réponse</CardTitle>
              <CardDescription>
                Boîte de réception qui transforme les courriels entrants en tickets
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Adresse de réponse"
              value={cfg.replyTo}
              onChange={(e) => update("replyTo", e.target.value)}
              placeholder="reply@cetix.ca"
            />
            <Input
              label="Préfixe de sujet"
              value={cfg.subjectPrefix}
              onChange={(e) => update("subjectPrefix", e.target.value)}
              placeholder="[Cetix]"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-slate-800">
                Activer la création de tickets par email
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Tout courriel reçu sur l&apos;adresse de réponse créera automatiquement un ticket
              </p>
            </div>
            <Toggle
              checked={cfg.ticketCreationEnabled}
              onChange={() => update("ticketCreationEnabled", !cfg.ticketCreationEnabled)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tests d'envoi */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Tests d&apos;envoi</CardTitle>
              <CardDescription>
                Vérifiez que votre configuration fonctionne correctement
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Envoyer un email de test à"
                placeholder="adresse@exemple.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              onClick={sendTestEmail}
              disabled={sendingTest || !testEmail || !cfg.host}
            >
              {sendingTest ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Envoyer
            </Button>
          </div>
          {sendStatus && (
            <div
              className={`rounded-lg px-3 py-2 text-[12.5px] ${
                sendStatus.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {sendStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saveStatus && (
          <span
            className={`text-[12.5px] ${
              saveStatus.type === "success" ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {saveStatus.message}
          </span>
        )}
        <Button variant="primary" onClick={saveConfig} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Enregistrer la configuration
        </Button>
      </div>
    </div>
  );
}
