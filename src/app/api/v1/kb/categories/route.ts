import { NextResponse } from "next/server";
import { listCategories, createCategory } from "@/lib/kb/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await listCategories();
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  const created = await createCategory(body);
  return NextResponse.json(created, { status: 201 });
}
