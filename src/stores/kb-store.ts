"use client";

import { create } from "zustand";

// ----------------------------------------------------------------------------
// API-backed KB store. The persistence layer is now Postgres via /api/v1/kb/*.
// This store keeps a local cache that mirrors the server, with optimistic
// updates for snappy UI. Components consume the same interface as before.
// ----------------------------------------------------------------------------

export interface KbCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  color: string;
  icon: string;
  description?: string | null;
}

export type ArticleStatus = "draft" | "published" | "archived";

export interface KbArticle {
  id: string;
  slug: string;
  title: string;
  categoryId: string | null;
  summary: string;
  body: string;
  status: ArticleStatus;
  isPublic: boolean;
  tags: string[];
  author: string;
  views: number;
  helpful: number;
  createdAt: string;
  updatedAt: string;
}

// Server returns Postgres enum values uppercased — normalise to lowercase
function normalizeArticle(raw: any): KbArticle {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    categoryId: raw.categoryId ?? null,
    summary: raw.summary || "",
    body: raw.body || "",
    status: (raw.status || "DRAFT").toLowerCase() as ArticleStatus,
    isPublic: raw.isPublic ?? true,
    tags: raw.tags || [],
    author: raw.author?.firstName
      ? `${raw.author.firstName} ${raw.author.lastName}`
      : "—",
    views: raw.viewCount ?? 0,
    helpful: raw.helpfulCount ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function normalizeCategory(raw: any): KbCategory {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    parentId: raw.parentId ?? null,
    color: raw.color || "#3B82F6",
    icon: raw.icon || "📁",
    description: raw.description,
  };
}

interface KbState {
  categories: KbCategory[];
  articles: KbArticle[];
  loading: boolean;
  loaded: boolean;

  // Loaders
  loadAll: () => Promise<void>;

  // Categories
  addCategory: (name: string, parentId: string | null, color?: string, icon?: string) => Promise<string>;
  updateCategory: (id: string, patch: Partial<KbCategory>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  getCategoryPath: (id: string | null) => KbCategory[];
  getDescendantIds: (id: string) => string[];

  // Articles
  addArticle: (a: Omit<KbArticle, "id" | "slug" | "createdAt" | "updatedAt" | "views" | "helpful">) => Promise<KbArticle>;
  updateArticle: (id: string, patch: Partial<KbArticle>) => Promise<void>;
  deleteArticle: (id: string) => Promise<void>;
  getArticleBySlug: (slug: string) => KbArticle | undefined;
}

export const useKbStore = create<KbState>()((set, get) => ({
  categories: [],
  articles: [],
  loading: false,
  loaded: false,

  loadAll: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [catsRes, artsRes] = await Promise.all([
        fetch("/api/v1/kb/categories"),
        fetch("/api/v1/kb/articles"),
      ]);
      const cats = (await catsRes.json()) as any[];
      const arts = (await artsRes.json()) as any[];
      set({
        categories: cats.map(normalizeCategory),
        articles: arts.map(normalizeArticle),
        loaded: true,
        loading: false,
      });
    } catch (e) {
      console.error("KB load failed", e);
      set({ loading: false });
    }
  },

  addCategory: async (name, parentId, color, icon) => {
    try {
      const res = await fetch("/api/v1/kb/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId, color, icon }),
      });
      if (!res.ok) throw new Error("Erreur lors de la création de la catégorie");
      const created = normalizeCategory(await res.json());
      set((s) => ({ categories: [...s.categories, created] }));
      return created.id;
    } catch (err) {
      console.error("addCategory failed", err);
      throw err;
    }
  },

  updateCategory: async (id, patch) => {
    try {
      const res = await fetch(`/api/v1/kb/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour de la catégorie");
      const updated = normalizeCategory(await res.json());
      set((s) => ({
        categories: s.categories.map((c) => (c.id === id ? updated : c)),
      }));
    } catch (err) {
      console.error("updateCategory failed", err);
    }
  },

  deleteCategory: async (id) => {
    const res = await fetch(`/api/v1/kb/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const descendants = get().getDescendantIds(id);
    const toRemove = new Set([id, ...descendants]);
    set((s) => ({
      categories: s.categories.filter((c) => !toRemove.has(c.id)),
      articles: s.articles.map((a) =>
        a.categoryId && toRemove.has(a.categoryId) ? { ...a, categoryId: null } : a
      ),
    }));
  },

  getCategoryPath: (id) => {
    if (!id) return [];
    const cats = get().categories;
    const path: KbCategory[] = [];
    let current = cats.find((c) => c.id === id);
    while (current) {
      path.unshift(current);
      current = current.parentId
        ? cats.find((c) => c.id === current!.parentId)
        : undefined;
    }
    return path;
  },

  getDescendantIds: (id) => {
    const cats = get().categories;
    const result: string[] = [];
    function walk(parentId: string) {
      cats
        .filter((c) => c.parentId === parentId)
        .forEach((c) => {
          result.push(c.id);
          walk(c.id);
        });
    }
    walk(id);
    return result;
  },

  addArticle: async (a) => {
    try {
      const res = await fetch("/api/v1/kb/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: a.title,
          summary: a.summary,
          body: a.body,
          categoryId: a.categoryId,
          status: a.status.toUpperCase(),
          isPublic: a.isPublic,
          tags: a.tags,
        }),
      });
      if (!res.ok) throw new Error("Erreur lors de la création de l'article");
      const created = normalizeArticle(await res.json());
      set((s) => ({ articles: [created, ...s.articles] }));
      return created;
    } catch (err) {
      console.error("addArticle failed", err);
      throw err;
    }
  },

  updateArticle: async (id, patch) => {
    try {
      const payload: any = { ...patch };
      if (patch.status) payload.status = patch.status.toUpperCase();
      const res = await fetch(`/api/v1/kb/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erreur lors de la mise à jour de l'article");
      const updated = normalizeArticle(await res.json());
      set((s) => ({
        articles: s.articles.map((a) => (a.id === id ? updated : a)),
      }));
    } catch (err) {
      console.error("updateArticle failed", err);
    }
  },

  deleteArticle: async (id) => {
    try {
      const res = await fetch(`/api/v1/kb/articles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression de l'article");
      set((s) => ({ articles: s.articles.filter((a) => a.id !== id) }));
    } catch (err) {
      console.error("deleteArticle failed", err);
    }
  },

  getArticleBySlug: (slug) => get().articles.find((a) => a.slug === slug),
}));
