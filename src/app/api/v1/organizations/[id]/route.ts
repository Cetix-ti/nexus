import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrganization, updateOrganization, deleteOrganization } from "@/lib/orgs/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json(org);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  try {
    const updated = await updateOrganization(id, body);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        // Conflit unique : soit clientCode déjà utilisé, soit slug dérivé
        // collide avec celui d'une autre org.
        const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "";
        return NextResponse.json(
          {
            error:
              target.includes("client_code")
                ? "Ce code client est déjà utilisé par une autre organisation."
                : target.includes("slug")
                ? "Ce code client génère un slug déjà pris par une autre organisation."
                : "Conflit unique en base de données.",
          },
          { status: 409 }
        );
      }
      if (e.code === "P2025") {
        return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
      }
    }
    console.error("org update failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteOrganization(id);
  return NextResponse.json({ ok: true });
}
