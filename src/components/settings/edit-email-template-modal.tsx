"use client";

import { useState, useEffect } from "react";
import { X, Mail, Eye, Code, FileCode, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";

export interface EmailTemplate {
  id: string;
  eventKey: string;
  audience: "agent" | "contact";
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: string;
}

interface VariableDef {
  key: string;
  label: string;
  description: string;
  example: string;
}

interface Props {
  open: boolean;
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditEmailTemplateModal({ open, template, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [tab, setTab] = useState<"visual" | "html" | "preview">("html");
  const [lastEditedIn, setLastEditedIn] = useState<"visual" | "html">("html");
  const [variables, setVariables] = useState<VariableDef[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setSubject(template.subject);
      setBody(template.body);
      setHtmlBody(template.body);
      setTab("html");
      setLastEditedIn("html");
      setPreviewHtml(null);
      setFeedback(null);
      // Charge le catalogue de variables disponible pour cet eventKey.
      fetch(`/api/v1/email-templates/variables?eventKey=${encodeURIComponent(template.eventKey)}`)
        .then((r) => r.ok ? r.json() : { variables: [] })
        .then((d) => setVariables(d.variables ?? []))
        .catch(() => setVariables([]));
    }
  }, [open, template]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open || !template) return null;

  function insertVar(varKey: string) {
    const token = `{{${varKey}}}`;
    if (tab === "html") setHtmlBody((b) => b + token);
    else setBody((b) => b + token);
  }

  function getCurrentBody(): string {
    return lastEditedIn === "html" ? htmlBody : body;
  }

  async function handleSave() {
    if (!name.trim() || !subject.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/v1/email-templates/${template!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          body: getCurrentBody(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFeedback(`Erreur : ${err.error ?? res.status}`);
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setFeedback("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function loadPreview() {
    if (!template) return;
    // On sauve d'abord pour que le preview reflète l'état édité (sans
    // ça, le serveur rendrait l'ancienne version DB). Implicit save :
    // pratique pour itérer rapidement.
    setSaving(true);
    await fetch(`/api/v1/email-templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.trim(), body: getCurrentBody() }),
    });
    setSaving(false);

    const res = await fetch(`/api/v1/email-templates/${template.id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "html" }),
    });
    if (res.ok) {
      const d = await res.json();
      setPreviewHtml(d.html);
      setPreviewSubject(d.subject);
    }
  }

  async function sendTestEmail() {
    if (!template) return;
    const to = prompt("Envoyer le preview à quelle adresse ?", "");
    if (!to) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/v1/email-templates/${template.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "send", to }),
      });
      const d = await res.json();
      setFeedback(d.ok ? `Envoyé à ${d.sentTo}` : `Erreur : ${d.error ?? "envoi échoué"}`);
    } catch {
      setFeedback("Erreur réseau");
    } finally {
      setSending(false);
    }
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
                onChange={(v) => { setBody(v); setLastEditedIn("visual"); }}
                placeholder="Rédigez le contenu du courriel..."
                minHeight="280px"
              />
            )}
            {tab === "html" && (
              <textarea
                value={htmlBody}
                onChange={(e) => { setHtmlBody(e.target.value); setLastEditedIn("html"); }}
                rows={16}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-[12px] font-mono text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
                placeholder="<p>Bonjour {{requester_name}},</p>"
              />
            )}
            {tab === "preview" && (
              <div className="space-y-3">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={loadPreview} disabled={saving}>
                    <Eye className="h-3.5 w-3.5" />
                    Rendre avec données factices
                  </Button>
                  <Button variant="outline" size="sm" onClick={sendTestEmail} disabled={sending}>
                    <Send className="h-3.5 w-3.5" />
                    Envoyer un test
                  </Button>
                </div>
                {feedback && (
                  <div className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                    {feedback}
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-2.5 text-[12px] text-slate-600">
                    <div>
                      <span className="text-slate-400">Objet :</span>{" "}
                      <span className="font-semibold text-slate-900">
                        {previewSubject || subject || <em className="text-slate-400">(sans objet)</em>}
                      </span>
                    </div>
                    {previewHtml && (
                      <div className="mt-0.5 text-[10.5px] text-slate-400">
                        Rendu côté serveur avec le chrome Cetix complet (logo, footer, lien préférences).
                      </div>
                    )}
                  </div>
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full min-h-[420px] bg-white"
                      sandbox=""
                      title="Preview email"
                    />
                  ) : (
                    <div
                      className="tiptap p-6 text-[14px] text-slate-800 min-h-[280px]"
                      dangerouslySetInnerHTML={{
                        __html:
                          getCurrentBody() ||
                          '<p style="color:#94a3b8">Le corps du courriel est vide.</p>',
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Variables disponibles ({variables.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVar(v.key)}
                  className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-mono text-blue-700 hover:bg-blue-100 ring-1 ring-inset ring-blue-200/60"
                  title={`${v.label} — ${v.description}\nExemple : ${v.example}`}
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
              {variables.length === 0 && (
                <span className="text-[11.5px] text-slate-400 italic">
                  Variables non documentées pour cet event.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          {feedback && tab !== "preview" && (
            <span className="mr-auto text-[12px] text-slate-600">{feedback}</span>
          )}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
