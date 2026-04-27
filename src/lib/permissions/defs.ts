// ============================================================================
// PERMISSIONS — source de vérité.
//
// Le moteur runtime (hasCapability, hasPermission) stocke les grants dans
// la table RolePermission. Ce fichier définit :
//   1. Le catalogue de permissions exposées dans l'UI Rôles & Permissions
//      (groupes + libellés + descriptions).
//   2. Les valeurs par défaut par rôle système (utilisées lors du seed
//      initial, quand la table est vide pour une clé de rôle).
//
// Ajouter une nouvelle permission :
//   - Ajouter une entrée à PERMISSION_GROUPS.
//   - Si c'est une capacité métier vérifiée par hasCapability(), rien
//     de plus : la permission circule toute seule.
//   - Si c'est une permission "technique" vérifiée ailleurs (ex.
//     tickets.delete), brancher le check avec hasPermission() dans la
//     route concernée.
// ============================================================================

export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  category: string;
  permissions: PermissionDef[];
}

/**
 * Les 3 "tags" historiques (finances, billing, purchasing) sont regroupés
 * ici comme permissions normales. hasCapability(user, "finances") les
 * trouvera via RolePermission OU via user.capabilities (override perso).
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    category: "Accès spéciaux",
    permissions: [
      { key: "finances",   label: "Finances",    description: "Voir la section Finances + revenus / coûts / rapports financiers" },
      { key: "billing",    label: "Facturation", description: "Gérer les verrouillages de période de facturation" },
      { key: "purchasing", label: "Achats",      description: "Notifié des demandes d'achat + badge sur Bons de commande" },
    ],
  },
  {
    category: "Tickets",
    permissions: [
      { key: "tickets.view",         label: "Voir les tickets",         description: "Consulter la liste des tickets" },
      { key: "tickets.view_all",     label: "Voir tous les tickets",    description: "Voir les tickets de toutes les organisations" },
      { key: "tickets.create",       label: "Créer un ticket",          description: "Créer de nouveaux tickets" },
      { key: "tickets.update",       label: "Modifier un ticket",       description: "Modifier les détails d'un ticket" },
      { key: "tickets.delete",       label: "Supprimer un ticket",      description: "Supprimer des tickets" },
      { key: "tickets.assign",       label: "Assigner un ticket",       description: "Affecter des tickets à des techniciens" },
      { key: "tickets.merge",        label: "Fusionner des tickets",    description: "Fusionner plusieurs tickets" },
      { key: "tickets.bulk_actions", label: "Actions en lot",           description: "Modifier plusieurs tickets simultanément" },
    ],
  },
  {
    category: "Organisations",
    permissions: [
      { key: "orgs.view",   label: "Voir les organisations",     description: "Consulter la liste des organisations" },
      { key: "orgs.create", label: "Créer une organisation",     description: "Ajouter de nouvelles organisations" },
      { key: "orgs.update", label: "Modifier une organisation",  description: "Modifier les détails d'une organisation" },
      { key: "orgs.delete", label: "Supprimer une organisation", description: "Supprimer des organisations" },
    ],
  },
  {
    category: "Utilisateurs",
    permissions: [
      { key: "users.view",         label: "Voir les utilisateurs",     description: "Consulter la liste des utilisateurs" },
      { key: "users.create",       label: "Créer un utilisateur",      description: "Inviter de nouveaux utilisateurs" },
      { key: "users.update",       label: "Modifier un utilisateur",   description: "Modifier les profils utilisateurs" },
      { key: "users.delete",       label: "Supprimer un utilisateur",  description: "Supprimer des utilisateurs" },
      { key: "users.assign_roles", label: "Assigner des rôles",        description: "Modifier les rôles des utilisateurs" },
    ],
  },
  {
    category: "Configuration",
    permissions: [
      { key: "settings.general",      label: "Paramètres généraux",    description: "Modifier les paramètres globaux" },
      { key: "settings.sla",          label: "Gérer les SLA",          description: "Créer et modifier les politiques SLA" },
      { key: "settings.categories",   label: "Gérer les catégories",   description: "Créer et modifier les catégories" },
      { key: "settings.queues",       label: "Gérer les files d'attente", description: "Créer et modifier les files" },
      { key: "settings.automations",  label: "Gérer les automatisations", description: "Créer des règles d'automatisation" },
      { key: "settings.integrations", label: "Gérer les intégrations", description: "Configurer les intégrations externes" },
    ],
  },
  {
    category: "Rapports",
    permissions: [
      { key: "reports.view",   label: "Voir les rapports",      description: "Consulter les rapports et tableaux de bord" },
      { key: "reports.export", label: "Exporter des rapports",  description: "Télécharger des rapports en PDF/CSV" },
      { key: "reports.create", label: "Créer des rapports",     description: "Créer des rapports personnalisés" },
    ],
  },
  {
    category: "Intelligence IA",
    permissions: [
      { key: "ai.view",       label: "Voir les analyses IA",  description: "Consulter les insights, prédictions et rapports IA d'une organisation (onglet Intelligence IA)" },
      { key: "ai.manage",     label: "Configurer l'IA",       description: "Activer/désactiver les capacités IA, ajuster les seuils, gérer les modèles" },
      { key: "ai.run_jobs",   label: "Déclencher des jobs IA", description: "Lancer manuellement des analyses, prédictions, classifications" },
      { key: "ai.view_costs", label: "Voir les coûts IA",     description: "Consulter les compteurs de tokens et coûts USD par appel" },
    ],
  },
];

/**
 * Liste plate de toutes les clés de permission connues (validation des
 * PUT de la matrice — on refuse un grant sur une permission inconnue).
 */
