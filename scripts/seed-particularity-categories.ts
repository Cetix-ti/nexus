import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus"),
});

const CATEGORIES = [
  { name: "Infrastructure",  slug: "infrastructure",  icon: "🖥️", color: "#3B82F6", sortOrder: 10 },
  { name: "Logiciels",       slug: "logiciels",       icon: "📦", color: "#8B5CF6", sortOrder: 20 },
  { name: "Utilisateurs",    slug: "utilisateurs",    icon: "👥", color: "#10B981", sortOrder: 30 },
  { name: "Sauvegardes",     slug: "sauvegardes",     icon: "💾", color: "#F59E0B", sortOrder: 40 },
  { name: "Cloud",           slug: "cloud",           icon: "☁️", color: "#06B6D4", sortOrder: 50 },
  { name: "Réseau",          slug: "reseau",          icon: "🌐", color: "#6366F1", sortOrder: 60 },
  { name: "Sécurité",        slug: "securite",        icon: "🔒", color: "#EF4444", sortOrder: 70 },
  { name: "Organisationnel", slug: "organisationnel", icon: "🏢", color: "#64748B", sortOrder: 80 },
  { name: "Contractuel",     slug: "contractuel",     icon: "📄", color: "#A855F7", sortOrder: 90 },
  { name: "Autre",           slug: "autre",           icon: "📌", color: "#94A3B8", sortOrder: 999 },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.particularityCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: cat.sortOrder, isSystem: true },
      create: { ...cat, isSystem: true },
    });
  }
  const count = await prisma.particularityCategory.count();
  console.log(`✓ ${count} catégories Particularités seedées`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
