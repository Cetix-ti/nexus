// ============================================================================
// VARIABLE CATALOG — source de vérité des `{{variables}}` exposées par
// chaque event email.
//
// Pour chaque event, on déclare :
//   - les variables disponibles dans le payload côté serveur (catalogué)
//   - leur description (affichée dans le picker UI admin)
//   - leur exemple (preview WYSIWYG)
//
// Les payload builders par event (lib/email/payloads/*.ts) garantissent
// que chaque variable du catalogue est effectivement fournie au moment
// du dispatch. Une variable utilisée dans un template mais absente du
// payload sera remplacée par une chaîne vide (et logguée en warning).
// ============================================================================

export interface VariableDef {
  /** Nom utilisé dans le template — `{{var_name}}` */
  key: string;
  /** Libellé affiché dans le picker UI */
  label: string;
  /** Description courte (tooltip / hint) */
  description: string;
  /** Exemple — utilisé pour le preview du template dans l'UI admin */
  example: string;
}

export interface EventVariables {
  /** Clé d'event (= EmailTemplate.eventKey) */
  eventKey: string;
  /** Audience par défaut */
  audience: "agent" | "contact";
  variables: VariableDef[];
}

// ----------------------------------------------------------------------------
// Variables communes — disponibles dans TOUS les events
// ----------------------------------------------------------------------------
const COMMON_VARS: VariableDef[] = [
  { key: "app_url", label: "URL de Nexus", description: "URL de base de l'application", example: "https://nexus.cetix.ca" },
  { key: "company_name", label: "Nom de l'entreprise", description: "Nom Cetix (configurable via env)", example: "Cetix Informatique" },
  { key: "now", label: "Date/heure courante", description: "Horodatage de l'envoi (format FR)", example: "27 avril 2026 à 14:32" },
];

// ----------------------------------------------------------------------------
// Variables ticket — communes à tous les events ticket_*
// ----------------------------------------------------------------------------
const TICKET_VARS: VariableDef[] = [
  { key: "ticket_number", label: "Numéro brut", description: "Numéro interne du ticket", example: "2347" },
  { key: "ticket_display_number", label: "Numéro affiché", description: "Numéro avec préfixe client", example: "#A2347" },
  { key: "ticket_subject", label: "Sujet", description: "Titre du ticket", example: "Imprimante en panne" },
  { key: "ticket_priority", label: "Priorité (raw)", description: "Code de priorité", example: "HIGH" },
  { key: "ticket_priority_label", label: "Priorité (libellé)", description: "Libellé localisé", example: "Élevée" },
  { key: "ticket_priority_emoji", label: "Priorité (emoji)", description: "Pictogramme de priorité", example: "🔴" },
  { key: "ticket_status", label: "Statut (raw)", description: "Code de statut", example: "IN_PROGRESS" },
  { key: "ticket_status_label", label: "Statut (libellé)", description: "Libellé localisé", example: "En cours" },
  { key: "ticket_url", label: "Lien direct", description: "URL absolue vers le ticket", example: "https://nexus.cetix.ca/tickets/abc" },
  { key: "ticket_description_excerpt", label: "Extrait de description", description: "300 premiers caractères, HTML strippé", example: "L'imprimante du 2e étage refuse d'imprimer en couleur depuis ce matin…" },
  { key: "ticket_created_at", label: "Date de création", description: "Format FR", example: "27 avril 2026 à 14:32" },
  { key: "ticket_sla_deadline", label: "Échéance SLA", description: "Date de breach résolution", example: "30 avril 2026 à 17:00" },
  { key: "ticket_sla_state", label: "État SLA", description: "à temps / risque / breach", example: "risque" },
];

// ----------------------------------------------------------------------------
// Variables organisation — disponibles dans tout event lié à un client
// ----------------------------------------------------------------------------
const ORG_VARS: VariableDef[] = [
  { key: "org_name", label: "Nom du client", description: "Nom complet de l'organisation", example: "Ville de Sainte-Anne-de-Bellevue" },
  { key: "org_code", label: "Code client", description: "Code court (ex: SADB) — préféré dans les sujets de courriel", example: "SADB" },
  { key: "org_id", label: "ID du client", description: "Identifiant interne", example: "cmnp2evjs0016cdkc" },
  { key: "org_url", label: "Lien vers l'org", description: "URL absolue de la fiche org", example: "https://nexus.cetix.ca/organisations/sadb" },
];

