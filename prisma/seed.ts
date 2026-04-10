/**
 * Nexus — Seed initial de la base de données
 *
 * Ce script :
 *   1. Active les extensions Postgres nécessaires (pgcrypto, unaccent)
 *   2. Installe le trigger de recherche plein texte français sur articles
 *   3. Seed les catégories KB et quelques articles de démo
 *
 * Usage :
 *   npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mockTickets } from "../src/lib/mock-data";

const connectionString =
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapStatus(s: string): any {
  return s.toUpperCase().replace(/-/g, "_");
}
function mapPriority(p: string): any {
  return p.toUpperCase();
}
function mapType(t: string): any {
  // mock uses "incident" | "request" | "problem" | "change"
  if (t === "request") return "SERVICE_REQUEST";
  return t.toUpperCase();
}
function mapSource(s: string): any {
  return s.toUpperCase();
}

async function installExtensions() {
  console.log("→ Extensions Postgres...");
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
  // Préparer pgvector pour recherche sémantique future (ignorer si absent)
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
    console.log("  ✓ pgvector activé");
  } catch {
    console.log("  ⚠ pgvector non disponible — OK, pourra être activé plus tard");
  }
  console.log("  ✓ pgcrypto + unaccent");
}

async function installFrenchSearch() {
  console.log("→ Recherche plein texte FR (unaccent + french)...");

  // Config texte combinant unaccent (accents) + dictionnaire français
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'french_unaccent') THEN
        CREATE TEXT SEARCH CONFIGURATION french_unaccent (COPY = french);
        ALTER TEXT SEARCH CONFIGURATION french_unaccent
          ALTER MAPPING FOR hword, hword_part, word
          WITH unaccent, french_stem;
      END IF;
    END
    $$;
  `);

  // Trigger qui met à jour search_vector à chaque INSERT/UPDATE d'un article
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION articles_search_vector_update()
    RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french_unaccent', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french_unaccent', coalesce(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('french_unaccent',
                  regexp_replace(coalesce(NEW.body, ''), '<[^>]*>', ' ', 'g')), 'C') ||
        setweight(to_tsvector('french_unaccent',
                  coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS articles_search_vector_trigger ON articles;`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER articles_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, summary, body, tags ON articles
    FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();
  `);

  console.log("  ✓ Trigger articles.search_vector installé (config french_unaccent)");
}

async function seedKbCategories() {
  console.log("→ Catégories KB...");

  const count = await prisma.articleCategory.count();
  if (count > 0) {
    console.log(`  ⚠ ${count} catégories existent déjà — skip`);
    return;
  }

  const demarrage = await prisma.articleCategory.create({
    data: { name: "Démarrage", slug: "demarrage", color: "#3B82F6", icon: "🚀", description: "Guides de prise en main" },
  });
  const email = await prisma.articleCategory.create({
    data: { name: "Email & Communication", slug: "email", color: "#6366F1", icon: "📧" },
  });
  await prisma.articleCategory.create({
    data: { name: "Outlook", slug: "outlook", parentId: email.id, color: "#6366F1", icon: "📨" },
  });
  const teams = await prisma.articleCategory.create({
    data: { name: "Microsoft Teams", slug: "teams", parentId: email.id, color: "#6366F1", icon: "💬" },
  });
  const reseau = await prisma.articleCategory.create({
    data: { name: "Réseau & VPN", slug: "reseau", color: "#0D9488", icon: "🌐" },
  });
  const vpn = await prisma.articleCategory.create({
    data: { name: "VPN", slug: "vpn", parentId: reseau.id, color: "#0D9488", icon: "🔒" },
  });
  const wifi = await prisma.articleCategory.create({
    data: { name: "Wi-Fi", slug: "wifi", parentId: reseau.id, color: "#0D9488", icon: "📶" },
  });
  await prisma.articleCategory.create({
    data: { name: "Matériel", slug: "materiel", color: "#EA580C", icon: "🖥️" },
  });
  await prisma.articleCategory.create({
    data: { name: "Logiciels", slug: "logiciels", color: "#9333EA", icon: "📦" },
  });
  const securite = await prisma.articleCategory.create({
    data: { name: "Sécurité", slug: "securite", color: "#DC2626", icon: "🛡️" },
  });
  const compte = await prisma.articleCategory.create({
    data: { name: "Compte & Accès", slug: "compte", color: "#D97706", icon: "🔑" },
  });

  console.log("  ✓ Arbre de catégories créé");

  // Quelques articles de démo
  const seedArticles = [
    { title: "Dépannage de la connexion VPN", categoryId: vpn.id, summary: "Guide pour résoudre les problèmes de connexion VPN", body: "<h2>Problème</h2><p>Si votre connexion VPN échoue, commencez par vérifier votre réseau local.</p><h2>Solution</h2><ol><li>Redémarrez votre modem</li><li>Vérifiez vos identifiants</li><li>Contactez le support</li></ol>", tags: ["vpn", "réseau", "dépannage"] },
    { title: "Connexion au réseau Wi-Fi corporatif", categoryId: wifi.id, summary: "Procédure de connexion au Wi-Fi de l'entreprise", body: "<p>Sélectionnez le réseau <strong>Cetix-Corp</strong> et entrez vos identifiants AD.</p>", tags: ["wifi"] },
    { title: "Activation de l'authentification multifacteur (MFA)", categoryId: securite.id, summary: "Activer le MFA Microsoft pour sécuriser votre compte", body: "<p>Le MFA renforce significativement la sécurité de votre compte.</p>", tags: ["mfa", "sécurité"] },
    { title: "Réinitialisation du mot de passe Active Directory", categoryId: compte.id, summary: "Procédure pour réinitialiser votre mot de passe AD", body: "<p>Rendez-vous sur le portail de réinitialisation.</p>", tags: ["ad", "mot de passe"] },
    { title: "Configuration d'Outlook pour la téléphonie Teams", categoryId: teams.id, summary: "Configurer Teams Phone depuis Outlook", body: "<p>Ouvrez Teams, puis Paramètres → Appels.</p>", tags: ["teams"] },
  ];

  for (const a of seedArticles) {
    await prisma.article.create({
      data: {
        title: a.title,
        slug: a.title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        summary: a.summary,
        body: a.body,
        tags: a.tags,
        status: "PUBLISHED",
        isPublic: true,
        publishedAt: new Date(),
        categoryId: a.categoryId,
      },
    });
  }

  console.log(`  ✓ ${seedArticles.length} articles de démo créés`);
}

// ----------------------------------------------------------------------------
// CORE SEED — orgs, users, contacts, categories, queues, tickets from mock-data
// ----------------------------------------------------------------------------

async function seedCore() {
  console.log("→ Core (orgs, users, contacts, categories, queues, tickets)...");

  const ticketCount = await prisma.ticket.count();
  if (ticketCount >= mockTickets.length) {
    console.log(`  ⚠ ${ticketCount} tickets existent déjà — skip core seed`);
    return;
  }
  if (ticketCount > 0) {
    console.log(`  ⚠ Purge des données partielles (${ticketCount} tickets)...`);
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.ticketTag.deleteMany();
    await prisma.ticketAsset.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.queue.deleteMany();
    await prisma.category.deleteMany();
    // Don't delete users that may have created articles
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  }

  // Distinct sets from mockTickets
  const orgNames = Array.from(new Set(mockTickets.map((t) => t.organizationName)));
  const techNames = Array.from(
    new Set(mockTickets.map((t) => t.assigneeName).filter(Boolean) as string[])
  );
  const requesters = Array.from(
    new Map(
      mockTickets.map((t) => [
        t.requesterEmail,
        {
          email: t.requesterEmail,
          name: t.requesterName,
          orgName: t.organizationName,
        },
      ])
    ).values()
  );
  const categoryNames = Array.from(new Set(mockTickets.map((t) => t.categoryName)));
  const queueNames = Array.from(new Set(mockTickets.map((t) => t.queueName)));
  const allTags = Array.from(new Set(mockTickets.flatMap((t) => t.tags)));

  // Orgs
  const orgIdByName = new Map<string, string>();
  for (const name of orgNames) {
    const slug = slugify(name);
    const org = await prisma.organization.create({
      data: { name, slug, plan: "standard" },
    });
    orgIdByName.set(name, org.id);
  }
  console.log(`  ✓ ${orgNames.length} organisations`);

  // Users (techs) — single MSP_ADMIN by default for assignees
  const userIdByName = new Map<string, string>();
  for (const fullName of techNames) {
    const [first, ...rest] = fullName.split(" ");
    const last = rest.join(" ") || "—";
    const email = `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}@cetix.ca`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: first,
        lastName: last,
        role: "TECHNICIAN",
      },
    });
    userIdByName.set(fullName, user.id);
  }
  // Add a system creator user that owns all seeded tickets
  const systemCreator = await prisma.user.create({
    data: {
      email: "system@cetix.ca",
      firstName: "System",
      lastName: "Seed",
      role: "MSP_ADMIN",
    },
  });
  console.log(`  ✓ ${techNames.length} techniciens + 1 system user`);

  // Contacts (requesters)
  const contactIdByEmail = new Map<string, string>();
  for (const r of requesters) {
    const orgId = orgIdByName.get(r.orgName);
    if (!orgId) continue;
    const [first, ...rest] = r.name.split(" ");
    const last = rest.join(" ") || "—";
    const contact = await prisma.contact.create({
      data: {
        organizationId: orgId,
        firstName: first,
        lastName: last,
        email: r.email,
      },
    });
    contactIdByEmail.set(r.email, contact.id);
  }
  console.log(`  ✓ ${requesters.length} contacts`);

  // Categories (global, no organizationId)
  const categoryIdByName = new Map<string, string>();
  for (const name of categoryNames) {
    const cat = await prisma.category.create({
      data: { name },
    });
    categoryIdByName.set(name, cat.id);
  }
  console.log(`  ✓ ${categoryNames.length} catégories tickets`);

  // Queues
  const queueIdByName = new Map<string, string>();
  for (const name of queueNames) {
    const q = await prisma.queue.create({
      data: { name },
    });
    queueIdByName.set(name, q.id);
  }
  console.log(`  ✓ ${queueNames.length} files d'attente`);

  // Tags
  const tagIdByName = new Map<string, string>();
  for (const name of allTags) {
    const tag = await prisma.tag.create({ data: { name } });
    tagIdByName.set(name, tag.id);
  }
  console.log(`  ✓ ${allTags.length} tags`);

  // Tickets
  for (const t of mockTickets) {
    const orgId = orgIdByName.get(t.organizationName);
    if (!orgId) continue;
    const requesterId = contactIdByEmail.get(t.requesterEmail) || null;
    const assigneeId = t.assigneeName ? userIdByName.get(t.assigneeName) || null : null;
    const categoryId = categoryIdByName.get(t.categoryName) || null;
    const queueId = queueIdByName.get(t.queueName) || null;

    const ticket = await prisma.ticket.create({
      data: {
        organizationId: orgId,
        requesterId,
        assigneeId,
        creatorId: systemCreator.id,
        categoryId,
        queueId,
        subject: t.subject,
        description: t.description,
        status: mapStatus(t.status),
        priority: mapPriority(t.priority),
        urgency: mapPriority(t.urgency),
        impact: mapPriority(t.impact),
        type: mapType(t.type),
        source: mapSource(t.source),
        dueAt: t.dueAt ? new Date(t.dueAt) : null,
        slaBreached: t.slaBreached,
        isOverdue: t.isOverdue,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
        ticketTags: {
          create: t.tags
            .map((name) => tagIdByName.get(name))
            .filter((id): id is string => !!id)
            .map((tagId) => ({ tagId })),
        },
        comments: {
          create: t.comments.map((c) => ({
            authorId: systemCreator.id,
            body: c.content,
            isInternal: c.isInternal,
            createdAt: new Date(c.createdAt),
          })),
        },
        activities: {
          create: t.activities.map((a) => ({
            userId: systemCreator.id,
            action: a.type,
            field: null,
            oldValue: a.oldValue,
            newValue: a.newValue,
            createdAt: new Date(a.createdAt),
            metadata: { authorName: a.authorName, content: a.content },
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${mockTickets.length} tickets avec commentaires + activités + tags`);
}

async function main() {
  console.log("\n🌱 Nexus seed\n");
  await installExtensions();
  await installFrenchSearch();
  await seedCore();
  await seedKbCategories();
  console.log("\n✅ Terminé\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
