import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, hasCapability } from "@/lib/auth-utils";
import { runQboQuery } from "@/lib/analytics/qbo-handler";
import { resolveLabels } from "@/lib/analytics/label-resolver";

// Datasets & fields that expose financial information. Any query touching
// them (groupBy, aggregateField, or filter field) requires the "finances"
// capability — otherwise a technicien pourrait, via l'éditeur de widgets,
// interroger amount/hourlyRate/monthlyHours et contourner la page /finances.
const FINANCE_GATED_DATASETS = new Set([
  "contracts", "expense_reports", "purchase_orders",
  "qbo_invoices", "qbo_customers", "qbo_payments", "qbo_expenses",
]);
const FINANCE_GATED_FIELDS = new Set([
  "amount", "hourlyRate", "monthlyHours", "totalAmount", "subtotal", "taxAmount",
]);

/**
 * POST /api/v1/analytics/query
 *
 * Moteur de requête universel pour les widgets personnalisés.
 *
 * Extensions :
 *   - 12 datasets (tickets, time_entries, contacts, organizations,
 *     contracts, assets, projects, expense_reports, purchase_orders,
 *     monitoring_alerts, security_alerts, calendar_events)
 *   - 8 agrégations : count, count_distinct, sum, avg, min, max, median, percentage
 *   - 10 opérateurs de filtre : eq, neq, gt, lt, gte, lte, in, contains, isnull, between
 *   - Grouping temporel : _by_day, _by_week, _by_month, _by_quarter, _by_year
 */

// ============================================================================
// Dataset definitions
// ============================================================================

export interface FieldDef {
  name: string;
  label: string;
  type: "enum" | "string" | "number" | "boolean" | "date" | "relation";
  groupable: boolean;
  aggregable: boolean;
  /**
   * Diviseur appliqué à toute valeur agrégée de ce champ avant retour
   * au client. Utile pour convertir des unités de stockage en unités
   * d'affichage (ex. durationMinutes stocké en min → affiché en heures
   * avec outputDivide=60). La somme est d'abord calculée par Prisma en
   * min, puis divisée par 60 ici et arrondie 2 décimales.
   */
  outputDivide?: number;
  /**
   * Valeurs possibles pour les champs enum/string. Exposées au builder
   * de widgets pour présenter un vrai sélecteur au lieu d'un input texte.
   * Peut être omis pour les strings libres.
   */
  values?: readonly string[];
  /**
   * Marque un champ comme virtuel (non présent en DB, résolu côté serveur).
   * Ex: `categoryBaseId` groupe par la racine de l'arbre de catégories.
   */
  virtual?: boolean;
}

export interface DatasetDef {
  model: string;
  fields: FieldDef[];
  defaultDateField: string;
  dateFields: string[];
}

