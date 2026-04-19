"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  FileText,
  Eye,
  ThumbsUp,
  BookOpen,
  PenLine,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  FolderTree,
  Home,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { NewArticleModal } from "@/components/knowledge/new-article-modal";
import { ManageCategoriesModal } from "@/components/knowledge/manage-categories-modal";
import { KbAuditDrawer } from "@/components/knowledge/kb-audit-drawer";
import { useKbStore, type KbCategory, type KbArticle } from "@/stores/kb-store";

const STATUS_CONFIG = {
  published: { label: "Publié", variant: "success" as const },
  draft: { label: "Brouillon", variant: "warning" as const },
  archived: { label: "Archivé", variant: "default" as const },
};

interface TreeNodeProps {
  cat: KbCategory;
  depth: number;
  childrenMap: Map<string | null, KbCategory[]>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  countsMap: Map<string, number>;
}

function TreeNode({
  cat,
  depth,
  childrenMap,
  selectedId,
  onSelect,
  expanded,
  toggle,
  countsMap,
}: TreeNodeProps) {
  const children = childrenMap.get(cat.id) || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(cat.id);
  const isSelected = selectedId === cat.id;
  const count = countsMap.get(cat.id) || 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer hover:bg-slate-100/80 transition-colors",
          isSelected && "bg-blue-50 text-blue-700 hover:bg-blue-50"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(cat.id)}
      >
        {hasChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggle(cat.id);
            }}
            className="h-4 w-4 inline-flex items-center justify-center text-slate-400 hover:text-slate-700"
          >
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}
        {hasChildren && isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: cat.color }} />
        )}
        <span className="truncate flex-1">{cat.name}</span>
        {count > 0 && (
          <span className="text-[10px] text-slate-400 tabular-nums">{count}</span>
        )}
      </div>
      {isOpen &&
        children.map((c) => (
          <TreeNode
            key={c.id}
            cat={c}
            depth={depth + 1}
            childrenMap={childrenMap}
            selectedId={selectedId}
            onSelect={onSelect}
            expanded={expanded}
            toggle={toggle}
            countsMap={countsMap}
          />
        ))}
    </div>
  );
}

