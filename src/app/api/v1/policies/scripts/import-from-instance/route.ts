// POST /api/v1/policies/scripts/import-from-instance
// Crée atomiquement un ScriptTemplate (générique avec {{variables}}) + un
// ScriptInstance (variant client avec resolvedVariables remplies) à partir
// du résultat validé de l'extraction IA.
//
// L'agent a déjà :
//   1. Collé son script client → /extract-vars (étape précédente)
//   2. Reviewé/édité les variables et le code générique
//   3. Cliqué "Créer le template + déploiement"
//
// Cet endpoint reçoit le résultat final et persiste en transaction.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser, isStaffRole } from "@/lib/auth-utils";
import type { ScriptLanguage } from "@prisma/client";

interface ExtractedVariable {
  name: string;
  description: string;
  type: string;
  resolvedValue: string;
}

const LANG_MAP: Record<string, ScriptLanguage> = {
  powershell: "POWERSHELL",
  bash: "BASH",
  python: "PYTHON",
  batch: "BATCH",
  javascript: "OTHER",
  other: "OTHER",
};

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
  const language = (typeof body?.language === "string" ? body.language : "powershell").toLowerCase();
  const genericCode = typeof body?.genericCode === "string" ? body.genericCode : "";
  const variables: ExtractedVariable[] = Array.isArray(body?.variables) ? body.variables : [];
  const notes = typeof body?.notes === "string" ? body.notes : null;
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : null;

  if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });
  if (!organizationId) return NextResponse.json({ error: "organizationId requis" }, { status: 400 });
  if (!genericCode.trim()) return NextResponse.json({ error: "genericCode requis" }, { status: 400 });
  if (!LANG_MAP[language]) return NextResponse.json({ error: `language invalide` }, { status: 400 });

  // Vérifie que l'org existe
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });

  // Construction du body_code de l'instance : on substitue chaque {{var}} par
  // sa resolvedValue. Si une variable n'a pas de resolvedValue, on garde le
  // placeholder (l'agent verra qu'il faut le compléter).
  let instanceCode = genericCode;
  const resolvedMap: Record<string, string> = {};
  for (const v of variables) {
    if (!v.name) continue;
    if (v.resolvedValue) {
      const placeholder = new RegExp(`\\{\\{\\s*${escapeRegex(v.name)}\\s*\\}\\}`, "g");
      instanceCode = instanceCode.replace(placeholder, v.resolvedValue);
      resolvedMap[v.name] = v.resolvedValue;
    }
  }

  // Variables stockées sur le template = schéma (sans valeurs).
  const templateVariables = variables.map((v) => ({
    name: v.name,
    description: v.description ?? "",
    type: v.type ?? "string",
  }));

  const lang = LANG_MAP[language];
  const docMarkdown = notes ? `## Notes IA\n\n${notes}\n` : null;

  try {
    const tx = await prisma.$transaction(async (db) => {
      const template = await db.scriptTemplate.create({
        data: {
          title,
          language: lang,
          categoryId,
          bodyCode: genericCode,
          bodyDocMarkdown: docMarkdown,
          variables: templateVariables as never,
          createdByUserId: me.id,
          updatedByUserId: me.id,
          publishedAt: new Date(),
        },
      });
      const instance = await db.scriptInstance.create({
        data: {
          organizationId,
          templateId: template.id,
          templateSchemaVersion: template.schemaVersion,
          title,
          language: lang,
          bodyCode: instanceCode,
          resolvedVariables: resolvedMap as never,
          updatedByUserId: me.id,
        },
      });
      return { template, instance };
    });
    return NextResponse.json({
      ok: true,
      templateId: tx.template.id,
      instanceId: tx.instance.id,
      organizationName: org.name,
    });
  } catch (err) {
    console.error("[scripts import-from-instance] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur création" },
      { status: 500 },
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