export const DATASETS: Record<string, DatasetDef> = {
  tickets: {
    model: "ticket",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "resolvedAt", "closedAt", "dueAt", "firstResponseAt"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false,
        values: ["NEW", "OPEN", "IN_PROGRESS", "ON_SITE", "PENDING", "WAITING_CLIENT", "WAITING_VENDOR", "SCHEDULED", "RESOLVED", "CLOSED", "CANCELLED"] },
      { name: "priority", label: "Priorité", type: "enum", groupable: true, aggregable: false,
        values: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false,
        values: ["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE", "ALERT"] },
      { name: "urgency", label: "Urgence", type: "enum", groupable: true, aggregable: false,
        values: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { name: "impact", label: "Impact", type: "enum", groupable: true, aggregable: false,
        values: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { name: "source", label: "Source", type: "enum", groupable: true, aggregable: false,
        values: ["PORTAL", "EMAIL", "PHONE", "CHAT", "API", "MONITORING", "AUTOMATION"] },
      { name: "prioritySource", label: "Origine priorité", type: "enum", groupable: true, aggregable: false,
        values: ["DEFAULT", "MANUAL", "AI"] },
      { name: "categorySource", label: "Origine catégorie", type: "enum", groupable: true, aggregable: false,
        values: ["DEFAULT", "MANUAL", "AI"] },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "assigneeId", label: "Assigné à", type: "relation", groupable: true, aggregable: false },
      { name: "creatorId", label: "Créé par", type: "relation", groupable: true, aggregable: false },
      { name: "requesterId", label: "Demandeur", type: "relation", groupable: true, aggregable: false },
      { name: "categoryId", label: "Catégorie", type: "relation", groupable: true, aggregable: false },
      { name: "categoryBaseId", label: "Catégorie de base", type: "relation", groupable: true, aggregable: false, virtual: true },
      // Virtuel : type de travail dérivé des saisies de temps liées au ticket.
      // Un ticket avec des entrées de plusieurs types apparaît dans chaque bucket.
      // Un ticket sans aucune saisie de temps tombe dans « — Sans saisie —».
      { name: "timeType", label: "Type de travail (saisies de temps)", type: "enum", groupable: true, aggregable: false, virtual: true,
        values: ["remote_work", "onsite_work", "travel", "preparation", "administration", "waiting", "follow_up", "internal", "other"] },
      { name: "queueId", label: "File d'attente", type: "relation", groupable: true, aggregable: false },
      { name: "projectId", label: "Projet lié", type: "relation", groupable: true, aggregable: false },
      { name: "slaBreached", label: "SLA dépassé", type: "boolean", groupable: true, aggregable: false },
      { name: "isOverdue", label: "En retard", type: "boolean", groupable: true, aggregable: false },
      { name: "isEscalated", label: "Escaladé", type: "boolean", groupable: true, aggregable: false },
      { name: "isInternal", label: "Interne", type: "boolean", groupable: true, aggregable: false },
      { name: "monitoringStage", label: "Stage monitoring", type: "enum", groupable: true, aggregable: false,
        values: ["TRIAGE", "INVESTIGATING", "WAITING_PARTS", "WAITING_VENDOR", "SCHEDULED", "RESOLVED"] },
      { name: "requiresOnSite", label: "Sur place requis", type: "boolean", groupable: true, aggregable: false },
      { name: "approvalStatus", label: "Statut approbation", type: "enum", groupable: true, aggregable: false,
        values: ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"] },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "resolvedAt", label: "Date de résolution", type: "date", groupable: true, aggregable: false },
      { name: "closedAt", label: "Date de fermeture", type: "date", groupable: true, aggregable: false },
      { name: "dueAt", label: "Échéance SLA", type: "date", groupable: true, aggregable: false },
      { name: "firstResponseAt", label: "Première réponse", type: "date", groupable: true, aggregable: false },
      { name: "number", label: "Numéro", type: "number", groupable: false, aggregable: true },
      { name: "categoryConfidence", label: "Confiance catégorie IA", type: "number", groupable: false, aggregable: true },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  time_entries: {
    model: "timeEntry",
    defaultDateField: "startedAt",
    dateFields: ["startedAt", "endedAt", "createdAt"],
    fields: [
      // Valeurs alignées sur celles effectivement assignées par
      // src/lib/billing/engine.ts (8 statuses). Source unique de vérité :
      // src/lib/billing/coverage-statuses.ts. "excluded_from_billing" et
      // "travel_non_billable" étaient phantoms (jamais assignés) — retirés.
      { name: "coverageStatus", label: "Couverture", type: "enum", groupable: true, aggregable: false,
        values: ["billable", "travel_billable", "hour_bank_overage", "msp_overage", "included_in_contract", "deducted_from_hour_bank", "non_billable", "internal_time"] },
      { name: "timeType", label: "Type de travail", type: "enum", groupable: true, aggregable: false,
        values: ["remote_work", "onsite_work", "travel", "preparation", "administration", "waiting", "follow_up", "internal", "other"] },
      { name: "approvalStatus", label: "Statut approbation", type: "enum", groupable: true, aggregable: false,
        values: ["draft", "submitted", "approved", "rejected"] },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "agentId", label: "Technicien", type: "relation", groupable: true, aggregable: false },
      { name: "ticketId", label: "Ticket", type: "relation", groupable: true, aggregable: false },
      { name: "isOnsite", label: "Sur place", type: "boolean", groupable: true, aggregable: false },
      { name: "hasTravelBilled", label: "Déplacement facturé", type: "boolean", groupable: true, aggregable: false },
      { name: "isAfterHours", label: "Hors heures", type: "boolean", groupable: true, aggregable: false },
      { name: "isWeekend", label: "Fin de semaine", type: "boolean", groupable: true, aggregable: false },
      { name: "isUrgent", label: "Urgent", type: "boolean", groupable: true, aggregable: false },
      // Stocké en minutes en DB mais exposé en heures pour l'affichage.
      // Le moteur divise toute valeur agrégée par 60 et arrondit 2 décimales.
      { name: "durationMinutes", label: "Durée (heures)", type: "number", groupable: false, aggregable: true, outputDivide: 60 },
      { name: "amount", label: "Montant ($)", type: "number", groupable: false, aggregable: true },
      { name: "hourlyRate", label: "Taux horaire ($)", type: "number", groupable: false, aggregable: true },
      { name: "startedAt", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de saisie", type: "date", groupable: true, aggregable: false },
    ],
  },
  contacts: {
    model: "contact",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "lastPortalLoginAt"],
    fields: [
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "isVIP", label: "VIP", type: "boolean", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "portalEnabled", label: "Portail activé", type: "boolean", groupable: true, aggregable: false },
      { name: "portalStatus", label: "Statut RH portail", type: "string", groupable: true, aggregable: false },
      { name: "jobTitle", label: "Poste", type: "string", groupable: true, aggregable: false },
      { name: "locale", label: "Langue", type: "string", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "lastPortalLoginAt", label: "Dernière connexion portail", type: "date", groupable: true, aggregable: false },
    ],
  },
  organizations: {
    model: "organization",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "plan", label: "Plan", type: "string", groupable: true, aggregable: false },
      { name: "isActive", label: "Actif", type: "boolean", groupable: true, aggregable: false },
      { name: "isInternal", label: "Interne", type: "boolean", groupable: true, aggregable: false },
      { name: "portalEnabled", label: "Portail activé", type: "boolean", groupable: true, aggregable: false },
      { name: "city", label: "Ville", type: "string", groupable: true, aggregable: false },
      { name: "province", label: "Province", type: "string", groupable: true, aggregable: false },
      { name: "country", label: "Pays", type: "string", groupable: true, aggregable: false },
      { name: "clientCode", label: "Code client", type: "string", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  contracts: {
    model: "contract",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "startDate", "endDate"],
    fields: [
      { name: "type", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "name", label: "Nom du contrat", type: "string", groupable: true, aggregable: false },
      { name: "monthlyHours", label: "Heures mensuelles", type: "number", groupable: false, aggregable: true },
      { name: "hourlyRate", label: "Taux horaire", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "startDate", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "endDate", label: "Date de fin", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  assets: {
    model: "asset",
    defaultDateField: "createdAt",
    dateFields: ["createdAt"],
    fields: [
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "source", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "manufacturer", label: "Fabricant", type: "string", groupable: true, aggregable: false },
      { name: "model", label: "Modèle", type: "string", groupable: true, aggregable: false },
      { name: "os", label: "Système d'exploitation", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "warrantyExpiry", label: "Expiration garantie", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  projects: {
    model: "project",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "startDate", "targetEndDate", "actualEndDate"],
    fields: [
      { name: "status", label: "Statut", type: "string", groupable: true, aggregable: false },
      { name: "type", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "priority", label: "Priorité", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "managerId", label: "Gestionnaire", type: "relation", groupable: true, aggregable: false },
      { name: "isAtRisk", label: "À risque", type: "boolean", groupable: true, aggregable: false },
      { name: "isArchived", label: "Archivé", type: "boolean", groupable: true, aggregable: false },
      { name: "progressPercent", label: "Progression (%)", type: "number", groupable: false, aggregable: true },
      { name: "consumedHours", label: "Heures consommées", type: "number", groupable: false, aggregable: true },
      { name: "budgetHours", label: "Budget heures", type: "number", groupable: false, aggregable: true },
      { name: "budgetAmount", label: "Budget ($)", type: "number", groupable: false, aggregable: true },
      { name: "consumedAmount", label: "Consommé ($)", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "startDate", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "targetEndDate", label: "Date de fin cible", type: "date", groupable: true, aggregable: false },
      { name: "actualEndDate", label: "Date de fin réelle", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  expense_reports: {
    model: "expenseReport",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "submittedAt", "approvedAt", "periodStart", "periodEnd"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "submitterId", label: "Soumetteur", type: "relation", groupable: true, aggregable: false },
      { name: "approvedById", label: "Approuvé par", type: "relation", groupable: true, aggregable: false },
      { name: "title", label: "Titre", type: "string", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "submittedAt", label: "Date de soumission", type: "date", groupable: true, aggregable: false },
      { name: "approvedAt", label: "Date d'approbation", type: "date", groupable: true, aggregable: false },
      { name: "periodStart", label: "Période début", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  purchase_orders: {
    model: "purchaseOrder",
    defaultDateField: "createdAt",
    dateFields: ["createdAt", "expectedDate", "receivedDate", "submittedAt", "approvedAt"],
    fields: [
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "vendorName", label: "Fournisseur", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "requestedById", label: "Demandé par", type: "relation", groupable: true, aggregable: false },
      { name: "approvedById", label: "Approuvé par", type: "relation", groupable: true, aggregable: false },
      { name: "currency", label: "Devise", type: "string", groupable: true, aggregable: false },
      { name: "poNumber", label: "Numéro PO", type: "string", groupable: true, aggregable: false },
      { name: "totalAmount", label: "Montant total", type: "number", groupable: false, aggregable: true },
      { name: "subtotal", label: "Sous-total", type: "number", groupable: false, aggregable: true },
      { name: "taxAmount", label: "Taxes", type: "number", groupable: false, aggregable: true },
      { name: "createdAt", label: "Date de création", type: "date", groupable: true, aggregable: false },
      { name: "submittedAt", label: "Date de soumission", type: "date", groupable: true, aggregable: false },
      { name: "approvedAt", label: "Date d'approbation", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  monitoring_alerts: {
    model: "monitoringAlert",
    defaultDateField: "receivedAt",
    dateFields: ["receivedAt", "resolvedAt"],
    fields: [
      { name: "sourceType", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "severity", label: "Sévérité", type: "string", groupable: true, aggregable: false },
      { name: "stage", label: "Stage", type: "string", groupable: true, aggregable: false },
      { name: "messageKind", label: "Type de message", type: "string", groupable: true, aggregable: false },
      { name: "isResolved", label: "Résolu", type: "boolean", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "ticketId", label: "Ticket lié", type: "relation", groupable: true, aggregable: false },
      { name: "senderDomain", label: "Domaine expéditeur", type: "string", groupable: true, aggregable: false },
      { name: "receivedAt", label: "Date de réception", type: "date", groupable: true, aggregable: false },
      { name: "resolvedAt", label: "Date de résolution", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  security_alerts: {
    model: "securityAlert",
    defaultDateField: "receivedAt",
    dateFields: ["receivedAt"],
    fields: [
      { name: "source", label: "Source", type: "string", groupable: true, aggregable: false },
      { name: "kind", label: "Type", type: "string", groupable: true, aggregable: false },
      { name: "severity", label: "Sévérité", type: "string", groupable: true, aggregable: false },
      { name: "isLowPriority", label: "Basse priorité", type: "boolean", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "endpoint", label: "Endpoint", type: "string", groupable: true, aggregable: false },
      { name: "userPrincipal", label: "Utilisateur affecté", type: "string", groupable: true, aggregable: false },
      { name: "incidentId", label: "Incident lié", type: "relation", groupable: true, aggregable: false },
      { name: "receivedAt", label: "Date de réception", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  calendar_events: {
    model: "calendarEvent",
    defaultDateField: "startsAt",
    dateFields: ["startsAt", "endsAt", "createdAt"],
    fields: [
      { name: "kind", label: "Type", type: "enum", groupable: true, aggregable: false },
      { name: "status", label: "Statut", type: "enum", groupable: true, aggregable: false },
      { name: "allDay", label: "Journée complète", type: "boolean", groupable: true, aggregable: false },
      { name: "location", label: "Lieu", type: "string", groupable: true, aggregable: false },
      { name: "renewalType", label: "Type de renouvellement", type: "string", groupable: true, aggregable: false },
      { name: "leaveType", label: "Type d'absence", type: "string", groupable: true, aggregable: false },
      { name: "recurrence", label: "Récurrence", type: "string", groupable: true, aggregable: false },
      { name: "organizationId", label: "Organisation", type: "relation", groupable: true, aggregable: false },
      { name: "ownerId", label: "Propriétaire", type: "relation", groupable: true, aggregable: false },
      { name: "siteId", label: "Site", type: "relation", groupable: true, aggregable: false },
      { name: "renewalAmount", label: "Montant renouvellement", type: "number", groupable: false, aggregable: true },
      { name: "startsAt", label: "Date de début", type: "date", groupable: true, aggregable: false },
      { name: "endsAt", label: "Date de fin", type: "date", groupable: true, aggregable: false },
      { name: "id", label: "ID", type: "string", groupable: false, aggregable: true },
    ],
  },
  // QuickBooks Online — ces datasets ne sont PAS stockés localement. Les
  // requêtes passent par le client QBO (lib/quickbooks/client.ts) et les
  // filtres/group/aggregate sont appliqués en mémoire. Gated finances.
  qbo_invoices: {
    model: "__qbo_invoices__",
    defaultDateField: "txnDate",
    dateFields: ["txnDate", "dueDate"],
    fields: [
      { name: "status",       label: "Statut",          type: "enum",   groupable: true,  aggregable: false },
      { name: "customerName", label: "Client QBO",      type: "string", groupable: true,  aggregable: false },
      { name: "docNumber",    label: "Numéro facture",  type: "string", groupable: true,  aggregable: false },
      { name: "totalAmount",  label: "Montant total",   type: "number", groupable: false, aggregable: true },
      { name: "balance",      label: "Solde dû",        type: "number", groupable: false, aggregable: true },
      { name: "txnDate",      label: "Date facture",    type: "date",   groupable: true,  aggregable: false },
      { name: "dueDate",      label: "Échéance",        type: "date",   groupable: true,  aggregable: false },
      { name: "id",           label: "ID",              type: "string", groupable: false, aggregable: true },
    ],
  },
  qbo_customers: {
    model: "__qbo_customers__",
    defaultDateField: "",
    dateFields: [],
    fields: [
      { name: "displayName", label: "Nom d'affichage", type: "string",  groupable: true,  aggregable: false },
      { name: "companyName", label: "Entreprise",      type: "string",  groupable: true,  aggregable: false },
      { name: "email",       label: "Courriel",        type: "string",  groupable: true,  aggregable: false },
      { name: "active",      label: "Actif",           type: "boolean", groupable: true,  aggregable: false },
      { name: "balance",     label: "Solde client",    type: "number",  groupable: false, aggregable: true },
      { name: "id",          label: "ID",              type: "string",  groupable: false, aggregable: true },
    ],
  },
  qbo_payments: {
    model: "__qbo_payments__",
    defaultDateField: "txnDate",
    dateFields: ["txnDate"],
    fields: [
      { name: "customerName", label: "Client QBO",    type: "string", groupable: true,  aggregable: false },
      { name: "totalAmount",  label: "Montant payé",  type: "number", groupable: false, aggregable: true },
      { name: "txnDate",      label: "Date paiement", type: "date",   groupable: true,  aggregable: false },
      { name: "id",           label: "ID",            type: "string", groupable: false, aggregable: true },
    ],
  },
  qbo_expenses: {
    model: "__qbo_expenses__",
    defaultDateField: "txnDate",
    dateFields: ["txnDate"],
    fields: [
      { name: "vendorName",  label: "Fournisseur",    type: "string", groupable: true,  aggregable: false },
      { name: "accountName", label: "Compte / catégorie", type: "string", groupable: true, aggregable: false },
      { name: "paymentType", label: "Mode de paiement", type: "enum", groupable: true, aggregable: false },
      { name: "docNumber",   label: "Numéro",         type: "string", groupable: true,  aggregable: false },
      { name: "totalAmount", label: "Montant dépensé", type: "number", groupable: false, aggregable: true },
      { name: "txnDate",     label: "Date dépense",   type: "date",   groupable: true,  aggregable: false },
      { name: "id",          label: "ID",             type: "string", groupable: false, aggregable: true },
    ],
  },
};

const QBO_DATASETS = new Set(["qbo_invoices", "qbo_customers", "qbo_payments", "qbo_expenses"]);

// ============================================================================
// Relation resolution
//
// Map PAR DATASET des champs relation → spec d'include Prisma. Règle clé :
// on ne peut faire un `include` que si le modèle Prisma a effectivement
// déclaré la relation. Certains modèles (TimeEntry notamment) n'ont pas
// de relation `organization` / `agent` déclarée — dans ce cas le champ
// est absent de la map, et la résolution des labels se fait EN AVAL via
// `resolveLabels()` (batch lookup User/Org/Ticket/Contract par cuid).
//
// Tenter un include sur une relation non déclarée provoque une erreur
// Prisma "Unknown field 'X' for include statement on model Y".
// ============================================================================

type RelationIncludes = Record<string, unknown>;

const USER_SELECT = { firstName: true, lastName: true };

const DATASET_RELATION_INCLUDES: Record<string, RelationIncludes> = {
  tickets: {
    organizationId: { organization: { select: { name: true } } },
    siteId: { site: { select: { name: true } } },
    assigneeId: { assignee: { select: USER_SELECT } },
    creatorId: { creator: { select: USER_SELECT } },
    requesterId: { requester: { select: { firstName: true, lastName: true } } },
    categoryId: { category: { select: { name: true } } },
    // Pour le virtual "categoryBaseId" on précharge parentId en plus pour
    // pouvoir remonter au root de l'arbre de catégories.
    categoryBaseId: { category: { select: { id: true, name: true, parentId: true } } },
    queueId: { queue: { select: { name: true } } },
    projectId: { project: { select: { name: true } } },
  },
  time_entries: {
    // Aucune relation déclarée sur TimeEntry — resolveLabels() résout
    // organizationId / agentId / ticketId via lookups batch post-query.
  },
  contacts: {
    organizationId: { organization: { select: { name: true } } },
  },
  organizations: {},
  contracts: {
    organizationId: { organization: { select: { name: true } } },
  },
  assets: {
    organizationId: { organization: { select: { name: true } } },
    siteId: { site: { select: { name: true } } },
  },
  projects: {
    organizationId: { organization: { select: { name: true } } },
    managerId: { manager: { select: USER_SELECT } },
  },
  expense_reports: {
    submitterId: { submitter: { select: USER_SELECT } },
    // approvedById : pas de relation nommée `approvedBy` — post-process.
  },
  purchase_orders: {
    organizationId: { organization: { select: { name: true } } },
    requestedById: { requestedBy: { select: USER_SELECT } },
  },
  monitoring_alerts: {
    // MonitoringAlert n'a AUCUNE relation Prisma déclarée — ni organization
    // ni ticket. Laisser vide : resolveLabels() résoudra les cuid par
    // lookup batch post-query.
  },
  security_alerts: {
    organizationId: { organization: { select: { name: true } } },
  },
  calendar_events: {
    organizationId: { organization: { select: { name: true } } },
    ownerId: { owner: { select: USER_SELECT } },
    siteId: { site: { select: { name: true } } },
  },
};

function getIncludeSpec(dataset: string, groupBy: string): unknown | undefined {
  return DATASET_RELATION_INCLUDES[dataset]?.[groupBy];
}

function resolveRelationLabel(row: any, groupField: string): string {
  if (groupField === "organizationId") return row.organization?.name ?? row.organizationId ?? "—";
  if (groupField === "assigneeId") return row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : "Non assigné";
  if (groupField === "creatorId") return row.creator ? `${row.creator.firstName} ${row.creator.lastName}` : "—";
  if (groupField === "requesterId") return row.requester ? `${row.requester.firstName} ${row.requester.lastName}` : "—";
  if (groupField === "categoryId") return row.category?.name ?? "Sans catégorie";
  if (groupField === "queueId") return row.queue?.name ?? "Sans file";
  if (groupField === "projectId") return row.project?.name ?? "Sans projet";
  if (groupField === "agentId") return row.agentName ?? row.agentId ?? "—";
  if (groupField === "submitterId") return row.submitter ? `${row.submitter.firstName} ${row.submitter.lastName}` : "—";
  if (groupField === "requestedById") return row.requestedBy ? `${row.requestedBy.firstName} ${row.requestedBy.lastName}` : "—";
  if (groupField === "managerId") return row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : "—";
  if (groupField === "siteId") return row.site?.name ?? "Sans site";
  if (groupField === "ownerId") return row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : "—";
  if (groupField === "ticketId") return row.ticketId ?? "—";
  return String(row[groupField] ?? "—");
}

/**
 * Résout le nom de la catégorie racine pour une ligne ticket. Utilise
 * la chaîne parent/child chargée en cache une fois par requête.
 */
function resolveCategoryBaseLabel(row: any, categoryTree: Map<string, { id: string; name: string; parentId: string | null }>): string {
  const cat = row.category as { id?: string; parentId?: string | null; name?: string } | null;
  if (!cat?.id) return "Sans catégorie";
  // Walk up jusqu'au root via la map préchargée.
  let current = categoryTree.get(cat.id);
  if (!current) return cat.name ?? "Sans catégorie";
  const seen = new Set<string>([current.id]);
  while (current.parentId) {
    const parent = categoryTree.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.name;
}

// ============================================================================
// Date bucketing helper — _by_day, _by_week, _by_month, _by_quarter, _by_year
// ============================================================================

const DATE_BUCKET_SUFFIXES = ["_by_day", "_by_week", "_by_month", "_by_quarter", "_by_year"] as const;
type DateBucket = typeof DATE_BUCKET_SUFFIXES[number];

function isDateBucketGroup(field: string): { baseField: string; bucket: DateBucket } | null {
  for (const suffix of DATE_BUCKET_SUFFIXES) {
    if (field.endsWith(suffix)) {
      return { baseField: field.slice(0, -suffix.length), bucket: suffix };
    }
  }
  return null;
}

function dateToBucketLabel(d: Date, bucket: DateBucket): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  switch (bucket) {
    case "_by_day": return `${yyyy}-${mm}-${dd}`;
    case "_by_week": {
      const jan1 = new Date(yyyy, 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
      return `${yyyy}-S${String(week).padStart(2, "0")}`;
    }
    case "_by_month": return `${yyyy}-${mm}`;
    case "_by_quarter": return `${yyyy}-T${Math.ceil((d.getMonth() + 1) / 3)}`;
    case "_by_year": return `${yyyy}`;
  }
}

// ============================================================================
// Sorting helpers — modes "value" / "label" / "chronological" / "none"
// ============================================================================

/**
 * Convertit un label de date bucket en timestamp ms UTC pour tri
 * chronologique. Reconnaît les formats produits par `dateToBucketLabel` :
 *   - "2026"            → 1er janvier 2026
 *   - "2026-04"         → 1er avril 2026
 *   - "2026-04-22"      → jour exact
 *   - "2026-S14"        → lundi de la semaine 14 (approx 7j × N)
 *   - "2026-T2"         → début du trimestre (1er avril)
 * Retourne null si le format n'est pas reconnu.
 */
function parseBucketLabelToTs(label: string): number | null {
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  const dayMatch = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dayMatch) return Date.UTC(+dayMatch[1], +dayMatch[2] - 1, +dayMatch[3]);
  const monthMatch = label.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) return Date.UTC(+monthMatch[1], +monthMatch[2] - 1, 1);
  const weekMatch = label.match(/^(\d{4})-S(\d{2})$/);
  if (weekMatch) {
    const year = +weekMatch[1];
    const week = +weekMatch[2];
    return Date.UTC(year, 0, 1) + (week - 1) * 7 * 86_400_000;
  }
  const quarterMatch = label.match(/^(\d{4})-T(\d)$/);
  if (quarterMatch) return Date.UTC(+quarterMatch[1], (+quarterMatch[2] - 1) * 3, 1);
  return null;
}

function sortResults(
  results: Array<{ label: string; value: number }>,
  sortBy: string,
  sortDir: string,
): void {
  if (sortBy === "none") return;
  if (sortBy === "label") {
    results.sort((a, b) => sortDir === "asc"
      ? a.label.localeCompare(b.label)
      : b.label.localeCompare(a.label));
    return;
  }
  if (sortBy === "chronological") {
    results.sort((a, b) => {
      const ta = parseBucketLabelToTs(a.label);
      const tb = parseBucketLabelToTs(b.label);
      if (ta == null || tb == null) return a.label.localeCompare(b.label);
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return;
  }
  // default = "value"
  results.sort((a, b) => sortDir === "asc" ? a.value - b.value : b.value - a.value);
}

// ============================================================================
// Aggregation helpers
// ============================================================================

function computeAggregate(
  aggregate: string,
  values: number[],
  count: number,
  total: number,
): number {
  if (aggregate === "count") return count;
  if (aggregate === "count_distinct") return new Set(values).size;
  if (aggregate === "sum") return Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;
  if (aggregate === "avg") return values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100 : 0;
  if (aggregate === "min") return values.length ? Math.min(...values) : 0;
  if (aggregate === "max") return values.length ? Math.max(...values) : 0;
  if (aggregate === "median") {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
      : sorted[mid];
  }
  if (aggregate === "percentage") {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }
  return count;
}

// ============================================================================
// GET — expose metadata for the widget editor
// ============================================================================

const ALL_AGGREGATES = [
  { id: "count", label: "Nombre" },
  { id: "count_distinct", label: "Nombre distinct" },
  { id: "sum", label: "Somme" },
  { id: "avg", label: "Moyenne" },
  { id: "min", label: "Minimum" },
  { id: "max", label: "Maximum" },
  { id: "median", label: "Médiane" },
  { id: "percentage", label: "Pourcentage (%)" },
];

const ALL_OPERATORS = [
  { id: "eq", label: "Égal à" },
  { id: "neq", label: "Différent de" },
  { id: "gt", label: "Plus grand que" },
  { id: "lt", label: "Plus petit que" },
  { id: "gte", label: "≥" },
  { id: "lte", label: "≤" },
  { id: "in", label: "Dans la liste" },
  { id: "contains", label: "Contient" },
  { id: "isnull", label: "Est vide" },
  { id: "between", label: "Entre" },
];

const CHART_TYPES = [
  { id: "number", label: "Chiffre (KPI)" },
  { id: "progress", label: "Jauge (%)" },
  { id: "bar", label: "Barres verticales" },
  { id: "horizontal_bar", label: "Barres horizontales" },
  { id: "stacked_bar", label: "Barres empilées" },
  { id: "line", label: "Courbe" },
  { id: "area", label: "Aire" },
  { id: "combo", label: "Combiné (barres + courbe)" },
  { id: "pie", label: "Camembert" },
  { id: "donut", label: "Anneau (donut)" },
  { id: "scatter", label: "Nuage de points" },
  { id: "radar", label: "Radar" },
  { id: "funnel", label: "Entonnoir" },
  { id: "treemap", label: "Treemap" },
  { id: "heatmap", label: "Carte de chaleur" },
  { id: "gauge", label: "Jauge à aiguille" },
  { id: "sankey", label: "Sankey (flux)" },
  { id: "table", label: "Tableau" },
  { id: "list", label: "Liste" },
];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canSeeFinance = hasCapability(me, "finances");

  return NextResponse.json({
    datasets: Object.entries(DATASETS)
      .filter(([id]) => canSeeFinance || !FINANCE_GATED_DATASETS.has(id))
      .map(([id, d]) => ({
        id,
        label: {
          tickets: "Tickets",
          time_entries: "Saisies de temps",
          contacts: "Contacts",
          organizations: "Organisations",
          contracts: "Contrats",
          assets: "Actifs",
          projects: "Projets",
          expense_reports: "Comptes de dépenses",
          purchase_orders: "Bons de commande",
          monitoring_alerts: "Alertes monitoring",
          security_alerts: "Alertes sécurité",
          calendar_events: "Événements calendrier",
          qbo_invoices: "QuickBooks — Factures",
          qbo_customers: "QuickBooks — Clients",
          qbo_payments: "QuickBooks — Paiements",
          qbo_expenses: "QuickBooks — Dépenses",
        }[id] ?? id,
        fields: canSeeFinance ? d.fields : d.fields.filter((f) => !FINANCE_GATED_FIELDS.has(f.name)),
        dateFields: d.dateFields,
        defaultDateField: d.defaultDateField,
      })),
    aggregates: ALL_AGGREGATES,
    operators: ALL_OPERATORS,
    chartTypes: CHART_TYPES,
    dateBuckets: [
      { id: "_by_day", label: "Par jour" },
      { id: "_by_week", label: "Par semaine" },
      { id: "_by_month", label: "Par mois" },
      { id: "_by_quarter", label: "Par trimestre" },
      { id: "_by_year", label: "Par année" },
    ],
  });
}

// ============================================================================
// POST — execute query
// ============================================================================

interface SingleQueryInput {
  dataset: string;
  filters: any[];
  groupBy?: string;
  aggregate: string;
  aggregateField?: string;
  sortBy: string;
  sortDir: string;
  limit: number;
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface SingleQueryResult {
  results: Array<{ label: string; value: number }>;
  total: number;
  groupedBy?: string;
  aggregate: string;
  error?: string;
  status?: number;
}

/**
 * Exécute une requête unitaire (pas de dual-source) sur un dataset. Le
 * code du POST l'invoque 1x (normal) ou 2x (primary + secondary) avec
 * un merge avant retour. Return exactement la forme du résultat, ou un
 * error+status si ça foire.
 */
export async function executeSingleQuery(input: SingleQueryInput): Promise<SingleQueryResult> {
  const { dataset, filters, groupBy, aggregate, aggregateField, sortBy, sortDir, limit, dateField, dateFrom, dateTo } = input;
  const def = DATASETS[dataset];
  if (!def) return { results: [], total: 0, aggregate, error: `Dataset "${dataset}" inconnu`, status: 400 };

  // QBO routing
  if (QBO_DATASETS.has(dataset)) {
    const r = await runQboQuery({
      dataset, filters, groupBy, aggregate, aggregateField,
      sortBy, sortDir, limit,
      dateField: dateField || def.defaultDateField || undefined,
      dateFrom, dateTo,
    });
    return { results: r.results, total: r.total, groupedBy: r.groupedBy, aggregate: r.aggregate };
  }

  // --- Prisma path ---
  const where: Record<string, unknown> = {};
  const df = dateField || def.defaultDateField;
  if (df && (dateFrom || dateTo)) {
    where[df] = {};
    if (dateFrom) (where[df] as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where[df] as Record<string, unknown>).lte = new Date(dateTo);
  }
  // Map champ → type pour coercer les valeurs correctement (date, number, bool).
  const fieldTypes = new Map<string, string>();
  for (const fd of def.fields) fieldTypes.set(fd.name, fd.type);

  /**
   * Coerce une valeur brute (souvent string venant du client) vers le type
   * attendu par Prisma pour ce champ. Retourne `undefined` si la coercion
   * échoue (valeur vide, string invalide sur un champ number/bool/date) :
   * le caller doit alors SKIPPER le filtre plutôt que crasher Prisma.
   */
  function coerce(field: string, raw: unknown): unknown {
    const t = fieldTypes.get(field);
    if (raw == null) return undefined;
    // String vide = filtre non renseigné → skip (évite les erreurs Prisma
    // quand la valeur n'a pas été saisie).
    if (typeof raw === "string" && raw.trim() === "") return undefined;
    if (t === "date") {
      if (raw instanceof Date) return raw;
      const d = new Date(raw as string | number);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    if (t === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isNaN(n) ? undefined : n;
    }
    if (t === "boolean") {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
      return undefined; // Non-parseable → skip
    }
    return raw;
  }

  for (const f of filters) {
    if (!f.field || (f.value === undefined && f.operator !== "isnull")) continue;
    // String vide sur opérateur non-isnull → skip (évite d'envoyer "" à Prisma).
    if (f.operator !== "isnull" && typeof f.value === "string" && f.value.trim() === "") continue;

    switch (f.operator) {
      case "eq": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = v;
        break;
      }
      case "neq": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = { not: v };
        break;
      }
      case "gt": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = { gt: v };
        break;
      }
      case "lt": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = { lt: v };
        break;
      }
      case "gte": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = { gte: v };
        break;
      }
      case "lte": {
        const v = coerce(f.field, f.value);
        if (v !== undefined) where[f.field] = { lte: v };
        break;
      }
      case "in": {
        const rawList: unknown[] = Array.isArray(f.value)
          ? f.value
          : String(f.value).split(",").map((s: string) => s.trim()).filter(Boolean);
        const coerced = rawList.map((v: unknown) => coerce(f.field, v)).filter((v) => v !== undefined);
        if (coerced.length > 0) where[f.field] = { in: coerced };
        break;
      }
      case "contains": {
        if (typeof f.value !== "string" || !f.value.trim()) break;
        where[f.field] = { contains: f.value, mode: "insensitive" };
        break;
      }
      case "isnull": where[f.field] = f.value === false ? { not: null } : null; break;
      case "between": {
        const [lo, hi] = Array.isArray(f.value) ? f.value : String(f.value).split(",");
        const lov = coerce(f.field, lo);
        const hiv = coerce(f.field, hi);
        if (lov !== undefined || hiv !== undefined) {
          const range: Record<string, unknown> = {};
          if (lov !== undefined) range.gte = lov;
          if (hiv !== undefined) range.lte = hiv;
          where[f.field] = range;
        }
        break;
      }
    }
  }

  const model = (prisma as any)[def.model];
  if (!model) return { results: [], total: 0, aggregate, error: "Modèle introuvable", status: 500 };

  // Diviseur d'affichage (ex. durationMinutes → heures via ÷60).
  // Appliqué seulement aux agrégations numériques (sum/avg/min/max/median) ;
  // les counts restent en nombre de lignes.
  const outputDivide = aggregateField
    ? def.fields.find((f) => f.name === aggregateField)?.outputDivide
    : undefined;
  const applyDivide = (v: number): number => {
    if (!outputDivide || outputDivide <= 0) return v;
    if (!["sum", "avg", "min", "max", "median"].includes(aggregate)) return v;
    return Math.round((v / outputDivide) * 100) / 100;
  };

  const dateBucket = groupBy ? isDateBucketGroup(groupBy) : null;

  if (dateBucket) {
    const rows = await model.findMany({ where, select: { [dateBucket.baseField]: true, ...(aggregateField ? { [aggregateField]: true } : {}) }, take: 5000 });
    const totalRows = rows.length;
    const groups = new Map<string, { count: number; values: number[] }>();
    for (const row of rows) {
      const d = row[dateBucket.baseField];
      if (!d) continue;
      const label = dateToBucketLabel(new Date(d), dateBucket.bucket);
      const g = groups.get(label) ?? { count: 0, values: [] };
      g.count += 1;
      if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
      groups.set(label, g);
    }
    let results = Array.from(groups.entries()).map(([label, g]) => ({
      label, value: applyDivide(computeAggregate(aggregate, g.values, g.count, totalRows)),
    }));
    sortResults(results, sortBy, sortDir);
    results = results.slice(0, limit);
    results = await resolveLabels(results, groupBy);
    return { results, total: totalRows, groupedBy: groupBy, aggregate };
  }

  if (groupBy) {
    const fieldDef = def.fields.find((f) => f.name === groupBy);

    // Virtual field : type de travail (dérivé des saisies de temps liées
    // au ticket). Un ticket avec entrées de plusieurs types apparaît dans
    // chaque bucket ; un ticket sans saisie tombe dans « — Sans saisie —».
    if (fieldDef?.virtual && groupBy === "timeType" && dataset === "tickets") {
      const rows = await model.findMany({ where, take: 5000 });
      const totalRows = rows.length;
      const ticketIds = rows.map((r: { id: string }) => r.id);
      const entries = ticketIds.length > 0
        ? await prisma.timeEntry.findMany({
            where: { ticketId: { in: ticketIds } },
            select: { ticketId: true, timeType: true },
          })
        : [];
      const typesByTicket = new Map<string, Set<string>>();
      for (const e of entries) {
        const set = typesByTicket.get(e.ticketId) ?? new Set<string>();
        set.add(e.timeType);
        typesByTicket.set(e.ticketId, set);
      }
      const groups = new Map<string, { label: string; count: number; values: number[] }>();
      for (const row of rows as Array<Record<string, unknown>>) {
        const types = typesByTicket.get(String(row.id)) ?? new Set<string>();
        if (types.size === 0) {
          const key = "— Sans saisie —";
          const g = groups.get(key) ?? { label: key, count: 0, values: [] };
          g.count += 1;
          if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
          groups.set(key, g);
          continue;
        }
        for (const t of types) {
          const g = groups.get(t) ?? { label: t, count: 0, values: [] };
          g.count += 1;
          if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
          groups.set(t, g);
        }
      }
      let results = Array.from(groups.values()).map((g) => ({
        label: g.label, value: applyDivide(computeAggregate(aggregate, g.values, g.count, totalRows)),
      }));
      sortResults(results, sortBy, sortDir);
      results = results.slice(0, limit);
      return { results, total: totalRows, groupedBy: groupBy, aggregate };
    }

    // Virtual field : catégorie de base (racine de l'arbre Category).
    if (fieldDef?.virtual && groupBy === "categoryBaseId" && dataset === "tickets") {
      const includeSpec = getIncludeSpec(dataset, groupBy);
      const rows = await model.findMany({ where, ...(includeSpec ? { include: includeSpec } : {}), take: 5000 });
      const totalRows = rows.length;

      // Précharge l'arbre complet des catégories pour la remontée au root.
      // Sur-cible quand c'est possible en limitant par organizations des
      // tickets retournés, sinon on charge tout (borne raisonnable).
      const orgIdsSet = new Set<string>();
      for (const r of rows) if (r.organizationId) orgIdsSet.add(r.organizationId);
      const allCats = await prisma.category.findMany({
        where: orgIdsSet.size > 0 ? { OR: [{ organizationId: null }, { organizationId: { in: Array.from(orgIdsSet) } }] } : {},
        select: { id: true, name: true, parentId: true },
      });
      const catTree = new Map<string, { id: string; name: string; parentId: string | null }>();
      for (const c of allCats) catTree.set(c.id, c);

      const groups = new Map<string, { label: string; count: number; values: number[] }>();
      for (const row of rows) {
        const label = resolveCategoryBaseLabel(row, catTree);
        const g = groups.get(label) ?? { label, count: 0, values: [] };
        g.count += 1;
        if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
        groups.set(label, g);
      }
      let results = Array.from(groups.values()).map((g) => ({
        label: g.label, value: applyDivide(computeAggregate(aggregate, g.values, g.count, totalRows)),
      }));
      sortResults(results, sortBy, sortDir);
      results = results.slice(0, limit);
      return { results, total: totalRows, groupedBy: groupBy, aggregate };
    }

    if (fieldDef?.type === "relation") {
      // Include Prisma UNIQUEMENT si le dataset a déclaré cette relation.
      // Sinon on fait un findMany simple et resolveLabels() remappera les
      // cuid en noms humains via lookups batch post-query.
      const includeSpec = getIncludeSpec(dataset, groupBy);
      const rows = await model.findMany({ where, ...(includeSpec ? { include: includeSpec } : {}), take: 5000 });
      const totalRows = rows.length;
      const groups = new Map<string, { label: string; count: number; values: number[] }>();
      for (const row of rows) {
        const label = resolveRelationLabel(row, groupBy);
        const g = groups.get(label) ?? { label, count: 0, values: [] };
        g.count += 1;
        if (aggregateField && row[aggregateField] != null) g.values.push(Number(row[aggregateField]));
        groups.set(label, g);
      }
      let results = Array.from(groups.values()).map((g) => ({
        label: g.label, value: applyDivide(computeAggregate(aggregate, g.values, g.count, totalRows)),
      }));
      sortResults(results, sortBy, sortDir);
      results = results.slice(0, limit);
      results = await resolveLabels(results, groupBy);
      return { results, total: totalRows, groupedBy: groupBy, aggregate };
    }

    // Prisma 7 : groupBy + take exige un orderBy explicite dont le champ
    // fait partie de `by:`. Sans ça → "Every field used for orderBy must
    // be included in the by-arguments". On trie par le champ groupé.
    //
    // Par ailleurs : _sum/_avg/_min/_max n'acceptent que des champs
    // NUMÉRIQUES. Si le dataset déclare `aggregable: true` sur un champ
    // String (ex. `id`), Prisma rejette. On se protège en vérifiant que
    // le champ est bien `type === "number"` avant de l'inclure.
    const aggFieldDef = aggregateField
      ? def.fields.find((f) => f.name === aggregateField)
      : undefined;
    const aggFieldIsNumeric = aggFieldDef?.type === "number";
    const groupResult = await model.groupBy({
      by: [groupBy], where, _count: true,
      ...(aggregateField && aggFieldIsNumeric ? {
        _sum: { [aggregateField]: true }, _avg: { [aggregateField]: true },
        _min: { [aggregateField]: true }, _max: { [aggregateField]: true },
      } : {}),
      orderBy: { [groupBy]: "asc" },
      take: Math.min(limit, 500),
    });
    const totalCount = aggregate === "percentage"
      ? await model.count({ where })
      : groupResult.reduce((s: number, r: any) => s + (typeof r._count === "number" ? r._count : r._count?._all ?? 0), 0);
    let results = groupResult.map((r: any) => {
      const rawLabel = r[groupBy];
      const cnt = typeof r._count === "number" ? r._count : r._count?._all ?? 0;
      let value: number;
      if (aggregate === "percentage") value = totalCount > 0 ? Math.round((cnt / totalCount) * 1000) / 10 : 0;
      else if (aggregate === "count") value = cnt;
      else {
        value = aggregate === "sum" ? (r._sum?.[aggregateField!] ?? 0)
          : aggregate === "avg" ? Math.round((r._avg?.[aggregateField!] ?? 0) * 100) / 100
          : aggregate === "min" ? (r._min?.[aggregateField!] ?? 0)
          : aggregate === "max" ? (r._max?.[aggregateField!] ?? 0)
          : cnt;
      }
      return {
        label: rawLabel === true ? "Oui" : rawLabel === false ? "Non" : rawLabel instanceof Date ? rawLabel.toISOString().slice(0, 10) : String(rawLabel ?? "—"),
        value: applyDivide(value),
      };
    });
    sortResults(results, sortBy, sortDir);
    results = await resolveLabels(results, groupBy);
    return { results, total: totalCount, groupedBy: groupBy, aggregate };
  }

  // No groupBy
  if (aggregate === "count") {
    const count = await model.count({ where });
    return { results: [{ label: "Total", value: count }], total: count, aggregate: "count" };
  }
  if (aggregateField) {
    // _sum/_avg/_min/_max : champs numériques uniquement. Si l'user a
    // sélectionné un champ string (ex. id) pour une agrégation sum, on
    // retombe sur count — plus sûr que de planter.
    const aggFieldDef = def.fields.find((f) => f.name === aggregateField);
    if (aggFieldDef?.type !== "number") {
      const count = await model.count({ where });
      return { results: [{ label: "Total", value: count }], total: count, aggregate: "count" };
    }
    const agg = await model.aggregate({
      where,
      _sum: { [aggregateField]: true }, _avg: { [aggregateField]: true },
      _min: { [aggregateField]: true }, _max: { [aggregateField]: true },
      _count: true,
    });
    const val = aggregate === "sum" ? agg._sum?.[aggregateField]
      : aggregate === "avg" ? Math.round((agg._avg?.[aggregateField] ?? 0) * 100) / 100
      : aggregate === "min" ? agg._min?.[aggregateField]
      : aggregate === "max" ? agg._max?.[aggregateField]
      : agg._count;
    return { results: [{ label: "Total", value: applyDivide(val ?? 0) }], total: agg._count, aggregate };
  }
  const count = await model.count({ where });
  return { results: [{ label: "Total", value: count }], total: count, aggregate: "count" };
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      dataset,
      filters = [],
      groupBy,
      aggregate = "count",
      aggregateField,
      sortBy = "value",
      sortDir = "desc",
      limit = 50,
      dateField,
      // `overrideDateFrom` / `overrideDateTo` — si fournis par le
      // dashboard qui rend le widget, prennent précédence sur les dates
      // stockées dans le widget (permet un sélecteur de période global
      // qui cascade sur tous les widgets du dashboard).
      overrideDateFrom,
      overrideDateTo,
      // Dual-source (optionnel) — exécute une 2e requête sur un autre
      // dataset et fusionne les résultats. Chaque ligne porte son
      // libellé de source dans `source` pour distinguer (utile surtout
      // pour Sankey cashflow Revenus + Dépenses).
      secondaryDataset,
      secondaryGroupBy,
      secondaryAggregate = "count",
      secondaryAggregateField,
      secondaryFilters = [],
      secondaryDateField,
      primarySourceLabel,
      secondarySourceLabel,
    } = body;
    const dateFrom = overrideDateFrom ?? body.dateFrom;
    const dateTo = overrideDateTo ?? body.dateTo;

    // Finance gate (couvre aussi la source secondaire si présente).
    function touchesFinanceFor(ds: string, grp: string | undefined, aggF: string | undefined, flt: any[]) {
      return FINANCE_GATED_DATASETS.has(ds)
        || (aggF && FINANCE_GATED_FIELDS.has(aggF))
        || (grp && FINANCE_GATED_FIELDS.has(grp))
        || (Array.isArray(flt) && flt.some((f: any) => f?.field && FINANCE_GATED_FIELDS.has(f.field)));
    }
    const touchesFinance = touchesFinanceFor(dataset, groupBy, aggregateField, filters)
      || (secondaryDataset && touchesFinanceFor(secondaryDataset, secondaryGroupBy, secondaryAggregateField, secondaryFilters));
    if (touchesFinance && !hasCapability(me, "finances")) {
      return NextResponse.json(
        { error: "Accès aux données financières réservé aux utilisateurs avec la capacité 'finances'" },
        { status: 403 },
      );
    }

    const primaryResult = await executeSingleQuery({
      dataset, filters, groupBy, aggregate, aggregateField,
      sortBy, sortDir, limit, dateField, dateFrom, dateTo,
    });
    if (primaryResult.error) {
      return NextResponse.json({ error: primaryResult.error }, { status: primaryResult.status ?? 500 });
    }

    if (!secondaryDataset) {
      return NextResponse.json({
        results: primaryResult.results,
        total: primaryResult.total,
        groupedBy: primaryResult.groupedBy,
        aggregate: primaryResult.aggregate,
      });
    }

    // Dual-source — 2e query, chaque ligne gagne un champ `source`.
    const secondaryResult = await executeSingleQuery({
      dataset: secondaryDataset,
      filters: secondaryFilters,
      groupBy: secondaryGroupBy,
      aggregate: secondaryAggregate,
      aggregateField: secondaryAggregateField,
      sortBy, sortDir, limit,
      dateField: secondaryDateField,
      dateFrom, dateTo,
    });
    if (secondaryResult.error) {
      return NextResponse.json({ error: `Secondaire: ${secondaryResult.error}` }, { status: secondaryResult.status ?? 500 });
    }

    const primaryLabel = primarySourceLabel || datasetLabel(dataset);
    const secondaryLabel = secondarySourceLabel || datasetLabel(secondaryDataset);

    return NextResponse.json({
      results: [
        ...primaryResult.results.map((r) => ({ ...r, source: primaryLabel })),
        ...secondaryResult.results.map((r) => ({ ...r, source: secondaryLabel })),
      ],
      total: primaryResult.total + secondaryResult.total,
      groupedBy: primaryResult.groupedBy,
      aggregate: primaryResult.aggregate,
      dualSource: true,
      primarySource: primaryLabel,
      secondarySource: secondaryLabel,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de requête" },
      { status: 500 },
    );
  }
}

function datasetLabel(id: string): string {
  const m: Record<string, string> = {
    tickets: "Tickets",
    time_entries: "Saisies de temps",
    contacts: "Contacts",
    organizations: "Organisations",
    contracts: "Contrats",
    assets: "Actifs",
    projects: "Projets",
    expense_reports: "Dépenses internes",
    purchase_orders: "Bons de commande",
    monitoring_alerts: "Alertes monitoring",
    security_alerts: "Alertes sécurité",
    calendar_events: "Événements",
    qbo_invoices: "Revenus QBO",
    qbo_customers: "Clients QBO",
    qbo_payments: "Paiements QBO",
    qbo_expenses: "Dépenses QBO",
  };
  return m[id] ?? id;
}

