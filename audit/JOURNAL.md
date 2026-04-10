# Journal d'audit Nexus

Audit autonome du dépôt `/opt/nexus` (Next.js 16, React 19, Prisma 7, NextAuth 5).
Date début : 2026-04-07.

## Méthodologie

À chaque passe : cartographie → typecheck → lint → build → inspection ciblée
→ corrections → re-validation → documentation. Boucle récursive.

---

## Pass 1 — Cartographie & état réel

### Stack effective
- Next.js 16.2.2 (App Router, middleware via `src/proxy.ts`)
- React 19.2, TypeScript 5
- Prisma 7.6 sur PostgreSQL (driver `@prisma/adapter-pg`)
- NextAuth 5 beta (sessions JWT cookie `authjs.session-token`)
- TipTap, TanStack Query/Table, Radix UI, Tailwind 4, Zustand
- Aucun framework de tests installé (pas de Jest/Vitest/Playwright)

### Inventaire
- **API v1** : 56 routes sous `src/app/api/v1`
- **Pages app** : tickets, contacts, organisations, projets, assets, KB,
  automations, billing, scheduling, settings, dashboard, reports
- **Portail client** : `src/app/(portal)` (login, tickets, projects, KB, reports)
- **Modèles Prisma** : ~1000 lignes dans `prisma/schema.prisma`
  (Organization, User, UserOrganization, Ticket, Comment, Asset, Contract,
  SLAPolicy, AutomationRule, Article, Project, Queue, Tag, Activity, etc.)
- **Migrations** : 3 (`init`, `lot1_modules_foundation`, `lot2_ticket_status_extra`)
- **Volume DB réel** : 42 organisations, 13 564 tickets

### Validations exécutées
| Outil | Résultat | Log |
|---|---|---|
| `tsc --noEmit` | ✅ 0 erreur | `audit/typecheck-pass1.log` |
| `next build` | ✅ succès, 0 erreur | `audit/build-pass1.log` |
| `eslint .` | ❌ 220 erreurs / 74 warnings | `audit/lint-pass1.log` |
| Connexion Postgres | ✅ OK | — |

### Problèmes critiques détectés en Pass 1

#### 🔴 SÉCURITÉ — API v1 sans auth applicative
- 48 routes sur 56 sous `/api/v1` n'appellent **jamais** `auth()` /
  `requireAuth()` / `requireRole()`. Le seul rempart est `src/proxy.ts` qui
  vérifie uniquement la **présence** d'un cookie `authjs.session-token`,
  sans en valider la signature ni le rôle.
- Conséquences :
  - N'importe quel utilisateur authentifié (y compris `CLIENT_USER` /
    `READ_ONLY`) peut écrire dans tous les modules MSP.
  - Les routes mutantes (POST/PATCH/DELETE) n'ont aucun contrôle de rôle.
  - Aucune protection CSRF côté handlers.
  - Le middleware redirige les appels API non authentifiés vers une page
    HTML de login (`302 → /login`) au lieu de retourner `401 JSON`,
    cassant tout consommateur API/SPA.

#### 🔴 FONCTIONNEL — CRUD utilisateurs inexistant côté serveur
- `/api/v1/users/route.ts` n'expose qu'un `GET`. Pas de POST/PATCH/DELETE.
- `EditUserModal` (`src/components/users/edit-user-modal.tsx`) :
  - Le `handleSubmit` fait uniquement `console.log(...)` puis ferme la modal.
  - Les boutons « Ajouter un utilisateur » et « désactiver » dans
    `(app)/settings/page.tsx` n'ont aucun handler.
- Le module Settings → Utilisateurs est donc **non fonctionnel** en écriture.
- Bonus : `useEffect` initialise l'état depuis `props.user` via `setState`
  (anti-pattern `react-hooks/set-state-in-effect`).

#### 🟠 SÉCURITÉ — `/api/v1/users` GET ouvert
- Pas d'auth, pas de filtre par tenant : expose `email`, `phone`,
  `lastLoginAt`, `role` de tous les utilisateurs MSP à n'importe qui ayant
  un cookie de session valide (y compris portail client).

