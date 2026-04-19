"use client";

import { useState, useEffect } from "react";
import { X, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KbRewriteDialog } from "./kb-rewrite-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { CategoryTreePicker } from "./category-tree-picker";
import { useKbStore, type KbArticle, type ArticleStatus } from "@/stores/kb-store";

interface NewArticleModalProps {
  open: boolean;
  article?: KbArticle | null; // null/undefined = create mode
  initialCategoryId?: string | null;
  onClose: () => void;
  onSaved?: (article: KbArticle) => void;
}

export function NewArticleModal({
  open,
  article,
  initialCategoryId = null,
  onClose,
  onSaved,
}: NewArticleModalProps) {
  const addArticle = useKbStore((s) => s.addArticle);
  const updateArticle = useKbStore((s) => s.updateArticle);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<ArticleStatus>("draft");
  const [isPublic, setIsPublic] = useState(true);
  const [tagsInput, setTagsInput] = useState("");
  const [rewriteOpen, setRewriteOpen] = useState(false);

  useEffect(() => {
    if (open) {
      if (article) {
        setTitle(article.title);
        setCategoryId(article.categoryId);
        setSummary(article.summary);
        setBody(article.body);
        setStatus(article.status);
        setIsPublic(article.isPublic);
        setTagsInput(article.tags.join(", "));
      } else {
        setTitle("");
        setCategoryId(initialCategoryId);
        setSummary("");
        setBody("");
        setStatus("draft");
        setIsPublic(true);
        setTagsInput("");
      }
    }
  }, [open, article, initialCategoryId]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave(saveStatus?: ArticleStatus) {
    if (!title.trim()) return;
    const finalStatus = saveStatus || status;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      if (article) {
        await updateArticle(article.id, {
          title,
          categoryId,
          summary,
          body,
          status: finalStatus,
          isPublic,
          tags,
        });
        onSaved?.({ ...article, title, categoryId, summary, body, status: finalStatus, isPublic, tags });
      } else {
        const created = await addArticle({
          title,
          categoryId,
          summary,
          body,
          status: finalStatus,
          isPublic,
          tags,
          author: "Vous",
        });
        onSaved?.(created);
      }
      onClose();
    } catch (e) {
      alert("Erreur lors de l'enregistrement : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <BookOpen className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {article ? "Modifier l'article" : "Nouvel article"}
              </h2>
              <p className="text-[12.5px] text-slate-500">
                {article
                  ? "Mettez à jour le contenu de votre article"
                  : "Créez un article pour votre base de connaissances"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <Input
            label="Titre de l'article"
            placeholder="Ex: Comment configurer une connexion VPN"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Catégorie / sous-catégorie
              </label>
              <CategoryTreePicker value={categoryId} onChange={setCategoryId} />
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                  Statut
                </label>
                <Select value={status} onValueChange={(v) => setStatus(v as ArticleStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="published">Publié</SelectItem>
                    <SelectItem value="archived">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Tags (séparés par des virgules)"
                placeholder="vpn, configuration, windows"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    isPublic ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      isPublic ? "translate-x-[18px]" : "translate-x-0.5"
                    } translate-y-0.5`}
                  />
                </button>
                <div>
                  <p className="text-[13px] font-medium text-slate-700">
                    Article public
                  </p>
                  <p className="text-[11.5px] text-slate-500">
                    Visible dans le portail client
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Résumé
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="Résumé court de l'article (1-2 phrases)..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-[13px] font-medium text-slate-700">
                Contenu
              </label>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setRewriteOpen(true)}
                disabled={!title.trim() || !body.trim()}
                title={
                  !title.trim() || !body.trim()
                    ? "Ajoute un titre et du contenu d'abord"
                    : "Reformuler l'article avec l'IA"
                }
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                Reformuler avec l'IA
              </Button>
            </div>
            <AdvancedRichEditor
              value={body}
              onChange={setBody}
              placeholder="Rédigez le contenu de votre article..."
              minHeight="450px"
            />
          </div>
        </div>

        <KbRewriteDialog
          open={rewriteOpen}
          currentTitle={title}
          currentSummary={summary}
          currentBody={body}
          onClose={() => setRewriteOpen(false)}
          onApply={(next) => {
            setTitle(next.title);
            setSummary(next.summary);
            setBody(next.body);
          }}
        />

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="outline" onClick={() => handleSave("draft")}>
            Enregistrer comme brouillon
          </Button>
          <Button variant="primary" onClick={() => handleSave("published")}>
            {article ? "Enregistrer & publier" : "Publier l'article"}
          </Button>
        </div>
      </div>
    </div>
  );
}
