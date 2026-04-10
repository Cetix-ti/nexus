"use client";

import { useRef, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Paperclip,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Heading1,
  Heading2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  variant?: "default" | "internal";
  attachments?: Attachment[];
  onAttachmentsChange?: (files: Attachment[]) => void;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface ToolbarButton {
  icon: typeof Bold;
  command: string;
  value?: string;
  title: string;
  divider?: boolean;
}

const TOOLBAR: ToolbarButton[] = [
  { icon: Heading1, command: "formatBlock", value: "h2", title: "Titre 1" },
  { icon: Heading2, command: "formatBlock", value: "h3", title: "Titre 2" },
  { icon: Bold, command: "bold", title: "Gras (⌘B)", divider: true },
  { icon: Italic, command: "italic", title: "Italique (⌘I)" },
  { icon: Underline, command: "underline", title: "Souligné (⌘U)" },
  { icon: Strikethrough, command: "strikeThrough", title: "Barré" },
  { icon: List, command: "insertUnorderedList", title: "Liste à puces", divider: true },
  { icon: ListOrdered, command: "insertOrderedList", title: "Liste numérotée" },
  { icon: Quote, command: "formatBlock", value: "blockquote", title: "Citation" },
  { icon: Code, command: "formatBlock", value: "pre", title: "Code" },
  { icon: AlignLeft, command: "justifyLeft", title: "Aligné à gauche", divider: true },
  { icon: AlignCenter, command: "justifyCenter", title: "Centré" },
  { icon: AlignRight, command: "justifyRight", title: "Aligné à droite" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Écrivez votre message...",
  minHeight = "140px",
  className,
  variant = "default",
  attachments = [],
  onAttachmentsChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(false);

  // Sync value to editor
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  function exec(command: string, val?: string) {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    handleInput();
    updateActiveFormats();
  }

  function handleInput() {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  function updateActiveFormats() {
    const formats = new Set<string>();
    if (document.queryCommandState("bold")) formats.add("bold");
    if (document.queryCommandState("italic")) formats.add("italic");
    if (document.queryCommandState("underline")) formats.add("underline");
    if (document.queryCommandState("strikeThrough")) formats.add("strikeThrough");
    if (document.queryCommandState("insertUnorderedList"))
      formats.add("insertUnorderedList");
    if (document.queryCommandState("insertOrderedList"))
      formats.add("insertOrderedList");
    setActiveFormats(formats);
  }

  function handleAddLink() {
    const url = prompt("URL du lien :");
    if (url) exec("createLink", url);
  }

  function handleAttach() {
    fileInputRef.current?.click();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newAttachments: Attachment[] = files.map((f) => ({
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    onAttachmentsChange?.([...attachments, ...newAttachments]);
    e.target.value = ""; // reset
  }

  function removeAttachment(id: string) {
    onAttachmentsChange?.(attachments.filter((a) => a.id !== id));
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white overflow-hidden transition-colors",
        isFocused
          ? variant === "internal"
            ? "border-amber-400 ring-2 ring-amber-500/20"
            : "border-blue-500 ring-2 ring-blue-500/20"
          : variant === "internal"
          ? "border-amber-200 bg-amber-50/30"
          : "border-slate-200",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200/80 bg-slate-50/40 flex-wrap">
        {TOOLBAR.map((btn, idx) => {
          const Icon = btn.icon;
          const isActive = activeFormats.has(btn.command);
          return (
            <span key={idx} className="flex items-center">
              {btn.divider && (
                <span className="mx-1 h-5 w-px bg-slate-200" />
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec(btn.command, btn.value)}
                className={cn(
                  "h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors",
                  isActive && "bg-white text-blue-600 ring-1 ring-slate-200/60 shadow-sm"
                )}
                title={btn.title}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </span>
          );
        })}

        <span className="mx-1 h-5 w-px bg-slate-200" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAddLink}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          title="Insérer un lien"
        >
          <LinkIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("undo")}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          title="Annuler (⌘Z)"
        >
          <Undo className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("redo")}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
          title="Rétablir"
        >
          <Redo className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>

        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleAttach}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11.5px] font-medium text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
            title="Joindre un fichier"
          >
            <Paperclip className="h-3.5 w-3.5" strokeWidth={2.25} />
            Joindre
          </button>
        </span>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        className={cn(
          "px-3.5 py-3 text-[13px] text-slate-800 leading-relaxed focus:outline-none",
          "[&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:my-2 [&_h2]:text-slate-900",
          "[&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:my-1.5 [&_h3]:text-slate-900",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5",
          "[&_li]:my-0.5",
          "[&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:text-slate-600 [&_blockquote]:my-2",
          "[&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:my-2",
          "[&_a]:text-blue-600 [&_a]:underline",
          "[&_strong]:font-semibold [&_em]:italic",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
        )}
        style={{ minHeight }}
        data-placeholder={placeholder}
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-t border-slate-200/80 px-3 py-2 bg-slate-50/40">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white pl-2 pr-1 py-1 shadow-sm"
              >
                <Paperclip className="h-3 w-3 text-slate-400" />
                <span className="text-[11.5px] font-medium text-slate-700 max-w-[160px] truncate">
                  {att.name}
                </span>
                <span className="text-[10.5px] text-slate-400 tabular-nums">
                  {formatFileSize(att.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Retirer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
