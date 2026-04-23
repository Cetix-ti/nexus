// Portail client : explications vulgarisées + résumés sur contenus exposés.
// Entrée restreinte — pas d'input libre, seulement { kind, id }.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentPortalUser } from "@/lib/portal/current-user.server";
import { runContentAssist, type ContentCapability } from "@/lib/ai/content-assist";

type Kind = "particularity" | "policy_document" | "change";

const CAPS: ContentCapability[] = ["summarize", "explain"];

export async function POST(req: Request) {
  const portalUser = await getCurrentPortalUser();
  if (!portalUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const kind = body?.kind as Kind;
  const id = String(body?.id ?? "");
  const capability = body?.capability as ContentCapability;
  if (!id || !CAPS.includes(capability)) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });

  let source: { title: string; body: string; summary?: string | null } | null = null;
  if (kind === "particularity") {
    if (!portalUser.permissions.canSeeParticularities) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const p = await prisma.particularity.findUnique({ where: { id }, select: { title: true, summary: true, body: true, organizationId: true, visibility: true, status: true } });
    if (!p || p.organizationId !== portalUser.organizationId || p.status !== "ACTIVE" || p.visibility === "INTERNAL") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    source = { title: p.title, body: p.body, summary: p.summary };
  } else if (kind === "policy_document") {
    if (!portalUser.permissions.canSeePolicies) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const d = await prisma.policyDocument.findUnique({ where: { id }, select: { title: true, summary: true, body: true, organizationId: true, visibility: true, status: true, subcategory: true } });
    const INTERNAL_ONLY = ["SCRIPT", "PRIVILEGED_ACCESS", "KEEPASS"];
    if (!d || d.organizationId !== portalUser.organizationId || d.status !== "ACTIVE" || d.visibility === "INTERNAL" || INTERNAL_ONLY.includes(d.subcategory)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    source = { title: d.title, body: d.body, summary: d.summary };
  } else if (kind === "change") {
    if (!portalUser.permissions.canSeeChanges) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const c = await prisma.change.findUnique({ where: { id }, select: { title: true, summary: true, body: true, organizationId: true, visibility: true, status: true, exposeToClientAdmin: true } });
    if (!c || c.organizationId !== portalUser.organizationId || c.status !== "PUBLISHED" || !c.exposeToClientAdmin) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    source = { title: c.title, body: c.body, summary: c.summary };
  } else {
    return NextResponse.json({ error: "kind invalide" }, { status: 400 });
  }

  const result = await runContentAssist({
    capability,
    title: source.title,
    body: source.body,
    summary: source.summary ?? undefined,
    userId: portalUser.contactId,
    organizationId: portalUser.organizationId,
  });
  return NextResponse.json(result);
}
