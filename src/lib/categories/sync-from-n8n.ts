// ============================================================================
// SYNC CATÉGORIES — N8N Data Tables → Nexus
//
// Source : N8N data table `freshservice_ticket_categories` (3 niveaux :
// category > sub_category > item_category). Le table N8N est lui-même
// alimenté en continu par un workflow N8N qui scrape Freshservice.
//
// Mode : WIPE puis IMPORT.
//   1. Toutes les `tickets.category_id` pointant vers une catégorie sont
//      mises à NULL (les tickets historiques perdent leur catégorie ; un
//      bulk-triage IA peut les recatégoriser plus tard).
//   2. Toutes les rows `categories` sont supprimées.
//   3. L'arbre est reconstruit depuis les rows N8N.
//
// Mapping de scope par RACINE niveau 1 :
//   - "Cetix" et "Preventix" → INTERNAL (et tous leurs descendants)
//   - tout le reste         → CLIENT
//
// Fusion "Administrateur réseau" + "Administrateur système" :
//   les deux racines sont fusionnées sous un seul nœud niveau 1
//   "Administrateur système et réseau" (CLIENT). Les sous-catégories des
//   deux sont rangées sous ce nœud.
//
// Idempotence : oui (wipe+rebuild). Sûr de relancer.
// ============================================================================

import prisma from "@/lib/prisma";
import type { CategoryScope } from "@prisma/client";

const N8N_API_URL = process.env.N8N_API_URL ?? "https://n8n.cetix.ca";
const N8N_API_KEY = process.env.N8N_API_KEY ?? "";
const N8N_TABLE_ID = "sfFedTRmGwFByalz";

interface N8nRow {
  category: string | null;
  sub_category: string | null;
  item_category: string | null;
  active: boolean;
}

const INTERNAL_ROOTS = new Set(["Cetix", "Preventix"]);
const ADMIN_MERGE_TARGET = "Administrateur système et réseau";
const ADMIN_MERGE_SOURCES = new Set([
  "Administrateur système",
  "Administrateur réseau",
]);

function classifyScope(rootName: string): CategoryScope {
  return INTERNAL_ROOTS.has(rootName) ? "INTERNAL" : "CLIENT";
}

/** Normalise le nom de racine après fusion admin. */
function canonicalRoot(name: string): string {
  return ADMIN_MERGE_SOURCES.has(name) ? ADMIN_MERGE_TARGET : name;
}

async function fetchAllRows(): Promise<N8nRow[]> {
  if (!N8N_API_KEY) throw new Error("N8N_API_KEY manquant dans l'environnement");
  const all: N8nRow[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(`${N8N_API_URL}/api/v1/data-tables/${N8N_TABLE_ID}/rows`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), {
      headers: { "X-N8N-API-KEY": N8N_API_KEY },
    });
    if (!res.ok) {
      throw new Error(`N8N API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data: N8nRow[]; nextCursor: string | null };
    all.push(...json.data);
    cursor = json.nextCursor;
  } while (cursor);
  return all;
}

interface SyncResult {
  rowsFetched: number;
  rowsActive: number;
  ticketsCleared: number;
  categoriesDeleted: number;
  categoriesCreated: number;
  rootsCreated: { name: string; scope: CategoryScope; childCount: number }[];
}

export async function syncCategoriesFromN8n(): Promise<SyncResult> {
  const rows = await fetchAllRows();
  const active = rows.filter((r) => r.active);

  // Construire l'arbre en mémoire avant la transaction.
  // Map racine → sous-catégories → items.
  const tree = new Map<string, Map<string, Set<string>>>();
  for (const r of active) {
    const rawRoot = (r.category ?? "").trim();
    if (!rawRoot) continue;
    const root = canonicalRoot(rawRoot);
    const sub = (r.sub_category ?? "").trim();
    const item = (r.item_category ?? "").trim();

    const subs = tree.get(root) ?? new Map<string, Set<string>>();
    if (sub) {
      const items = subs.get(sub) ?? new Set<string>();
      if (item) items.add(item);
      subs.set(sub, items);
    }
    tree.set(root, subs);
  }

  // Wipe + rebuild en transaction. Timeout étendu : la suppression peut
  // toucher ~13 500 tickets (UPDATE category_id=NULL) sur un env mature.
  const result = await prisma.$transaction(
    async (tx) => {
      const ticketsCleared = await tx.ticket.updateMany({
        where: { categoryId: { not: null } },
        data: { categoryId: null },
      });
      const deleted = await tx.category.deleteMany({});

      let created = 0;
      const rootsCreated: SyncResult["rootsCreated"] = [];

      let rootSort = 0;
      for (const [rootName, subs] of [...tree.entries()].sort()) {
        const scope = classifyScope(rootName);
        const root = await tx.category.create({
          data: {
            name: rootName,
            scope,
            sortOrder: rootSort++,
            isActive: true,
          },
        });
        created++;

        let childCount = 0;
        let subSort = 0;
        for (const [subName, items] of [...subs.entries()].sort()) {
          const sub = await tx.category.create({
            data: {
              name: subName,
              parentId: root.id,
              scope,
              sortOrder: subSort++,
              isActive: true,
            },
          });
          created++;
          childCount++;

          let itemSort = 0;
          for (const itemName of [...items].sort()) {
            await tx.category.create({
              data: {
                name: itemName,
                parentId: sub.id,
                scope,
                sortOrder: itemSort++,
                isActive: true,
              },
            });
            created++;
            childCount++;
          }
        }
        rootsCreated.push({ name: rootName, scope, childCount });
      }

      return {
        ticketsCleared: ticketsCleared.count,
        categoriesDeleted: deleted.count,
        categoriesCreated: created,
        rootsCreated,
      };
    },
    { timeout: 60_000 },
  );

  return {
    rowsFetched: rows.length,
    rowsActive: active.length,
    ...result,
  };
}
