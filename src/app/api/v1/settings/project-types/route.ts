import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const KEY = "project.types";

// Default types matching the original hardcoded list
const DEFAULTS = [
  { key: "implementation", label: "Implémentation" },
  { key: "migration", label: "Migration" },
  { key: "deployment", label: "Déploiement" },
  { key: "upgrade", label: "Mise à jour" },
  { key: "audit", label: "Audit" },
  { key: "consulting", label: "Consultation" },
  { key: "development", label: "Développement" },
  { key: "maintenance", label: "Maintenance" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "other", label: "Autre" },
];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.tenantSetting.findUnique({ where: { key: KEY } });
  const types = row ? (row.value as any) : DEFAULTS;
  return NextResponse.json(types);
}

export async function PUT(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!Array.isArray(body) || body.some((t: any) => !t.key || !t.label)) {
    return NextResponse.json(
      { error: "Array of { key, label } required" },
      { status: 422 },
    );
  }
  await prisma.tenantSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: body as any },
    update: { value: body as any },
  });
  return NextResponse.json(body);
}
