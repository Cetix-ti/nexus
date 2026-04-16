// ============================================================================
// GET  /api/v1/security-center/persistence-whitelists
// POST /api/v1/security-center/persistence-whitelists
//
// CRUD des règles de whitelist pour les logiciels de télé-assistance /
// persistance. Cascade appliquée côté décodeur : host > client > default.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

type Scope = "host" | "client" | "default";

function isScope(v: unknown): v is Scope {
  return v === "host" || v === "client" || v === "default";
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const organizationId = url.searchParams.get("organizationId");

  const rows = await prisma.securityPersistenceWhitelist.findMany({
    where: {
      ...(scope && isScope(scope) ? { scope } : {}),
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
    },
    orderBy: [{ scope: "asc" }, { softwareName: "asc" }],
  });

  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role.startsWith("CLIENT_")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        scope?: string;
        organizationId?: string | null;
        hostname?: string | null;
        softwareName?: string;
        allowed?: boolean;
        notes?: string | null;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (!isScope(body.scope)) {
    return NextResponse.json({ error: "scope invalide (host|client|default)" }, { status: 400 });
  }
  const software = (body.softwareName ?? "").trim();
  if (!software) {
    return NextResponse.json({ error: "softwareName requis" }, { status: 400 });
  }
  if (body.scope === "host" && !body.hostname) {
    return NextResponse.json({ error: "hostname requis pour scope=host" }, { status: 400 });
  }
  if ((body.scope === "host" || body.scope === "client") && !body.organizationId) {
    return NextResponse.json(
      { error: "organizationId requis pour scope=host|client" },
      { status: 400 },
    );
  }

  const created = await prisma.securityPersistenceWhitelist.create({
    data: {
      scope: body.scope,
      organizationId: body.organizationId || null,
      hostname: body.scope === "host" ? (body.hostname ?? null) : null,
      softwareName: software,
      allowed: body.allowed ?? true,
      notes: body.notes ?? null,
      createdBy: me.id,
    },
    include: {
      organization: { select: { id: true, name: true, clientCode: true } },
    },
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
