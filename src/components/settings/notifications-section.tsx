"use client";

import { useState } from "react";
import {
  FileText,
  Pencil,
  Trash2,
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

// NOTE: Channel preferences (email/in-app on/off per user) are managed
// in "Mon profil > Notifications" since they are user-specific settings.

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

type TemplateAudience = "agent" | "contact";

interface CategorizedTemplate extends EmailTemplate {
  audience: TemplateAudience;
}

const initialTemplates: CategorizedTemplate[] = [
  // Agent templates
  {
    id: "t1",
    audience: "agent",
    name: "Bienvenue agent",
    subject: "Bienvenue dans Nexus, {{agent_name}} !",
    body: "Bonjour {{agent_name}},\n\nBienvenue dans Nexus !",
    updatedAt: "Il y a 2 jours",
  },
  {
    id: "t3",
    audience: "agent",
    name: "Nouveau commentaire (agent)",
    subject: "Nouvelle réponse sur le ticket {{ticket_id}}",
    body: "Une nouvelle réponse a été ajoutée au ticket {{ticket_id}}.",
    updatedAt: "Il y a 1 semaine",
  },
  {
    id: "t5",
    audience: "agent",
    name: "Escalade SLA",
    subject: "[Urgent] Le SLA du ticket {{ticket_id}} est dépassé",
    body: "Le SLA du ticket {{ticket_id}} a été dépassé.",
    updatedAt: "Il y a 3 semaines",
  },
  {
    id: "t7",
    audience: "agent",
    name: "Nouveau ticket assigné",
    subject: "Le ticket {{ticket_id}} vous a été assigné",
    body: "Bonjour {{agent_name}},\n\nLe ticket #{{ticket_id}} — {{ticket_subject}} vous a été assigné.",
    updatedAt: "Il y a 3 semaines",
  },
  {
    id: "t8",
    audience: "agent",
    name: "Rappel de ticket",
    subject: "Rappel : ticket {{ticket_id}} en attente",
    body: "Le ticket {{ticket_id}} requiert votre attention.",
    updatedAt: "Le mois dernier",
  },
  // Contact (client) templates
  {
    id: "t2",
    audience: "contact",
    name: "Confirmation de création de ticket",
    subject: "Votre ticket {{ticket_id}} a été reçu",
    body: "Bonjour {{requester_name}},\n\nNous avons bien reçu votre ticket {{ticket_id}}. Notre équipe le traitera dans les meilleurs délais.",
    updatedAt: "Il y a 5 jours",
  },
  {
    id: "t4",
    audience: "contact",
    name: "Résolution de ticket",
    subject: "Votre ticket {{ticket_id}} est résolu",
    body: "Bonjour {{requester_name}},\n\nVotre ticket {{ticket_id}} a été marqué comme résolu.",
    updatedAt: "Il y a 2 semaines",
  },
  {
    id: "t6",
    audience: "contact",
    name: "Nouvelle réponse (client)",
    subject: "Nouvelle réponse sur votre ticket {{ticket_id}}",
    body: "Bonjour {{requester_name}},\n\nUne nouvelle réponse a été ajoutée à votre ticket {{ticket_id}}.",
    updatedAt: "Il y a 1 semaine",
  },
  {
    id: "t9",
    audience: "contact",
    name: "Rappel ticket en attente",
    subject: "Rappel : ticket {{ticket_id}} en attente de votre réponse",
    body: "Bonjour {{requester_name}},\n\nLe ticket {{ticket_id}} est en attente de votre réponse.",
    updatedAt: "Le mois dernier",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsSection() {
  const [templates, setTemplates] =
    useState<CategorizedTemplate[]>(initialTemplates);
  const [editingTemplate, setEditingTemplate] =
    useState<EmailTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

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

  function saveTemplate(t: EmailTemplate) {
    setTemplates((prev) => {
      const exists = prev.find((p) => p.id === t.id);
      if (exists) return prev.map((p) => (p.id === t.id ? { ...p, ...t } : p));
      return [...prev, { ...t, audience: "agent" as TemplateAudience }];
    });
  }

  function deleteTemplate(id: string) {
    if (!confirm("Supprimer ce modèle d'email ?")) return;
    setTemplates((prev) => prev.filter((p) => p.id !== id));
  }

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreatingTemplate(true)}
          >
            Nouveau modèle
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {/* Agent templates */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Notifications aux agents
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {templates.filter((t) => t.audience === "agent").map((t) => (
              <TemplateRow key={t.id} template={t} onEdit={() => setEditingTemplate(t)} onDelete={() => deleteTemplate(t.id)} />
            ))}
          </div>

          {/* Contact templates */}
          <div className="px-5 pt-5 pb-2 border-t border-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Notifications aux contacts (clients)
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {templates.filter((t) => t.audience === "contact").map((t) => (
              <TemplateRow key={t.id} template={t} onEdit={() => setEditingTemplate(t)} onDelete={() => deleteTemplate(t.id)} />
            ))}
          </div>
        </CardContent>
      </Card>

      <EditEmailTemplateModal
        open={!!editingTemplate || creatingTemplate}
        template={editingTemplate}
        onClose={() => {
          setEditingTemplate(null);
          setCreatingTemplate(false);
        }}
        onSave={saveTemplate}
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
  onDelete,
}: {
  template: CategorizedTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors group">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
        <FileText className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold text-slate-900 truncate">
          {template.name}
        </h3>
        <p className="mt-0.5 text-[12px] text-slate-500 truncate">
          Objet : <span className="font-mono">{template.subject}</span>
        </p>
      </div>
      <span className="text-[11px] text-slate-400 hidden sm:block">
        Modifié {template.updatedAt}
      </span>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} title="Supprimer">
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
      </Button>
    </div>
  );
}
