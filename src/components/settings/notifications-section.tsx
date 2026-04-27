"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Pencil,
  SendHorizonal,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EditEmailTemplateModal,
  type EmailTemplate,
} from "./edit-email-template-modal";
import { NotificationAllowlistSection } from "./notification-allowlist-section";

// NOTE: Channel preferences (email/in-app on/off per user) are managed
// in "Mon profil > Notifications" since they are user-specific settings.

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

type CategorizedTemplate = EmailTemplate;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsSection() {
  const [templates, setTemplates] =
    useState<CategorizedTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const res = await fetch("/api/v1/email-templates");
      if (res.ok) {
        const data: EmailTemplate[] = await res.json();
        setTemplates(data);
      }
    } catch {
      // ignore
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);
  const [editingTemplate, setEditingTemplate] =
    useState<EmailTemplate | null>(null);
  // Toast notifications

  // Test state
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    channel: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const [emailTestTo, setEmailTestTo] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Weekly digest manual trigger state
  const [digestRunning, setDigestRunning] = useState<"self" | "all" | null>(null);

  async function runWeeklyDigest(mode: "self" | "all") {
    setDigestRunning(mode);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/notifications/weekly-digest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({
          channel: "weekly_digest",
          ok: false,
          message: data.error ?? `Erreur ${res.status}`,
        });
      } else {
        const recipients = (data.sent as string[] | undefined)?.join(", ") ?? "";
        setTestResult({
          channel: "weekly_digest",
          ok: true,
          message:
            mode === "self"
              ? `Weekly digest envoyé à vous-même (${recipients}).`
              : `Weekly digest envoyé : ${data.sent?.length ?? 0}/${data.recipients ?? 0} destinataire(s)${recipients ? ` (${recipients})` : ""}.`,
        });
      }
    } catch {
      setTestResult({ channel: "weekly_digest", ok: false, message: "Erreur réseau" });
    } finally {
      setDigestRunning(null);
      setTimeout(() => setTestResult(null), 10000);
    }
  }

  // saveTemplate / deleteTemplate retirés : la modale persiste maintenant
  // directement via l'API, et la liste est rafraîchie via `loadTemplates()`
  // après la sauvegarde. Pas de "créer" non plus — un template existe par
  // event seedé en DB ; on ne crée pas de templates ad-hoc.

  async function handleSendTestEmail() {
    if (!emailTestTo || !emailTestTo.includes("@")) return;
    setShowEmailModal(false);
    setTestingChannel("email");
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", to: emailTestTo }),
      });
      const data = await res.json();
      setTestResult({
        channel: "email",
        ok: data.ok && data.results?.email,
        message: data.ok
          ? `Email de test envoyé à ${emailTestTo}`
          : data.results?.email === false
            ? "Erreur SMTP — vérifiez la configuration dans Paramètres > SMTP"
            : "Erreur lors de l'envoi",
      });
    } catch {
      setTestResult({
        channel: "email",
        ok: false,
        message: "Erreur réseau",
      });
    } finally {
      setTestingChannel(null);
      setTimeout(() => setTestResult(null), 8000);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Notifications
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Configurez les canaux et les modèles de notifications
        </p>
      </div>

      {/* Garde-fou dev-safety : placé tout en haut car c'est le levier le
          plus critique — un envoi à un vrai contact pendant la cohabitation
          avec Freshservice est le scénario à éviter absolument. */}
      <NotificationAllowlistSection />

      {/* Test result banner */}
      {testResult && (
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-medium border ${
            testResult.ok
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {testResult.message}
        </div>
      )}

      {/* Note: Les canaux de notification (email / in-app) sont propres
           à chaque utilisateur et se configurent dans « Mon profil > Notifications ».
           Cette section regroupe uniquement les paramètres globaux
           (modèles d'email, envois de test SMTP). */}

      {/* Test SMTP global */}
      <Card>
        <CardHeader>
          <CardTitle>Tester la configuration email</CardTitle>
          <CardDescription>
            Envoyer un email de test pour vérifier la configuration SMTP globale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" disabled={testingChannel === "email"} onClick={() => setShowEmailModal(true)}>
            {testingChannel === "email" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="h-3.5 w-3.5" />
            )}
            Envoyer un email de test
          </Button>
        </CardContent>
      </Card>

      {/* Weekly digest — déclenchement manuel pour itérer sur le contenu
          sans attendre vendredi 17h. "Pour moi" envoie uniquement à
          l'admin courant ; "À tous les destinataires" reproduit le run
          du cron (= Bruno + Simon tant que la phase pré-prod dure). */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé hebdomadaire</CardTitle>
          <CardDescription>
            Déclencher manuellement le weekly digest. Le cron tourne automatiquement chaque vendredi 17h00.
            La fenêtre couvre les 7 derniers jours glissants.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={digestRunning !== null}
            onClick={() => runWeeklyDigest("self")}
            title="Envoie le digest uniquement à toi — utile pour itérer sur le contenu sans spammer"
          >
            {digestRunning === "self" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="h-3.5 w-3.5" />
            )}
            Envoyer pour moi
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={digestRunning !== null}
            onClick={() => runWeeklyDigest("all")}
            title="Reproduit le run du cron — envoie à tous les destinataires autorisés"
          >
            {digestRunning === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="h-3.5 w-3.5" />
            )}
            Envoyer à tous les destinataires
          </Button>
        </CardContent>
      </Card>

      {/* Note: per-event preferences are user-specific and live in
           "Mon profil > Notifications". Global admin settings (channels
           activation at tenant level, templates) stay here. */}

      {/* Modèles d'email */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Modèles d&apos;email</CardTitle>
            <CardDescription>
              Personnalisez le contenu des notifications envoyées aux agents et aux contacts clients
            </CardDescription>
          </div>
          {/* Plus de "Nouveau modèle" : un template par event est seedé en
              DB, on n'en crée pas ad-hoc. Pour ajouter un template, il
              faut d'abord ajouter un event au catalogue côté code. */}
        </CardHeader>
        <CardContent className="p-0">
          {/* Agent templates */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Notifications aux agents
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {templatesLoading ? (
              <div className="px-5 py-6 text-[12.5px] text-slate-400 inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
              </div>
            ) : templates.filter((t) => t.audience === "agent").length === 0 ? (
              <div className="px-5 py-6 text-[12.5px] text-slate-400">Aucun template agent.</div>
            ) : (
              templates.filter((t) => t.audience === "agent").map((t) => (
                <TemplateRow key={t.id} template={t} onEdit={() => setEditingTemplate(t)} />
              ))
            )}
          </div>

          {/* Contact templates */}
          <div className="px-5 pt-5 pb-2 border-t border-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Notifications aux contacts (clients)
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {!templatesLoading && templates.filter((t) => t.audience === "contact").length === 0 ? (
              <div className="px-5 py-6 text-[12.5px] text-slate-400">Aucun template contact.</div>
            ) : (
              templates.filter((t) => t.audience === "contact").map((t) => (
                <TemplateRow key={t.id} template={t} onEdit={() => setEditingTemplate(t)} />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <EditEmailTemplateModal
        open={!!editingTemplate}
        template={editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSaved={loadTemplates}
      />

      {/* Email test modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <h3 className="text-[16px] font-semibold text-slate-900">
              Tester les notifications email
            </h3>
            <p className="text-[13px] text-slate-500">
              Un email de test avec le branding Cetix sera envoyé à l&apos;adresse ci-dessous.
            </p>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Adresse courriel
              </label>
              <input
                type="email"
                value={emailTestTo}
                onChange={(e) => setEmailTestTo(e.target.value)}
                placeholder="vous@entreprise.com"
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendTestEmail();
                }}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEmailModal(false)}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!emailTestTo || !emailTestTo.includes("@")}
                onClick={handleSendTestEmail}
              >
                <SendHorizonal className="h-3.5 w-3.5" />
                Envoyer le test
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: CategorizedTemplate;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors group">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
        <FileText className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold text-slate-900 truncate">
          {template.name}
          {!template.enabled && (
            <span className="ml-2 inline-block rounded bg-slate-200 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 align-middle">
              Désactivé
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[12px] text-slate-500 truncate font-mono">
          {template.eventKey}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>
    </div>
  );
}
