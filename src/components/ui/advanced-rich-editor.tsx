"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import FontFamily from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Highlighter,
  Palette,
  SubscriptIcon,
  SuperscriptIcon,
  Minus,
  Type,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const FONT_FAMILIES = [
  { label: "Sans-serif", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Monospace", value: "Menlo, Monaco, monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Courier", value: '"Courier New", monospace' },
];

const COLORS = [
  "#000000", "#4B5563", "#9CA3AF", "#DC2626", "#EA580C",
  "#D97706", "#65A30D", "#059669", "#0891B2", "#2563EB",
  "#7C3AED", "#C026D3", "#DB2777",
];

const HIGHLIGHTS = [
  "#FEF08A", "#FED7AA", "#FECACA", "#BBF7D0",
  "#BAE6FD", "#E9D5FF", "#FBCFE8",
];

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors disabled:opacity-30",
        active && "bg-white text-blue-600 ring-1 ring-slate-200/80 shadow-sm"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-slate-200" />;
}

function ColorPopover({
  editor,
  type,
}: {
  editor: Editor;
  type: "color" | "highlight";
}) {
  const colors = type === "color" ? COLORS : HIGHLIGHTS;
  return (
    <div className="relative group">
      <ToolbarButton
        onClick={() => {}}
        title={type === "color" ? "Couleur du texte" : "Surlignage"}
      >
        {type === "color" ? (
          <Palette className="h-3.5 w-3.5" />
        ) : (
          <Highlighter className="h-3.5 w-3.5" />
        )}
      </ToolbarButton>
      <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg w-44">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (type === "color") editor.chain().focus().setColor(c).run();
              else editor.chain().focus().toggleHighlight({ color: c }).run();
            }}
            className="h-5 w-5 rounded ring-1 ring-slate-200 hover:scale-110 transition-transform"
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (type === "color") editor.chain().focus().unsetColor().run();
            else editor.chain().focus().unsetHighlight().run();
          }}
          className="h-5 w-5 rounded ring-1 ring-slate-200 bg-white text-[10px] text-slate-400 flex items-center justify-center hover:bg-slate-50"
          title="Aucune"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function AdvancedRichEditor({
  value,
  onChange,
  placeholder = "Commencez à rédiger...",
  minHeight = "400px",
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      FontFamily.configure({ types: ["textStyle"] }),
      Subscript,
      Superscript,
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "tiptap focus:outline-none px-5 py-4 prose prose-slate max-w-none text-[14px]",
      },
    },
  });

  // Sync external value changes (e.g. when opening for edit)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white"
        style={{ minHeight }}
      />
    );
  }

  function addLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = prompt("URL du lien :", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function addImage() {
    const url = prompt("URL de l'image :");
    if (url) editor!.chain().focus().setImage({ src: url }).run();
  }

  function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor!.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function insertTable() {
    editor!
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-slate-50/60">
        {/* Row 1: paragraph + font + size */}
        <div className="flex items-center gap-1 px-2 py-1.5 flex-wrap border-b border-slate-200/60">
          <select
            value={
              editor.isActive("heading", { level: 1 })
                ? "h1"
                : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                ? "h3"
                : editor.isActive("heading", { level: 4 })
                ? "h4"
                : "p"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "p") editor.chain().focus().setParagraph().run();
              else
                editor
                  .chain()
                  .focus()
                  .toggleHeading({
                    level: parseInt(v.replace("h", "")) as 1 | 2 | 3 | 4,
                  })
                  .run();
            }}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] font-medium text-slate-700"
          >
            <option value="p">Paragraphe</option>
            <option value="h1">Titre 1</option>
            <option value="h2">Titre 2</option>
            <option value="h3">Titre 3</option>
            <option value="h4">Titre 4</option>
          </select>

          <select
            onChange={(e) => {
              if (e.target.value === "default") {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(e.target.value).run();
              }
            }}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] font-medium text-slate-700"
            defaultValue="default"
          >
            <option value="default">Police</option>
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>

          <Divider />

          <ColorPopover editor={editor} type="color" />
          <ColorPopover editor={editor} type="highlight" />

          <Divider />

          <ToolbarButton
            onClick={() =>
              editor.chain().focus().unsetAllMarks().clearNodes().run()
            }
            title="Effacer le formatage"
          >
            <Eraser className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {/* Row 2: formatting */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Gras (⌘B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italique (⌘I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Souligné (⌘U)"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Barré"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Code en ligne"
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            active={editor.isActive("subscript")}
            title="Indice"
          >
            <SubscriptIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            active={editor.isActive("superscript")}
            title="Exposant"
          >
            <SuperscriptIcon className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            title="Titre 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="Titre 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            title="Titre 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Liste à puces"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Liste numérotée"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive("taskList")}
            title="Liste de tâches"
          >
            <ListChecks className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Citation"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            title="Bloc de code"
          >
            <Type className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Ligne horizontale"
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
            title="Aligné à gauche"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            title="Centré"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
            title="Aligné à droite"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            active={editor.isActive({ textAlign: "justify" })}
            title="Justifié"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={addLink} active={editor.isActive("link")} title="Insérer un lien">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <label
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
            title="Téléverser une image"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={uploadImage}
            />
          </label>
          <ToolbarButton onClick={addImage} title="Insérer image par URL">
            <span className="text-[10px] font-bold">URL</span>
          </ToolbarButton>
          <ToolbarButton onClick={insertTable} title="Insérer un tableau">
            <TableIcon className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Annuler (⌘Z)"
          >
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Rétablir (⌘⇧Z)"
          >
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <span className="ml-auto text-[11px] text-slate-400 tabular-nums pr-2">
            {editor.storage.characterCount?.characters?.() ?? editor.getText().length}{" "}
            caractères
          </span>
        </div>

        {/* Table controls (visible when in table) */}
        {editor.isActive("table") && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-t border-slate-200/60 flex-wrap text-[11px]">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              + Colonne avant
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              + Colonne après
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().deleteColumn().run()}
              className="px-2 py-1 rounded hover:bg-white text-red-600"
            >
              × Colonne
            </button>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().addRowBefore().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              + Ligne avant
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().addRowAfter().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              + Ligne après
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().deleteRow().run()}
              className="px-2 py-1 rounded hover:bg-white text-red-600"
            >
              × Ligne
            </button>
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().mergeOrSplit().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              Fusionner/Séparer
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              className="px-2 py-1 rounded hover:bg-white text-slate-600"
            >
              En-tête de ligne
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="px-2 py-1 rounded hover:bg-white text-red-600 ml-auto"
            >
              Supprimer le tableau
            </button>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div style={{ minHeight }} className="overflow-auto bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
