#!/usr/bin/env tsx
/**
 * Cleanup KB category duplicates.
 *
 * Strategy:
 *   1. List all categories grouped by name
 *   2. For each name with duplicates, keep the one that has articles (or has children)
 *   3. Delete the empty duplicates
 *   4. Also delete leaf categories that are completely empty (no articles, no children)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus"
);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("\n🧹 Cleanup KB categories\n");

  const allCats = await prisma.articleCategory.findMany();
  console.log(`→ ${allCats.length} catégories au total`);

  // Count articles + children for each category
  const stats = await Promise.all(
    allCats.map(async (c) => ({
      cat: c,
      articleCount: await prisma.article.count({ where: { categoryId: c.id } }),
      childCount: await prisma.articleCategory.count({ where: { parentId: c.id } }),
    }))
  );

  // Group by normalized name (case-insensitive, trimmed)
  const byName = new Map<string, typeof stats>();
  for (const s of stats) {
    const key = s.cat.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(s);
  }

  let removedDupes = 0;
  let removedEmptyLeaves = 0;

  // Step 1: deduplicate by name — keep the one with most content
  for (const [name, group] of byName) {
    if (group.length <= 1) continue;
    // Sort: most articles first, then most children, then oldest createdAt
    group.sort((a, b) => {
      if (a.articleCount !== b.articleCount)
        return b.articleCount - a.articleCount;
      if (a.childCount !== b.childCount) return b.childCount - a.childCount;
      return a.cat.createdAt.getTime() - b.cat.createdAt.getTime();
    });
    const winner = group[0];
    const losers = group.slice(1);

    for (const loser of losers) {
      // Reparent any children of loser to the winner (just in case)
      await prisma.articleCategory.updateMany({
        where: { parentId: loser.cat.id },
        data: { parentId: winner.cat.id },
      });
      // Move any articles to the winner
      await prisma.article.updateMany({
        where: { categoryId: loser.cat.id },
        data: { categoryId: winner.cat.id },
      });
      // Delete the empty duplicate
      await prisma.articleCategory.delete({ where: { id: loser.cat.id } });
      removedDupes++;
    }
    if (losers.length > 0) {
      console.log(
        `  ✓ "${name}" : 1 conservée, ${losers.length} doublon(s) fusionné(s)`
      );
    }
  }

  console.log(`\n→ ${removedDupes} doublons fusionnés`);

  // Step 2: delete empty leaves (no articles, no children) — bottom-up
  // Run in a loop until no more empties exist (since deleting a leaf may
  // create a new empty leaf above it).
  let pass = 1;
  while (true) {
    const remaining = await prisma.articleCategory.findMany();
    const emptyLeaves: string[] = [];
    for (const c of remaining) {
      const articleCount = await prisma.article.count({
        where: { categoryId: c.id },
      });
      const childCount = await prisma.articleCategory.count({
        where: { parentId: c.id },
      });
      if (articleCount === 0 && childCount === 0) emptyLeaves.push(c.id);
    }
    if (emptyLeaves.length === 0) break;
    await prisma.articleCategory.deleteMany({ where: { id: { in: emptyLeaves } } });
    removedEmptyLeaves += emptyLeaves.length;
    console.log(`  pass ${pass}: ${emptyLeaves.length} catégories vides supprimées`);
    pass++;
  }

  console.log(`\n→ ${removedEmptyLeaves} catégories vides supprimées au total`);

  const finalCount = await prisma.articleCategory.count();
  console.log(`\n✅ Terminé — ${finalCount} catégories restantes\n`);
}

main()
  .catch((e) => {
    console.error("❌ Échec:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
