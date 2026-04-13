import { NextResponse } from "next/server";
import { listBoards, createBoard } from "@/lib/kanban-boards/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listBoards());
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  return NextResponse.json(await createBoard(body), { status: 201 });
}
