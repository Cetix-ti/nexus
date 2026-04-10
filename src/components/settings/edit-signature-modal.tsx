"use client";

import { useState, useEffect } from "react";
import { X, Pencil, Eye, Camera, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export interface SignatureAgent {
  id: string;
  name: string;
  email: string;
  role: string;
  gradient: string;
  signature: string;
  signatureHtml?: string;
  avatar?: string | null;
  avatarUrl?: string;
}

interface EditSignatureModalProps {
  open: boolean;
  agent: SignatureAgent | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<SignatureAgent>) => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
}

function plainToHtml(plain: string): string {
  return plain
    .split("\n")
    .map((line) => `<div>${line || "<br>"}</div>`)
    .join("");
}

const TEMPLATES: { name: string; build: (a: SignatureAgent) => string }[] = [
  {
    name: "Minimaliste",
    build: (a) =>
      `<div><strong>${a.name}</strong></div><div>${a.role}</div><div>Cetix MSP</div><div>${a.email}</div>`,
  },
  {
    name: "Avec accroche",
    build: (a) =>
      `<div><strong>${a.name}</strong></div><div>${a.role} — Cetix MSP</div><div>${a.email}</div><div style="color:#64748b;font-size:11px;margin-top:6px;">Service desk MSP — disponible 24/7</div>`,
  },
  {
    name: "Complète",
    build: (a) =>
      `<div><strong>${a.name}</strong></div><div>${a.role}</div><div><strong>Cetix</strong> | Service desk MSP</div><div>📧 ${a.email}</div><div>📞 514-555-1100</div><div>🌐 cetix.ca</div>`,
  },
];

export function EditSignatureModal({
  open,
  agent,
  onClose,
  onSave,
}: EditSignatureModalProps) {
  const [signatureHtml, setSignatureHtml] = useState("");
  const [tab, setTab] = useState<"editor" | "html" | "preview">("editor");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    if (agent) {
      setSignatureHtml(agent.signatureHtml || plainToHtml(agent.signature));
      setTab("editor");
      setAvatar((agent as { avatar?: string | null }).avatar ?? null);
      setAvatarError(null);
    }
  }, [agent?.id]);

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    if (file.size > 500 * 1024) {
      setAvatarError("Image > 500 Ko (compressez-la)");
      e.target.value = "";
      return;
    }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result as string);
      setUploadingAvatar(false);
    };
    reader.onerror = () => {
      setAvatarError("Échec de la lecture du fichier");
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open || !agent) return null;

  function applyTemplate(idx: number) {
    if (!agent) return;
    setSignatureHtml(TEMPLATES[idx].build(agent));
  }

  function handleSave() {
    if (!agent) return;
    // Strip HTML for plain version (for backwards compat)
    const tmp =
      typeof window !== "undefined" ? document.createElement("div") : null;
    let plain = "";
    if (tmp) {
      tmp.innerHTML = signatureHtml;
      plain = tmp.textContent || "";
    }
    onSave(agent.id, {
      signature: plain.trim(),
      signatureHtml,
      avatar,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${agent.gradient} text-white text-[14px] font-semibold shadow-sm shrink-0`}
            >
              {getInitials(agent.name)}
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Profil et signature
              </h2>
              <p className="text-[12.5px] text-slate-500">
                {agent.name} — {agent.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Profile picture */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-slate-700">
              Photo de profil
            </label>
            <div className="flex items-center gap-4">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={agent.name}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-sm shrink-0"
                />
              ) : (
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${agent.gradient} text-white text-[18px] font-semibold shadow-sm shrink-0`}
                >
                  {getInitials(agent.name)}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                  {uploadingAvatar ? (
                    "Téléversement…"
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Téléverser une nouvelle photo
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                </label>
                {avatar ? (
                  <button
                    type="button"
                    onClick={() => setAvatar(null)}
                    className="text-[11.5px] font-medium text-red-500 hover:text-red-700 inline-flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer la photo
                  </button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              PNG, JPG ou WebP — max 500 Ko
            </p>
            {avatarError ? (
              <p className="mt-1 text-[11px] text-red-600">{avatarError}</p>
            ) : null}
          </div>

          {/* Templates */}
          <div>
            <label className="mb-2 block text-[13px] font-medium text-slate-700">
              Modèles prêts
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {TEMPLATES.map((t, idx) => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(idx)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* Editor / Preview tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[13px] font-medium text-slate-700">
                Signature électronique
              </label>
              <div className="flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5 ring-1 ring-inset ring-slate-200/60">
                <button
                  onClick={() => setTab("editor")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all",
                    tab === "editor"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                      : "text-slate-500"
                  )}
                >
                  <Pencil className="h-3 w-3" />
                  Éditeur
                </button>
                <button
                  onClick={() => setTab("html")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all",
                    tab === "html"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                      : "text-slate-500"
                  )}
                >
                  &lt;/&gt; HTML
                </button>
                <button
                  onClick={() => setTab("preview")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-all",
                    tab === "preview"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
                      : "text-slate-500"
                  )}
                >
                  <Eye className="h-3 w-3" />
                  Aperçu
                </button>
              </div>
            </div>

            {tab === "editor" ? (
              <RichTextEditor
                value={signatureHtml}
                onChange={setSignatureHtml}
                placeholder="Votre signature..."
                minHeight="180px"
              />
            ) : tab === "html" ? (
              <div>
                <textarea
                  value={signatureHtml}
                  onChange={(e) => setSignatureHtml(e.target.value)}
                  spellCheck={false}
                  className="w-full min-h-[200px] rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[12px] text-emerald-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="<p>Votre signature HTML ici…</p>"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Vous pouvez coller du HTML brut. Les balises de style inline et les liens sont préservés.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-4 min-h-[180px]">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-3 font-semibold">
                  Aperçu dans un courriel
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-[13px] text-slate-700 mb-3">
                    Bonjour, voici votre demande traitée. N&apos;hésitez pas à
                    me contacter pour toute question.
                  </p>
                  <div className="text-[12.5px] text-slate-700 mt-4 pt-3 border-t border-slate-100">
                    <div
                      className="leading-relaxed [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: signatureHtml }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
