import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus"),
});

const CATEGORIES = [
  { name: "Bureautique",      slug: "bureautique",      icon: "📝", color: "#3B82F6", sortOrder: 10 },
  { name: "Sécurité",         slug: "securite",         icon: "🛡️", color: "#EF4444", sortOrder: 20 },
  { name: "Métier",           slug: "metier",           icon: "🏛️", color: "#8B5CF6", sortOrder: 30 },
  { name: "Communication",    slug: "communication",    icon: "💬", color: "#06B6D4", sortOrder: 40 },
  { name: "Infrastructure",   slug: "infrastructure",   icon: "🖥️", color: "#6366F1", sortOrder: 50 },
  { name: "Sauvegarde",       slug: "sauvegarde",       icon: "💾", color: "#F59E0B", sortOrder: 60 },
  { name: "Développement",    slug: "developpement",    icon: "💻", color: "#10B981", sortOrder: 70 },
  { name: "Utilitaire",       slug: "utilitaire",       icon: "🔧", color: "#64748B", sortOrder: 80 },
  { name: "Pilotes & Firmware", slug: "pilotes-firmware", icon: "⚙️", color: "#A855F7", sortOrder: 90 },
  { name: "Autre",            slug: "autre",            icon: "📦", color: "#94A3B8", sortOrder: 999 },
];

async function main() {
  for (const cat of CATEGORIES) {
    await prisma.softwareCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: cat.sortOrder, isSystem: true },
      create: { ...cat, isSystem: true },
    });
  }
  const count = await prisma.softwareCategory.count();
  console.log(`✓ ${count} catégories Software seedées`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
