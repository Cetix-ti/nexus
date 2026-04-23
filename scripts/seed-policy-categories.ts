import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus"),
});

const CATS = [
  { name: "Endpoint",           slug: "endpoint",           icon: "💻", color: "#3B82F6", sortOrder: 10 },
  { name: "Sécurité",           slug: "securite",           icon: "🛡️", color: "#EF4444", sortOrder: 20 },
  { name: "Identités & accès",  slug: "identites-acces",    icon: "🔑", color: "#F59E0B", sortOrder: 30 },
  { name: "Mots de passe",      slug: "mots-de-passe",      icon: "🔐", color: "#8B5CF6", sortOrder: 40 },
  { name: "Cloud / M365",       slug: "cloud-m365",         icon: "☁️", color: "#06B6D4", sortOrder: 50 },
  { name: "Sauvegardes",        slug: "sauvegardes",        icon: "💾", color: "#10B981", sortOrder: 60 },
  { name: "Réseau",             slug: "reseau",             icon: "🌐", color: "#6366F1", sortOrder: 70 },
  { name: "Automatisation",     slug: "automatisation",     icon: "⚙️", color: "#A855F7", sortOrder: 80 },
  { name: "Conformité",         slug: "conformite",         icon: "📋", color: "#64748B", sortOrder: 90 },
  { name: "Autre",              slug: "autre",              icon: "📌", color: "#94A3B8", sortOrder: 999 },
];

async function main() {
  for (const c of CATS) {
    await prisma.policyCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, color: c.color, sortOrder: c.sortOrder, isSystem: true },
      create: { ...c, isSystem: true },
    });
  }
  console.log(`✓ ${await prisma.policyCategory.count()} catégories Politiques seedées`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
