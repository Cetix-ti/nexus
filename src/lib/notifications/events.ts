// ============================================================================
// NOTIFICATION EVENTS — catalogue central des événements notifiables.
//
// Source unique pour :
//   - l'UI "Mon compte > Notifications" (libellés + defaults)
//   - le dispatcher (validation des keys)
//   - les helpers de dispatch par événement
//
// Chaque événement a une clé stable (DB-friendly, jamais traduite), un
// libellé FR, et des valeurs par défaut pour les deux canaux. Ajouter un
// nouvel événement = une ligne dans EVENTS, et un appel au dispatcher
// depuis le code métier.
// ============================================================================

export type NotificationChannel = "inApp" | "email";

export interface EventSpec {
  key: string;
  label: string;
  description?: string;
  category: "tickets" | "projects" | "calendar" | "infra" | "system";
  /** Valeur par défaut quand l'utilisateur n'a rien personnalisé. */
  defaults: Record<NotificationChannel, boolean>;
}

export const EVENTS: EventSpec[] = [
  // ---------- Tickets ---------------------------------------------------
  {
    key: "ticket_assigned",
    label: "Ticket assigné à vous",
    description: "Vous recevez une notification quand un ticket vous est assigné.",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "ticket_unassigned_pool",
    label: "Nouveau ticket à prendre en charge",
    description: "Quand un ticket est créé sans assigné, tous les agents sont alertés.",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "ticket_collaborator_added",
    label: "Ajouté comme collaborateur",
    description: "Vous recevez une notification quand un agent vous ajoute comme collaborateur sur un ticket.",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "ticket_status_change",
    label: "Changement de statut d'un ticket",
    description: "Notifie sur les tickets que vous avez assignés, créés ou suivis.",
    category: "tickets",
    defaults: { inApp: true, email: false },
  },
  {
    key: "ticket_comment",
    label: "Nouveau commentaire sur un ticket",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "ticket_mention",
    label: "Mention dans un commentaire",
    description: "Quand un agent vous mentionne avec @ dans un commentaire de ticket.",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "ticket_resolved",
    label: "Ticket résolu",
    category: "tickets",
    defaults: { inApp: false, email: true },
  },
  {
    key: "ticket_reminder",
    label: "Rappel de ticket",
    description: "Quand un rappel configuré sur un ticket arrive à échéance.",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "sla_warning",
    label: "SLA bientôt expiré",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  {
    key: "sla_breach",
    label: "SLA dépassé",
    category: "tickets",
    defaults: { inApp: true, email: true },
  },
  // ---------- Projets ---------------------------------------------------
  {
    key: "project_assigned",
    label: "Assigné à un projet",
    description: "Client ou interne.",
    category: "projects",
    defaults: { inApp: true, email: true },
  },
  {
    key: "project_status_change",
    label: "Changement de statut de projet",
    category: "projects",
    defaults: { inApp: true, email: false },
  },
  {
    key: "project_task_update",
    label: "Mise à jour d'une tâche de projet",
    category: "projects",
    defaults: { inApp: true, email: false },
  },
  // ---------- Calendrier / rappels --------------------------------------
  {
    key: "meeting_invite",
    label: "Invitation à une rencontre",
    category: "calendar",
    defaults: { inApp: true, email: true },
  },
  {
    key: "meeting_reminder",
    label: "Rappel de rencontre",
    category: "calendar",
    defaults: { inApp: true, email: false },
  },
  {
    key: "renewal_reminder",
    label: "Rappel de renouvellement",
    description: "Licences, contrats, certificats SSL.",
    category: "calendar",
    defaults: { inApp: true, email: true },
  },
  // ---------- Infrastructure --------------------------------------------
  {
    key: "backup_failed",
    label: "Échec de sauvegarde",
    description: "Notification quand une tâche Veeam ou autre moteur de backup échoue.",
    category: "infra",
    defaults: { inApp: true, email: true },
  },
  {
    key: "monitoring_alert",
    label: "Alerte monitoring",
    description: "Alerte générée par les sources de monitoring (Datto, Atera, etc.).",
    category: "infra",
    defaults: { inApp: true, email: true },
  },
  // ---------- Système ---------------------------------------------------
  {
    key: "weekly_digest",
    label: "Rapport hebdomadaire",
    description: "Résumé chaque lundi matin de la semaine précédente.",
    category: "system",
    defaults: { inApp: false, email: true },
  },
];

export const EVENT_KEYS = EVENTS.map((e) => e.key);
export type EventKey = (typeof EVENT_KEYS)[number];

export function getEventDefaults(key: string): EventSpec["defaults"] {
  const e = EVENTS.find((x) => x.key === key);
  return e?.defaults ?? { inApp: true, email: false };
}