#### 🟠 QUALITÉ — Lint
- 220 erreurs `@typescript-eslint/no-explicit-any` réparties surtout dans
  `src/lib/freshservice/*`, `src/lib/auth.ts`, services métier
  (tickets, kanban, kb, sla, automations, scheduling).
- 1 vraie erreur React (`set-state-in-effect`) dans `edit-user-modal.tsx`.
- 74 warnings : variables / imports inutilisés.

#### 🟡 TODOs explicites dans le code
- `src/lib/orgs/service.ts:50` — `billingMode` codé en dur `"msp_monthly"`,
  doit être dérivé du contrat actif.
- `src/app/(app)/organizations/[id]/page.tsx:916` — sites factices,
  endpoint `/api/v1/sites` absent.

#### 🟡 Configuration
- `.env.example` (5 lignes) ne reflète plus le `.env` réel (16 variables) :
  manquent `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, ATERA_*,
  CLOUDFLARE_*, QUICKBOOKS_*, AUTH_MICROSOFT_ENTRA_ID_*.

#### 🟡 Tests
- Aucun test automatisé. Pas de runner. Pas de fixtures.
  Risque élevé de régression sur futures évolutions.

### Décisions Pass 1 (corrections appliquées dans Pass 2)
1. Durcir `proxy.ts` : retourner `401 JSON` pour `/api/*` non authentifiés.
2. Hardener `/api/v1/users` : auth + rôle + endpoints POST/PATCH/DELETE.
3. Câbler `EditUserModal` à l'API + corriger l'anti-pattern d'effet.
4. Implémenter handler « Ajouter un utilisateur » et « désactiver ».
5. Résoudre les 2 TODO explicites.
6. Mettre `.env.example` à jour.

---

## Pass 2 — Corrections appliquées

### Fichiers modifiés
| Fichier | Changement |
|---|---|
| `src/proxy.ts` | Les requêtes `/api/*` non authentifiées renvoient désormais `401 JSON` au lieu d'un redirect HTML 302. Évite les bugs silencieux côté SPA. |
| `src/app/api/v1/users/route.ts` | Réécrit. Ajout `auth + rôle` sur GET (interdit aux clients), ajout POST (admin only, validation Zod, hash bcrypt), PATCH (self ou admin, garde-fous role/isActive/email), DELETE (soft-delete via `isActive=false`, interdit l'auto-désactivation). Gestion P2002/P2025. |
| `src/components/users/edit-user-modal.tsx` | Refactor : wrapper + remontage par `key` pour éviter `setState` dans `useEffect`. Câblage réel `PATCH /api/v1/users`. États `submitting`/`error`. Roles désormais en valeurs canoniques (`TECHNICIAN`, etc.) au lieu de libellés français — la liste précédente était incompatible avec ce que retourne l'API. |
| `src/app/(app)/settings/page.tsx` | « Ajouter un utilisateur » et « désactiver » câblés aux nouveaux endpoints. Reload via `reloadKey`. Suppression du `setLoading(true)` dans l'effet pour respecter la règle React. |
| `src/lib/orgs/service.ts` | TODO résolu : `billingMode` dérivé du `Contract` actif le plus récent (`MANAGED_SERVICES → msp_monthly`, `RETAINER → retainer`, etc., défaut `none`). |
| `.env.example` | Mis à jour avec les 16 variables réellement utilisées. |

### Validations Pass 2
| Outil | Résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| `next build` | ✅ succès |
| `eslint` (fichiers touchés) | ✅ 0 nouvelle erreur introduite. Reste 3 `no-explicit-any` pré-existantes (orgs/service.ts:166, 200 ; settings/page.tsx:618). |
| Vérifs DB | OK : 1 SUPER_ADMIN, 1 MSP_ADMIN, 8 TECHNICIAN ; **0 contrat actif** dans la base — donc tous les orgs reportent désormais `billingMode="none"` (auparavant `"msp_monthly"` universellement faux). |

### Constat secondaire
La table `contracts` n'a aucune ligne `ACTIVE`, alors qu'il y a 42 orgs et 13 564 tickets. Il faut soit importer/seeder les contrats (le module billing en dépend), soit traiter `none` comme un état de premier ordre dans l'UI. À traiter en Pass 3+.

---

---

## Pass 3 — Sessions interactives (multi-demandes)

### Fichiers modifiés
| Fichier | Changement | Demande utilisateur |
|---|---|---|
| `src/app/(app)/organizations/page.tsx` | `useState(FALLBACK_ORGS)` → `useState([])`. Plus de flash de données démo. | Flash données démo |
| `src/app/(app)/contacts/page.tsx` | Idem. | Flash données démo |
| `src/components/tickets/new-ticket-modal.tsx` | Init `orgList`/`requestersByOrg` à vide. Description : `<textarea>` → `<AdvancedRichEditor>` (texte enrichi + images intégrées via TipTap). | Flash + texte enrichi |
| `src/app/(portal)/portal/tickets/new/page.tsx` | Description portail : idem `<AdvancedRichEditor>`. | Texte enrichi côté client |
| `src/app/(app)/assets/page.tsx` | Page entièrement statique → fetch `/api/v1/assets` réel. Liste d'orgs dérivée des données. | Données démo dans Actifs |
| `src/app/api/v1/assets/route.ts` | GET enrichi avec relations `organization` + `site` et mapping enum→UI (workstation, laptop…). | idem |
| `src/components/billing/add-time-modal.tsx` | Aperçu : suppression de `taux $/h` et `montant $`. Ne reste que durée + statut de couverture + raison. | Confidentialité tarifs |
| `src/components/billing/ticket-billing-section.tsx` | Supprimé : StatCard « Total à facturer », colonne « Montant », agrégat `stats.total`. | Confidentialité tarifs |

### Validations Pass 3
- `tsc --noEmit` : ✅ 0 erreur
- `next build` : ✅ succès (`audit/build-pass3.log`)

### 🔴 Découverte structurelle majeure — Modules mock-only sans persistance

L'audit en profondeur révèle que **plusieurs modules entiers du produit ne
sont pas encore connectés à la base de données** : leurs données vivent
uniquement dans `src/lib/*/mock-data.ts`, et leurs UI/handlers n'écrivent
que dans le state React local (perdu au refresh).

| Module | UI existante | Modèle Prisma | API CRUD réel | Conséquence |
|---|---|---|---|---|
| Projets | `(app)/projects`, `/projects/[id]`, kanban | ❌ aucun | ❌ retourne `mockProjects` | Bouton « Lier à un projet » sur ticket inutilisable, pas de persistance |
| Time entries | `add-time-modal`, `ticket-billing-section` | ❌ | ❌ | Modal s'ouvre et calcule, mais l'entrée disparaît au refresh |
| Travel entries | `add-travel-modal` | ❌ | ❌ | idem |
| Expense entries | `add-expense-modal` | ❌ | ❌ | idem |
| Contracts (riche) | `contracts-section` (settings) | ⚠️ Modèle minimal `Contract` existe (organizationId, type, status, monthlyHours, hourlyRate) | ⚠️ GET/POST simples mais shape ≠ shape UI (UI attend `contractNumber`, `organizationName`, `serviceTier`, etc.) | Section settings affiche `mockContracts` |
| Billing profiles | `billing-profiles-section` | ❌ | ❌ | Section settings affiche `mockBillingProfiles` |

**Symptômes utilisateur observés** :
- « Lier à un projet » → bouton sans `onClick`, et de toute façon aucun stockage côté ticket (pas de `projectId` dans `model Ticket`).
- Modal d'entrée de temps « pas correctement développée » → en fait elle est complète et bien faite, mais `onSave` ne fait que `setTimeEntries(prev=>[...prev, entry])` côté React. Au refresh, tout est perdu. C'est ce qui donne l'impression d'un module fantôme.

**Plan de migration recommandé** (à exécuter module par module, chacun ≈ 1 session) :
1. **Projects** (le plus prioritaire car il débloque le lien ticket↔projet)
   - `model Project` Prisma : `id`, `code`, `name`, `organizationId`, `managerId`, `status`, `startDate`, `endDate`, `description`, `visibleToClient`, `metadata Json`
   - `model ProjectTask` (kanban)
   - `Ticket.projectId String?` + relation
   - Migration + seed depuis `mockProjects`
   - `/api/v1/projects` : remplacer mock par Prisma
   - `(app)/tickets/[id]` : modal `LinkProjectModal` + `PATCH /api/v1/tickets/:id { projectId }`
2. **TimeEntry / TravelEntry / ExpenseEntry**
   - 3 modèles Prisma + relation `Ticket`
   - `/api/v1/tickets/:id/time-entries`, `/travel-entries`, `/expenses`
   - Re-câbler `ticket-billing-section` pour fetch + persist
   - Ajouter contrôle de rôle : seules les routes d'agrégation `/api/v1/billing/*` exposent montants/taux ; les routes ticket-scoped renvoient quantité+couverture seulement
3. **Contracts riche**
   - Étendre `model Contract` (champs UI) ou créer `model ContractDetail` lié 1-1
   - Migration de `mockContracts` (uniquement les fixtures dev)
4. **Billing profiles**
   - `model BillingProfile` + association `Organization.billingProfileId`
   - `/api/v1/billing-profiles` (admin only)

### 🟡 Petits bugs collatéraux constatés
- `EditUserModal` (avant pass 2) listait les rôles en libellés FR (« Technicien Senior »), incompatibles avec les enums DB → corrigé pass 2.
- `proxy.ts` ne valide jamais réellement la session, juste la présence du cookie → P0 pass 2 (à finir avec contrôle de signature).
- `mockProjects` côté API expose des données inventées à n'importe quel client authentifié — fuite cosmétique mais à corriger en passant par Prisma.

---

## Backlog priorisé (passes suivantes)

### Sécurité — P0
1. **Auth manquante sur 47/56 routes API v1.** Stratégie recommandée : créer
   un helper `withAuth(handler, { role: "TECHNICIAN" })` et l'appliquer
   systématiquement. Découper par cluster (tickets, orgs, automations,
   scheduling, billing, kb, projects, integrations).
2. **Isolation tenant** : aucun handler ne filtre `organizationId` à partir
   de la session pour les rôles `CLIENT_*`. Risque de fuite cross-tenant via
   les API du portail (`/api/v1/portal/*`).
3. **CSRF** : NextAuth gère le login mais les POST/PATCH/DELETE des routes
   métier acceptent n'importe quelle origine. Ajouter une vérification
   `Origin` ou utiliser des Server Actions.
4. **Rate limiting** absent : login + endpoints publics du portail.

### Qualité code — P1
5. Éliminer les 215 `no-explicit-any` restants (mapping freshservice,
   services tickets/kanban/kb/sla/auth). Beaucoup peuvent devenir
   `Prisma.<Model>GetPayload<...>` ou `unknown` + narrowing.
6. Ajouter un runner de tests (Vitest recommandé : compatible SWC, rapide).
   Couvrir d'abord : auth-utils, orgs/service, tickets/service,
   sla/service, automations/service, et chaque route API mutante.

### Fonctionnel — P1
7. Endpoint `/api/v1/sites` (TODO restant côté `(app)/organizations/[id]`).
8. Section Settings → Utilisateurs : remplacer les `prompt()/confirm()` par
   une vraie modal de création + reset password serveur (route dédiée).
9. Module billing : importer/seeder les contrats — sinon le widget
   `billingMode` reste vide partout.

### Produit (Freshservice/PSA gap) — P2
10. SLA timers en arrière-plan (cron / queue) — la table existe, le
    moteur d'évaluation est partiel.
11. Automations : exécution déclenchée sur événements ticket (créer un
    bus interne ou table d'événements).
12. Audit log centralisé (`Activity` existe — étendre à toutes les routes
    mutantes via le helper `withAuth`).
13. Notifications email réelles via le module `smtp/` (à brancher sur les
    transitions de statut + commentaires).
14. Recherche globale (tickets/orgs/contacts/articles) — actuellement
    page-locale.

