import { NextResponse } from "next/server";
import { listBoards, createBoard } from "@/lib/kanban-boards/service";

export async function GET() {
  return NextResponse.json(await listBoards());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name requis" }, { status: 400 });
  return NextResponse.json(await createBoard(body), { status: 201 });
}
