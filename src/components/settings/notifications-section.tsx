"use client";

import { useState } from "react";
import {
  Mail,
  Bell,
  MessageSquare,
  Hash,
  Webhook,
  Smartphone,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
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

// ---------------------------------------------------------------------------
// Inline switch (matches queues-section style)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

interface Channel {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  defaultOn: boolean;
  configurable?: boolean;
}

const channels: Channel[] = [
  {
    key: "email",
    label: "Email",
    description: "Recevez les notifications par courriel",
    icon: Mail,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    defaultOn: true,
  },
  {
    key: "inapp",
    label: "Notifications dans l'app",
    description: "Affichez les alertes dans la barre de notifications",
    icon: Bell,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    defaultOn: true,
  },
  {
    key: "sms",
    label: "SMS",
    description: "Recevez les alertes critiques par message texte",
    icon: Smartphone,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    defaultOn: false,
  },
  {
    key: "slack",
    label: "Slack",
    description: "Envoyez les notifications dans un canal Slack",
    icon: Hash,
    iconBg: "bg-fuchsia-50",
    iconColor: "text-fuchsia-600",
    defaultOn: false,
    configurable: true,
  },
  {
    key: "teams",
    label: "Microsoft Teams",
    description: "Connectez un canal Teams pour les alertes d'équipe",
    icon: MessageSquare,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    defaultOn: false,
    configurable: true,
  },
  {
    key: "webhook",
    label: "Webhook personnalisé",
    description: "Envoyez les événements vers un endpoint HTTP",
    icon: Webhook,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    defaultOn: false,
  },
];

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

interface EventPref {
  email: boolean;
  inapp: boolean;
  sms: boolean;
}

const initialEvents: { key: string; label: string; description?: string; prefs: EventPref }[] = [
  { key: "assigned", label: "Nouveau ticket assigné", prefs: { email: true, inapp: true, sms: false } },
  { key: "assigned_others", label: "Ticket assigné à un autre agent", description: "Désactivez pour ne pas recevoir de notification lorsqu'un ticket créé par un agent est assigné à quelqu'un d'autre", prefs: { email: false, inapp: false, sms: false } },
  { key: "status", label: "Mise à jour de statut", prefs: { email: true, inapp: true, sms: false } },
  { key: "comment", label: "Nouveau commentaire", prefs: { email: true, inapp: true, sms: false } },
  { key: "mention", label: "Mention dans un commentaire", prefs: { email: true, inapp: true, sms: true } },
  { key: "sla_warn", label: "SLA bientôt expiré", prefs: { email: true, inapp: true, sms: true } },
  { key: "sla_breach", label: "SLA dépassé", prefs: { email: true, inapp: true, sms: true } },
  { key: "resolved", label: "Ticket résolu", prefs: { email: true, inapp: false, sms: false } },
  { key: "new_client", label: "Nouveau ticket client", prefs: { email: true, inapp: true, sms: false } },
  { key: "reminder", label: "Rappel de ticket", description: "Notification lorsqu'un rappel configuré sur un ticket arrive à échéance", prefs: { email: true, inapp: true, sms: false } },
  { key: "escalation", label: "Escalade automatique", prefs: { email: true, inapp: true, sms: true } },
  { key: "weekly", label: "Rapport hebdomadaire", prefs: { email: true, inapp: false, sms: false } },
];

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const initialTemplates: EmailTemplate[] = [
  { id: "t1", name: "Bienvenue agent", subject: "Bienvenue dans Nexus, {{agent_name}} !", body: "Bonjour {{agent_name}},\n\nBienvenue dans Nexus !", updatedAt: "Il y a 2 jours" },
  { id: "t2", name: "Confirmation création ticket", subject: "Votre ticket {{ticket_id}} a été reçu", body: "Bonjour {{requester_name}},\n\nNous avons bien reçu votre ticket {{ticket_id}}.", updatedAt: "Il y a 5 jours" },
  { id: "t3", name: "Notification nouveau commentaire", subject: "Nouvelle réponse sur le ticket {{ticket_id}}", body: "Une nouvelle réponse a été ajoutée à votre ticket {{ticket_id}}.", updatedAt: "Il y a 1 semaine" },
  { id: "t4", name: "Résolution de ticket", subject: "Votre ticket {{ticket_id}} est résolu", body: "Votre ticket {{ticket_id}} a été marqué comme résolu.", updatedAt: "Il y a 2 semaines" },
  { id: "t5", name: "Escalade SLA", subject: "[Urgent] Le SLA du ticket {{ticket_id}} est dépassé", body: "Le SLA du ticket {{ticket_id}} a été dépassé.", updatedAt: "Il y a 3 semaines" },
  { id: "t6", name: "Rappel ticket en attente", subject: "Rappel : ticket {{ticket_id}} en attente de votre réponse", body: "Le ticket {{ticket_id}} est en attente de votre réponse.", updatedAt: "Le mois dernier" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsSection() {
  const [channelState, setChannelState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(channels.map((c) => [c.key, c.defaultOn]))
  );
  const [events, setEvents] = useState(initialEvents);
  const [templates, setTemplates] = useState<EmailTemplate[]>(initialTemplates);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  function toggleChannel(key: string) {
    setChannelState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function configureChannel(key: string) {
    alert(
      `La configuration du canal "${key}" sera disponible dans une prochaine itération. Le webhook entrant et l'authentification OAuth seront paramétrables ici.`
    );
  }

  function saveTemplate(t: EmailTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((p) => p.id === t.id);
      if (exists) return prev.map((p) => (p.id === t.id ? t : p));
      return [...prev, t];
    });
  }

  function deleteTemplate(id: string) {
    if (!confirm("Supprimer ce modèle d'email ?")) return;
    setTemplates((prev) => prev.filter((p) => p.id !== id));
  }

  function toggleEvent(key: string, channel: keyof EventPref) {
    setEvents((prev) =>
      prev.map((e) =>
        e.key === key ? { ...e, prefs: { ...e.prefs, [channel]: !e.prefs[channel] } } : e
      )
    );
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

      {/* Canaux */}
      <Card>
        <CardHeader>
          <CardTitle>Canaux de notification</CardTitle>
          <CardDescription>
            Activez ou désactivez les canaux par lesquels Nexus communique
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {channels.map((c) => {
              const Icon = c.icon;
              const enabled = channelState[c.key];
              return (
                <div
                  key={c.key}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg} ${c.iconColor} shrink-0`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-slate-900">
                        {c.label}
                      </h3>
                      {enabled && (
                        <Badge variant="success" className="h-4 px-1.5 text-[10px]">
                          Actif
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      {c.description}
                    </p>
                  </div>
                  {c.configurable && (
                    <button
                      onClick={() => configureChannel(c.key)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      Configurer
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  <Toggle checked={enabled} onChange={() => toggleChannel(c.key)} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Préférences par événement */}
      <Card>
        <CardHeader>
          <CardTitle>Préférences par événement</CardTitle>
          <CardDescription>
            Choisissez par quels canaux chaque type d&apos;événement est diffusé
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Événement
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-24">
                    Email
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-24">
                    In-app
                  </th>
                  <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-24 pr-5">
                    SMS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <tr key={e.key} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="text-[13px] font-medium text-slate-800">{e.label}</div>
                      {e.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{e.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <Toggle
                          checked={e.prefs.email}
                          onChange={() => toggleEvent(e.key, "email")}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        <Toggle
                          checked={e.prefs.inapp}
                          onChange={() => toggleEvent(e.key, "inapp")}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 pr-5">
                      <div className="flex justify-center">
                        <Toggle
                          checked={e.prefs.sms}
                          onChange={() => toggleEvent(e.key, "sms")}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modèles d'email */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Modèles d&apos;email</CardTitle>
            <CardDescription>
              Personnalisez le contenu des notifications envoyées
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
          <div className="divide-y divide-slate-100">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-slate-900 truncate">
                    {t.name}
                  </h3>
                  <p className="mt-0.5 text-[12px] text-slate-500 truncate">
                    Objet : <span className="font-mono">{t.subject}</span>
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 hidden sm:block">
                  Modifié {t.updatedAt}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingTemplate(t)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTemplate(t.id)}
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
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
    </div>
  );
}
