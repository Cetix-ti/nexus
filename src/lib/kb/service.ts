import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ----------------------------------------------------------------------------
// CATEGORIES
// ----------------------------------------------------------------------------
export async function listCategories() {
  return prisma.articleCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(input: {
  name: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
  description?: string;
}) {
  return prisma.articleCategory.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      parentId: input.parentId ?? null,
      color: input.color ?? "#3B82F6",
      icon: input.icon ?? "📁",
      description: input.description,
    },
  });
}

export async function updateCategory(
  id: string,
  patch: Partial<{ name: string; color: string; icon: string; description: string; parentId: string | null }>
) {
  const data: Prisma.ArticleCategoryUpdateInput = { ...patch };
  if (patch.name) data.slug = slugify(patch.name);
  // Handle parentId via relation
  if ("parentId" in patch) {
    if (patch.parentId === null) data.parent = { disconnect: true };
    else if (patch.parentId) data.parent = { connect: { id: patch.parentId } };
    delete (data as any).parentId;
  }
  return prisma.articleCategory.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  // ON DELETE CASCADE on the self-relation removes children automatically
  // and SetNull on Article.categoryId detaches articles
  return prisma.articleCategory.delete({ where: { id } });
}

// Get all descendant ids (recursive CTE)
export async function getDescendantIds(id: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM article_categories WHERE parent_id = ${id}
      UNION ALL
      SELECT c.id FROM article_categories c
      INNER JOIN descendants d ON c.parent_id = d.id
    )
    SELECT id FROM descendants
  `;
  return rows.map((r) => r.id);
}

// ----------------------------------------------------------------------------
// ARTICLES
// ----------------------------------------------------------------------------
export async function listArticles(options?: {
  categoryId?: string | null;
  includeDescendants?: boolean;
  search?: string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publicOnly?: boolean;
}) {
  const where: Prisma.ArticleWhereInput = {};

  if (options?.status) where.status = options.status;
  if (options?.publicOnly) where.isPublic = true;

  if (options?.categoryId !== undefined && options.categoryId !== null) {
    if (options.includeDescendants) {
      const ids = [options.categoryId, ...(await getDescendantIds(options.categoryId))];
      where.categoryId = { in: ids };
    } else {
      where.categoryId = options.categoryId;
    }
  }

  // Full-text search using the french_unaccent config
  if (options?.search?.trim()) {
    const q = options.search.trim();
    // Use websearch_to_tsquery for natural input
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM articles
      WHERE search_vector @@ websearch_to_tsquery('french_unaccent', ${q})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('french_unaccent', ${q})) DESC
      LIMIT 200
    `;
    where.id = { in: ids.map((r) => r.id) };
  }

  return prisma.article.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: { category: true },
  });
}

export async function getArticleBySlug(slug: string) {
  return prisma.article.findFirst({
    where: { slug },
    include: { category: true, author: true },
  });
}

export async function createArticle(input: {
  title: string;
  summary?: string;
  body?: string;
  categoryId?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isPublic?: boolean;
  tags?: string[];
  authorId?: string | null;
}) {
  return prisma.article.create({
    data: {
      title: input.title,
      slug: slugify(input.title) + "-" + Date.now().toString(36),
      summary: input.summary || "",
      body: input.body || "",
      status: input.status || "DRAFT",
      isPublic: input.isPublic ?? true,
      tags: input.tags || [],
      categoryId: input.categoryId ?? null,
      authorId: input.authorId ?? null,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
    },
    include: { category: true },
  });
}

export async function updateArticle(
  id: string,
  patch: Partial<{
    title: string;
    summary: string;
    body: string;
    categoryId: string | null;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    isPublic: boolean;
    tags: string[];
  }>
) {
  const data: Prisma.ArticleUpdateInput = {};
  if (patch.title !== undefined) {
    data.title = patch.title;
    data.slug = slugify(patch.title) + "-" + id.slice(-6);
  }
  if (patch.summary !== undefined) data.summary = patch.summary;
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.status !== undefined) {
    data.status = patch.status;
    if (patch.status === "PUBLISHED") data.publishedAt = new Date();
  }
  if (patch.isPublic !== undefined) data.isPublic = patch.isPublic;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.categoryId !== undefined) {
    if (patch.categoryId === null) data.category = { disconnect: true };
    else data.category = { connect: { id: patch.categoryId } };
  }
  return prisma.article.update({
    where: { id },
    data,
    include: { category: true },
  });
}

export async function deleteArticle(id: string) {
  return prisma.article.delete({ where: { id } });
}

export async function incrementViewCount(id: string) {
  return prisma.article.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });
}
