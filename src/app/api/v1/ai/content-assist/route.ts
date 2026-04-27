// Endpoint IA générique : { kind, id, capability } → runContentAssist.
// kind détermine la table/permission ; capability définit l'action.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";
import { runContentAssist, type ContentCapability } from "@/lib/ai/content-assist";
import { requireAiPermission } from "@/lib/permissions/ai-guard";

type Kind =
  | "software_instance" | "software_template"
  | "gpo_template" | "gpo_instance"
  | "script_template" | "script_instance"
  | "policy_document"
  | "change";

const VALID_KINDS: Kind[] = [
  "software_instance", "software_template",
  "gpo_template", "gpo_instance",
  "script_template", "script_instance",
  "policy_document", "change",
];
const VALID_CAPS: ContentCapability[] = [
  "correct", "rewrite", "restructure", "summarize",
  "suggest_category", "suggest_tags", "detect_missing",
  "extract_variables", "explain",
];

interface SourceContent {
  title: string;
  body: string;
  summary?: string | null;
  tags?: string[];
  organizationId?: string | null;
  organizationName?: string | null;
}

async function loadSource(kind: Kind, id: string): Promise<SourceContent | null> {
  switch (kind) {
    case "software_instance": {
      const r = await prisma.softwareInstance.findUnique({
        where: { id },
        select: {
          name: true, bodyOverride: true, vendor: true, tags: true,
          organizationId: true,
          template: { select: { body: true, vendor: true } },
          organization: { select: { name: true } },
        },
      });
      if (!r) return null;
      return {
        title: r.name,
        body: r.bodyOverride || r.template?.body || "",
        summary: r.vendor ?? r.template?.vendor ?? null,
        tags: r.tags,
        organizationId: r.organizationId,
        organizationName: r.organization.name,
      };
    }
    case "software_template": {
      const r = await prisma.softwareTemplate.findUnique({
        where: { id },
        select: { name: true, body: true, vendor: true, tags: true },
      });
      return r ? { title: r.name, body: r.body, summary: r.vendor, tags: r.tags } : null;
    }
    case "gpo_template": {
      const r = await prisma.gpoTemplate.findUnique({
        where: { id },
        select: { nameStem: true, body: true, description: true, tags: true },
      });
      return r ? { title: r.nameStem, body: r.body, summary: r.description, tags: r.tags } : null;
    }
    case "gpo_instance": {
      const r = await prisma.gpoInstance.findUnique({
        where: { id },
        select: {
          computedName: true, bodyOverride: true, description: true,
          organizationId: true,
          template: { select: { body: true } },
          organization: { select: { name: true } },
        },
      });
      if (!r) return null;
      return {
        title: r.computedName,
        body: r.bodyOverride || r.template?.body || "",
        summary: r.description,
        organizationId: r.organizationId,
        organizationName: r.organization.name,
      };
    }
    case "script_template": {
      const r = await prisma.scriptTemplate.findUnique({
        where: { id },
        select: { title: true, bodyCode: true, bodyDocMarkdown: true, tags: true },
      });
      return r ? { title: r.title, body: r.bodyDocMarkdown || r.bodyCode, tags: r.tags } : null;
    }
    case "script_instance": {
      const r = await prisma.scriptInstance.findUnique({
        where: { id },
        select: { title: true, bodyCode: true, bodyDocMarkdown: true, organizationId: true, organization: { select: { name: true } } },
      });
      return r ? { title: r.title, body: r.bodyDocMarkdown || r.bodyCode, organizationId: r.organizationId, organizationName: r.organization.name } : null;
    }
    case "policy_document": {
      const r = await prisma.policyDocument.findUnique({
        where: { id },
        select: { title: true, body: true, summary: true, tags: true, organizationId: true, organization: { select: { name: true } } },
      });
      return r ? { title: r.title, body: r.body, summary: r.summary, tags: r.tags, organizationId: r.organizationId, organizationName: r.organization.name } : null;
    }
    case "change": {
      const r = await prisma.change.findUnique({
        where: { id },
        select: { title: true, body: true, summary: true, organizationId: true, organization: { select: { name: true } } },
      });
      return r ? { title: r.title, body: r.body, summary: r.summary, organizationId: r.organizationId, organizationName: r.organization.name } : null;
    }
  }
}

async function loadCategoryHints(kind: Kind): Promise<string[] | undefined> {
  if (kind === "software_instance" || kind === "software_template") {
    const cats = await prisma.softwareCategory.findMany({ where: { isActive: true }, select: { name: true } });
    return cats.map((c) => c.name);
  }
  if (kind === "gpo_template" || kind === "script_template" || kind === "policy_document") {
    const cats = await prisma.policyCategory.findMany({ where: { isActive: true }, select: { name: true } });
    return cats.map((c) => c.name);
  }
  return undefined;
}

export async function POST(req: Request) {
  const __aiGuard = await requireAiPermission("ai.run_jobs");
  if (!__aiGuard.ok) return __aiGuard.res;
  const me = __aiGuard.me;
  const body = await req.json();
  const kind = body?.kind as Kind;
  const id = String(body?.id ?? "");
  const capability = body?.capability as ContentCapability;
  if (!VALID_KINDS.includes(kind) || !VALID_CAPS.includes(capability) || !id) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const source = await loadSource(kind, id);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const categoryHints = capability === "suggest_category" ? await loadCategoryHints(kind) : undefined;

  const result = await runContentAssist({
    capability,
    title: source.title,
    body: source.body,
    summary: source.summary ?? undefined,
    tags: source.tags,
    categoryHints,
    organizationId: source.organizationId ?? undefined,
    organizationName: source.organizationName ?? undefined,
    userId: me.id,
  });
  return NextResponse.json(result);
}
