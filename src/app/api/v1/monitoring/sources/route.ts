import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  listSources,
  createSource,
  updateSource,
  deleteSource,
  rebackfill,
} from "@/lib/monitoring/service";
import { getCurrentUser, hasMinimumRole } from "@/lib/auth-utils";

const createSchema = z.object({
  emailOrPattern: z.string().min(3).max(200),
  label: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  emailOrPattern: z.string().min(3).max(200).optional(),
  label: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.boolean().optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (me.role.startsWith("CLIENT_")) return forbidden();
  return NextResponse.json(await listSources());
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const created = await createSource(parsed.data);
    // Rebackfill immédiat pour rattraper les tickets historiques.
    const updated = await rebackfill();
    return NextResponse.json({ source: created, backfilled: updated }, { status: 201 });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Cette adresse / ce motif est déjà enregistré" },
        { status: 409 }
      );
    }
    throw e;
  }
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { id, ...patch } = parsed.data;
  const updated = await updateSource(id, patch);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  if (!hasMinimumRole(me.role, "MSP_ADMIN")) return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteSource(id);
  return NextResponse.json({ ok: true });
}
