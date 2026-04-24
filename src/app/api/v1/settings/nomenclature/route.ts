// Nomenclature partagée stockée dans TenantSetting (KV global).
// Lecture : tout user authentifié (la légende est utile à tous).
// Écriture : SUPER_ADMIN uniquement.
//
// Trois clés gérées : policies.nomenclature.gpo, .scripts, .ad_groups.
// Chacune stocke `{ content: string, updatedAt: ISO, updatedByUserId: string }`.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const KINDS = ["gpo", "scripts", "ad_groups"] as const;
type Kind = (typeof KINDS)[number];
const keyFor = (k: Kind) => `policies.nomenclature.${k}`;

interface NomenclatureValue {
  content: string;
  updatedAt: string;
  updatedByUserId: string | null;
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.tenantSetting.findMany({
    where: { key: { in: KINDS.map(keyFor) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown as NomenclatureValue]));
  const out: Record<Kind, NomenclatureValue> = {
    gpo: byKey.get(keyFor("gpo")) ?? { content: "", updatedAt: "", updatedByUserId: null },
    scripts: byKey.get(keyFor("scripts")) ?? { content: "", updatedAt: "", updatedByUserId: null },
    ad_groups: byKey.get(keyFor("ad_groups")) ?? { content: "", updatedAt: "", updatedByUserId: null },
  };
  return NextResponse.json(out);
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const kind = body?.kind;
  const content = typeof body?.content === "string" ? body.content : null;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind invalide (${KINDS.join(", ")})` }, { status: 400 });
  }
  if (content === null) {
    return NextResponse.json({ error: "content requis" }, { status: 400 });
  }

  const value: NomenclatureValue = {
    content: content.slice(0, 50_000),
    updatedAt: new Date().toISOString(),
    updatedByUserId: me.id,
  };
  await prisma.tenantSetting.upsert({
    where: { key: keyFor(kind as Kind) },
    create: { key: keyFor(kind as Kind), value: value as never },
    update: { value: value as never },
  });
  return NextResponse.json({ ok: true, value });
}
