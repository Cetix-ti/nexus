"use client";

import { useState, useEffect } from "react";
import { X, Mail, Eye, Code, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  template: EmailTemplate | null; // null = create mode
  onClose: () => void;
  onSave: (t: EmailTemplate) => void;
}

const AVAILABLE_VARS = [
  "{{ticket_id}}",
  "{{ticket_subject}}",
  "{{ticket_url}}",
  "{{requester_name}}",
  "{{requester_email}}",
  "{{agent_name}}",
  "{{organization_name}}",
  "{{status}}",
  "{{priority}}",
  "{{created_at}}",
  "{{resolved_at}}",
];

export function EditEmailTemplateModal({ open, template, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tab, setTab] = useState<"visual" | "html" | "preview">("visual");

  useEffect(() => {
    if (open) {
      setName(template?.name || "");
      setSubject(template?.subject || "");
      setBody(
        template?.body ||
          "Bonjour {{requester_name}},\n\nVotre ticket {{ticket_id}} a été mis à jour.\n\nCordialement,\nL'équipe support"
      );
      setTab("visual");
    }
  }, [open, template]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function insertVar(v: string) {
    setBody((b) => b + v);
  }

  function handleSave() {
    if (!name.trim() || !subject.trim()) return;
    onSave({
      id: template?.id || `tmpl_${Date.now()}`,
      name: name.trim(),
      subject: subject.trim(),
      body,
      updatedAt: "à l'instant",
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60 shrink-0">
              <Mail className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {template ? "Modifier le modèle d'email" : "Nouveau modèle d'email"}
              </h2>
              <p className="text-[12.5px] text-slate-500 truncate">
                Personnalisez le sujet et le corps du courriel envoyé
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Input
            label="Nom du modèle"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Confirmation création ticket"
          />
          <Input
            label="Objet du courriel"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Votre ticket {{ticket_id}} a été reçu"
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] font-medium text-slate-700">
                Corps du courriel
              </label>
              <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setTab("visual")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium ${
                    tab === "visual"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <Code className="h-3 w-3" />
                  Visuel
                </button>
                <button
                  type="button"
                  onClick={() => setTab("html")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium ${
                    tab === "html"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <FileCode className="h-3 w-3" />
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setTab("preview")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium ${
                    tab === "preview"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  Aperçu
                </button>
              </div>
            </div>
            {tab === "visual" && (
              <AdvancedRichEditor
                value={body}
                onChange={setBody}
                placeholder="Rédigez le contenu du courriel..."
                minHeight="280px"
              />
            )}
            {tab === "html" && (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-[12px] font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
                placeholder="<p>Bonjour {{requester_name}},</p>"
              />
            )}
            {tab === "preview" && (
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-2.5 text-[12px] text-slate-600">
                  <div>
                    <span className="text-slate-400">De :</span>{" "}
                    <span className="font-medium">Cetix Support &lt;support@cetix.ca&gt;</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="text-slate-400">Objet :</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {subject || <em className="text-slate-400">(sans objet)</em>}
                    </span>
                  </div>
                </div>
                <div
                  className="tiptap p-6 text-[14px] text-slate-800 min-h-[280px]"
                  dangerouslySetInnerHTML={{
                    __html:
                      body ||
                      '<p style="color:#94a3b8">Le corps du courriel est vide.</p>',
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Variables disponibles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVar(v)}
                  className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-mono text-blue-700 hover:bg-blue-100 ring-1 ring-inset ring-blue-200/60"
                  title="Cliquez pour insérer"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {template ? "Enregistrer" : "Créer le modèle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