export default function KnowledgePage() {
  const categories = useKbStore((s) => s.categories);
  const articles = useKbStore((s) => s.articles);
  const loadAll = useKbStore((s) => s.loadAll);
  const loaded = useKbStore((s) => s.loaded);
  const deleteArticle = useKbStore((s) => s.deleteArticle);
  const getCategoryPath = useKbStore((s) => s.getCategoryPath);
  const getDescendantIds = useKbStore((s) => s.getDescendantIds);

  useEffect(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [newArticleOpen, setNewArticleOpen] = useState(false);
  const [kbAuditOpen, setKbAuditOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KbArticle | null>(null);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(categories.filter((c) => c.parentId === null).map((c) => c.id))
  );
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Build children map
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, KbCategory[]>();
    categories.forEach((c) => {
      const list = map.get(c.parentId) || [];
      list.push(c);
      map.set(c.parentId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [categories]);

  // Article counts (including descendants)
  const countsMap = useMemo(() => {
    const m = new Map<string, number>();
    categories.forEach((c) => {
      const ids = new Set([c.id, ...getDescendantIds(c.id)]);
      m.set(c.id, articles.filter((a) => a.categoryId && ids.has(a.categoryId)).length);
    });
    return m;
  }, [categories, articles, getDescendantIds]);

  // Articles in current view (selected category + descendants), then search filter
  const visibleArticles = useMemo(() => {
    let scope = articles;
    if (selectedCategoryId) {
      const ids = new Set([selectedCategoryId, ...getDescendantIds(selectedCategoryId)]);
      scope = articles.filter((a) => a.categoryId && ids.has(a.categoryId));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      scope = scope.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return scope;
  }, [articles, selectedCategoryId, search, getDescendantIds]);

  const stats = useMemo(
    () => ({
      total: articles.length,
      published: articles.filter((a) => a.status === "published").length,
      drafts: articles.filter((a) => a.status === "draft").length,
      totalViews: articles.reduce((s, a) => s + a.views, 0),
    }),
    [articles]
  );

  const breadcrumb = selectedCategoryId ? getCategoryPath(selectedCategoryId) : [];
  const roots = childrenMap.get(null) || [];

  async function handleDelete(id: string) {
    if (confirm("Supprimer cet article ?")) await deleteArticle(id);
  }

  function categoryName(id: string | null): string {
    if (!id) return "—";
    return categories.find((c) => c.id === id)?.name || "—";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Base de connaissances</h1>
          <span className="inline-flex h-7 items-center rounded-full bg-neutral-100 px-2.5 text-sm font-medium text-neutral-600">
            {stats.total} articles
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={() => setKbAuditOpen(true)}>
            <Sparkles className="h-4 w-4 text-violet-500" strokeWidth={2.25} />
            Audit IA
          </Button>
          <Button variant="outline" size="md" onClick={() => setManageCategoriesOpen(true)}>
            <FolderTree className="h-4 w-4" strokeWidth={2.25} />
            Gérer les catégories
          </Button>
          <Button variant="primary" size="md" onClick={() => setNewArticleOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nouvel article
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Articles</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Publiés</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.published}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <PenLine className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Brouillons</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.drafts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
              <Eye className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Vues totales</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">
                {stats.totalViews.toLocaleString("fr-CA")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column: tree + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Tree sidebar */}
        <Card>
          <CardContent className="p-2">
            <div className="px-2 py-2 border-b border-slate-100 mb-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                Bibliothèque
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={cn(
                "w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-slate-100/80",
                selectedCategoryId === null && "bg-blue-50 text-blue-700 hover:bg-blue-50"
              )}
            >
              <span className="w-4" />
              <Home className="h-3.5 w-3.5 text-slate-400" />
              <span className="flex-1 text-left">Tous les articles</span>
              <span className="text-[10px] text-slate-400 tabular-nums">{articles.length}</span>
            </button>
            {roots.map((c) => (
              <TreeNode
                key={c.id}
                cat={c}
                depth={0}
                childrenMap={childrenMap}
                selectedId={selectedCategoryId}
                onSelect={setSelectedCategoryId}
                expanded={expanded}
                toggle={toggle}
                countsMap={countsMap}
              />
            ))}
          </CardContent>
        </Card>

        {/* Content area */}
        <div className="space-y-3">
          {/* Breadcrumb + search */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <nav className="flex items-center gap-1 text-[13px]">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className="text-slate-500 hover:text-blue-600 inline-flex items-center gap-1"
              >
                <Home className="h-3.5 w-3.5" />
                Bibliothèque
              </button>
              {breadcrumb.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-slate-300" />
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(c.id)}
                    className="text-slate-700 hover:text-blue-600 font-medium"
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="w-full sm:w-72">
              <Input
                placeholder="Rechercher dans cette section..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                iconLeft={<Search className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Article list */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-slate-50/40">
                    <th className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Titre
                    </th>
                    <th className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Catégorie
                    </th>
                    <th className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Statut
                    </th>
                    <th className="px-4 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Vues
                    </th>
                    <th className="px-4 py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Utile
                    </th>
                    <th className="px-4 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Mis à jour
                    </th>
                    <th className="px-4 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {visibleArticles.map((article) => {
                    const statusConf = STATUS_CONFIG[article.status];
                    return (
                      <tr key={article.id} className="hover:bg-neutral-50 group">
                        <td className="px-4 py-2">
                          <Link
                            href={`/knowledge/${article.slug}`}
                            className="text-[12.5px] font-medium text-neutral-900 hover:text-blue-600"
                          >
                            {article.title}
                          </Link>
                          <p className="text-[10.5px] text-neutral-400">par {article.author}</p>
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-[12.5px] text-neutral-700">
                            {categoryName(article.categoryId)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-[12.5px] text-neutral-600">
                            <Eye className="h-3 w-3 text-neutral-400" />
                            {article.views.toLocaleString("fr-CA")}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1 text-[12.5px] text-neutral-600">
                            <ThumbsUp className="h-3 w-3 text-neutral-400" />
                            {article.helpful}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-[12.5px] text-neutral-500">
                          {new Date(article.updatedAt).toLocaleDateString("fr-CA", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setEditingArticle(article)}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              title="Modifier"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(article.id)}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleArticles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-10 w-10 text-neutral-300" />
                  <p className="mt-3 text-sm text-neutral-500">Aucun article dans cette section</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <NewArticleModal
        open={newArticleOpen || !!editingArticle}
        article={editingArticle}
        initialCategoryId={selectedCategoryId}
        onClose={() => {
          setNewArticleOpen(false);
          setEditingArticle(null);
        }}
      />
      <ManageCategoriesModal
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
      />
      <KbAuditDrawer
        open={kbAuditOpen}
        onClose={() => setKbAuditOpen(false)}
      />
    </div>
  );
}
