import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

const FLAGS = [
  "hasAD", "hasAzureAD", "hasEntra", "hasM365", "hasExchangeOnPrem",
  "hasVPN", "hasRDS", "hasHyperV", "hasVMware", "hasOnPremServers",
  "hasBackupsVeeam", "hasSOC", "hasMDM", "hasKeePass", "allowEnglishUI",
] as const;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let caps = await prisma.orgCapabilities.findUnique({ where: { organizationId: id } });
  if (!caps) {
    caps = await prisma.orgCapabilities.create({ data: { organizationId: id } });
  }
  return NextResponse.json(caps);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = { updatedByUserId: me.id };
  for (const k of FLAGS) {
    if (k in body && typeof body[k] === "boolean") data[k] = body[k];
  }
  if ("extras" in body) data.extras = body.extras ?? null;

  const existing = await prisma.orgCapabilities.findUnique({ where: { organizationId: id } });
  const caps = existing
    ? await prisma.orgCapabilities.update({ where: { organizationId: id }, data })
    : await prisma.orgCapabilities.create({ data: { organizationId: id, ...data } });
  return NextResponse.json(caps);
}