// ----------------------------------------------------------------------------
// Variables agent / requester
// ----------------------------------------------------------------------------
const PEOPLE_VARS: VariableDef[] = [
  { key: "assignee_name", label: "Nom de l'assigné", description: "Prénom + Nom", example: "Bruno Robert" },
  { key: "assignee_email", label: "Email de l'assigné", description: "Email Nexus", example: "bruno.robert@cetix.ca" },
  { key: "requester_name", label: "Nom du demandeur", description: "Prénom + Nom du contact", example: "Sophie Dupont" },
  { key: "requester_email", label: "Email du demandeur", description: "Email du contact", example: "sophie.dupont@example.com" },
  { key: "actor_name", label: "Auteur de l'action", description: "Personne qui a déclenché l'event", example: "Bruno Robert" },
];

// ----------------------------------------------------------------------------
// Catalogue par event
// ----------------------------------------------------------------------------
export const EVENT_VARIABLES: EventVariables[] = [
  {
    eventKey: "ticket_assigned",
    audience: "agent",
    variables: [...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS],
  },
  {
    eventKey: "ticket_unassigned_pool",
    audience: "agent",
    variables: [...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS],
  },
  {
    eventKey: "ticket_collaborator_added",
    audience: "agent",
    variables: [...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS],
  },
  {
    eventKey: "ticket_status_change",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "previous_status_label", label: "Statut précédent", description: "Libellé localisé du statut avant la transition", example: "Ouvert" },
    ],
  },
  {
    eventKey: "ticket_resolved",
    audience: "agent",
    variables: [...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS],
  },
  {
    eventKey: "ticket_comment",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "comment_excerpt", label: "Extrait du commentaire", description: "300 premiers caractères, HTML strippé", example: "J'ai vérifié les drivers, c'est OK. Reste à tester le toner…" },
      { key: "comment_is_internal", label: "Note interne ?", description: "true/false", example: "false" },
    ],
  },
  {
    eventKey: "ticket_mention",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "comment_excerpt", label: "Extrait du commentaire", description: "300 premiers caractères, HTML strippé", example: "@bruno peux-tu jeter un œil ?" },
    ],
  },
  {
    eventKey: "ticket_reminder",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "reminder_message", label: "Message du rappel", description: "Texte saisi à la création du rappel", example: "Vérifier que le client a bien reçu la facture" },
    ],
  },
  {
    eventKey: "ticket_approval_decided",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "approval_decision", label: "Décision", description: "APPROVED ou REJECTED", example: "APPROVED" },
      { key: "approval_decision_label", label: "Décision (libellé)", description: "Libellé localisé", example: "Approuvé" },
      { key: "approval_note", label: "Note de décision", description: "Justification de l'approbateur", example: "OK pour livraison cette semaine." },
    ],
  },
  {
    eventKey: "project_assigned",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS, ...PEOPLE_VARS,
      { key: "project_name", label: "Nom du projet", description: "Titre du projet", example: "Migration Office 365" },
      { key: "project_url", label: "Lien projet", description: "URL absolue", example: "https://nexus.cetix.ca/projects/abc" },
    ],
  },
  {
    eventKey: "backup_failed",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS,
      { key: "backup_job_name", label: "Job de sauvegarde", description: "Nom du job Veeam", example: "Daily-File-Server" },
      { key: "backup_failure_reason", label: "Raison de l'échec", description: "Message technique", example: "Network timeout to repository" },
    ],
  },
  {
    eventKey: "monitoring_alert",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS,
      { key: "alert_source", label: "Source de l'alerte", description: "Datto / Atera / Wazuh / etc.", example: "Datto" },
      { key: "alert_severity", label: "Sévérité", description: "low/medium/high/critical", example: "high" },
      { key: "alert_title", label: "Titre de l'alerte", description: "Sujet de l'alerte", example: "CPU > 90% pendant 10 min" },
      { key: "alert_message", label: "Message complet", description: "Détails de l'alerte", example: "Le serveur SADB-DC1 a dépassé le seuil…" },
    ],
  },
  {
    eventKey: "meeting_invite",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS,
      { key: "meeting_title", label: "Titre", description: "Sujet de la rencontre", example: "Comité IT trimestriel" },
      { key: "meeting_starts_at", label: "Date/heure", description: "Format FR avec heure", example: "30 avril 2026 à 10:00" },
      { key: "meeting_location", label: "Lieu", description: "Bureau / lien Teams / Zoom", example: "Bureau Cetix Montréal" },
    ],
  },
  {
    eventKey: "meeting_reminder",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS,
      { key: "meeting_title", label: "Titre", description: "Sujet de la rencontre", example: "Comité IT trimestriel" },
      { key: "meeting_starts_at", label: "Date/heure", description: "Format FR avec heure", example: "30 avril 2026 à 10:00" },
      { key: "meeting_minutes_until", label: "Minutes restantes", description: "Délai avant le début", example: "30" },
    ],
  },
  {
    eventKey: "renewal_reminder",
    audience: "agent",
    variables: [
      ...COMMON_VARS, ...ORG_VARS,
      { key: "renewal_type", label: "Type", description: "Licence / Garantie / Abonnement / Support", example: "Licence" },
      { key: "renewal_label", label: "Libellé", description: "Nom du renouvellement", example: "Microsoft 365 Business Premium" },
      { key: "renewal_due_at", label: "Échéance", description: "Date de fin", example: "15 mai 2026" },
      { key: "renewal_days_left", label: "Jours restants", description: "Nombre de jours avant échéance", example: "14" },
      { key: "renewal_amount", label: "Montant", description: "Montant prévu (optionnel)", example: "1 250,00 $" },
    ],
  },
  {
    eventKey: "weekly_digest",
    audience: "agent",
    variables: [
      ...COMMON_VARS,
      { key: "agent_name", label: "Nom de l'agent", description: "Destinataire du digest", example: "Bruno Robert" },
      { key: "week_range", label: "Plage de la semaine", description: "Début – fin", example: "20 avril – 27 avril" },
      { key: "tickets_created", label: "Tickets traités", description: "Créés ou assignés sur la période", example: "12" },
      { key: "tickets_resolved", label: "Tickets résolus", description: "Résolus sur la période", example: "8" },
      { key: "tickets_overdue", label: "Tickets en retard", description: "Assignés et toujours en retard", example: "2" },
      { key: "hours_logged", label: "Heures saisies", description: "Total heures sur la période", example: "32.5" },
      { key: "upcoming_renewals", label: "Renouvellements 14j", description: "À venir dans les 14 jours", example: "3" },
      { key: "upcoming_visits", label: "Visites sur place 7j", description: "À venir dans les 7 jours", example: "2" },
    ],
  },
  {
    eventKey: "bug_reported",
    audience: "agent",
    variables: [
      ...COMMON_VARS,
      { key: "bug_title", label: "Titre du bug", description: "Sujet du signalement", example: "Le bouton supprimer ne marche pas sur mobile" },
      { key: "bug_severity", label: "Sévérité", description: "Mineur / Moyen / Majeur / Critique", example: "Majeur" },
      { key: "reporter_name", label: "Auteur", description: "Nom du signaleur", example: "Bruno Robert" },
      { key: "bug_url", label: "Lien vers le bug", description: "URL absolue", example: "https://nexus.cetix.ca/admin/bugs/abc" },
    ],
  },
  {
    eventKey: "bug_reported_ack",
    audience: "agent",
    variables: [
      ...COMMON_VARS,
      { key: "bug_title", label: "Titre du bug", description: "Sujet du signalement", example: "Le bouton supprimer ne marche pas sur mobile" },
      { key: "reporter_name", label: "Auteur", description: "Nom du signaleur (= destinataire)", example: "Bruno Robert" },
    ],
  },
  // Events contact (envoyés aux clients) — typiquement gardés sobres
  {
    eventKey: "ticket_creation_confirm",
    audience: "contact",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS,
      { key: "requester_name", label: "Nom du demandeur", description: "Prénom + Nom du contact", example: "Sophie Dupont" },
    ],
  },
  {
    eventKey: "ticket_taken_over",
    audience: "contact",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS,
      { key: "requester_name", label: "Nom du demandeur", description: "Prénom + Nom du contact", example: "Sophie Dupont" },
      { key: "assignee_name", label: "Nom du tech", description: "Tech qui prend en charge", example: "Bruno Robert" },
    ],
  },
  {
    eventKey: "ticket_reply",
    audience: "contact",
    variables: [
      ...COMMON_VARS, ...TICKET_VARS, ...ORG_VARS,
      { key: "requester_name", label: "Nom du demandeur", description: "Prénom + Nom du contact", example: "Sophie Dupont" },
      { key: "actor_name", label: "Auteur de la réponse", description: "Le tech qui a répondu", example: "Bruno Robert" },
      { key: "reply_excerpt", label: "Extrait de la réponse", description: "300 premiers caractères", example: "Bonjour Sophie, je viens de remplacer le toner…" },
    ],
  },
];

/** Retourne les variables disponibles pour un event donné. */
export function getVariablesForEvent(eventKey: string): VariableDef[] {
  const ev = EVENT_VARIABLES.find((e) => e.eventKey === eventKey);
  return ev?.variables ?? COMMON_VARS;
}

/** Set des keys connues (pour la validation à la sauvegarde d'un template). */
export function getValidVariableKeys(eventKey: string): Set<string> {
  return new Set(getVariablesForEvent(eventKey).map((v) => v.key));
}

/** Construit un payload "exemple" pour le preview UI. */
export function buildExamplePayload(eventKey: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of getVariablesForEvent(eventKey)) out[v.key] = v.example;
  return out;
}
