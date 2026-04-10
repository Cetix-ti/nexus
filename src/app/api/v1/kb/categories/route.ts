import { NextResponse } from "next/server";
import { listCategories, createCategory } from "@/lib/kb/service";

export async function GET() {
  const categories = await listCategories();
  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }
  const created = await createCategory(body);
  return NextResponse.json(created, { status: 201 });
}