export const ALL_PERMISSION_KEYS: Set<string> = new Set(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
);

/**
 * Rôles système (même ordre que UserRole enum Prisma). Affichés dans la
 * liste à côté des custom roles, non supprimables.
 */
export interface SystemRoleDef {
  key: string;           // valeur UserRole en string
  label: string;
  description: string;
  color: string;
}

export const SYSTEM_ROLES: SystemRoleDef[] = [
  { key: "SUPER_ADMIN",  label: "Super Admin",          description: "Accès total à toutes les fonctionnalités et organisations", color: "#DC2626" },
  { key: "MSP_ADMIN",    label: "Admin MSP",            description: "Administration de la plateforme MSP",                       color: "#7C3AED" },
  { key: "SUPERVISOR",   label: "Superviseur",          description: "Supervise une équipe de techniciens",                       color: "#2563EB" },
  { key: "TECHNICIAN",   label: "Technicien",           description: "Traite les tickets des clients",                            color: "#10B981" },
  { key: "CLIENT_ADMIN", label: "Admin Client",         description: "Administre les utilisateurs d'une organisation cliente",    color: "#F59E0B" },
  { key: "CLIENT_USER",  label: "Utilisateur Client",   description: "Soumet et suit ses propres tickets",                        color: "#06B6D4" },
  { key: "READ_ONLY",    label: "Lecture seule",        description: "Consulte sans modifier",                                    color: "#64748B" },
];

/**
 * Défauts seedés au premier GET d'une matrice de rôle système qui n'a
 * encore aucune RolePermission en DB. Préserve le comportement actuel :
 *   - finances / billing / purchasing restent gates (pas accordés par
 *     défaut à aucun rôle — l'admin les accorde explicitement).
 *   - Les autres permissions reflètent l'ancien PERMISSIONS_MATRIX de
 *     roles-section.tsx.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view", "orgs.create", "orgs.update", "orgs.delete",
    "users.view", "users.create", "users.update", "users.delete", "users.assign_roles",
    "settings.general", "settings.sla", "settings.categories", "settings.queues", "settings.automations", "settings.integrations",
    "reports.view", "reports.export", "reports.create",
    "ai.view", "ai.manage", "ai.run_jobs", "ai.view_costs",
  ],
  MSP_ADMIN: [
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.delete", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view", "orgs.create", "orgs.update",
    "users.view", "users.create", "users.update", "users.assign_roles",
    "settings.general", "settings.sla", "settings.categories", "settings.queues", "settings.automations",
    "reports.view", "reports.export", "reports.create",
    "ai.view", "ai.run_jobs",
  ],
  SUPERVISOR: [
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.assign", "tickets.merge", "tickets.bulk_actions",
    "orgs.view",
    "users.view",
    "reports.view", "reports.export",
    "ai.view",
  ],
  TECHNICIAN: [
    "tickets.view", "tickets.view_all", "tickets.create", "tickets.update", "tickets.assign",
    "orgs.view",
    "users.view",
    "reports.view",
  ],
  CLIENT_ADMIN: [
    "tickets.view", "tickets.create", "tickets.update",
    "users.view", "users.create", "users.update",
    "reports.view",
  ],
  CLIENT_USER: [
    "tickets.view", "tickets.create",
  ],
  READ_ONLY: [
    "tickets.view", "tickets.view_all",
    "orgs.view",
    "users.view",
    "reports.view",
  ],
};

/** Les clés des "accès spéciaux" — utilisées comme alias pour la rétro-compat. */
export const CAPABILITY_KEYS = ["finances", "billing", "purchasing"] as const;
export type CapabilityKey = typeof CAPABILITY_KEYS[number];
