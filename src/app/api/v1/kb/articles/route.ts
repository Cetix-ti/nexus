import { NextResponse } from "next/server";
import { listArticles, createArticle } from "@/lib/kb/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");
  const search = url.searchParams.get("q") || undefined;
  const includeDescendants = url.searchParams.get("includeDescendants") === "true";

  const articles = await listArticles({
    categoryId: categoryId || null,
    includeDescendants,
    search,
  });
  return NextResponse.json(articles);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }
  const article = await createArticle(body);
  return NextResponse.json(article, { status: 201 });
}
