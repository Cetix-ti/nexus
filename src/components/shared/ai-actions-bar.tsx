"use client";

import { useState } from "react";
import { Sparkles, Wand2, ListTree, FileText, Tag, AlertCircle, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

export type AiAction =
  | "correct"
  | "rewrite"
  | "restructure"
  | "summarize"
  | "suggest_category"
  | "suggest_tags"
  | "detect_missing"
  | "extract_variables"
  | "explain";

interface AiActionConfig {
  action: AiAction;
  label: string;
  icon: typeof Sparkles;
  shortHint?: string;
}

const CATALOG: Record<AiAction, AiActionConfig> = {
  correct:           { action: "correct",           label: "Corriger",         icon: Wand2,        shortHint: "Fautes & style" },
  rewrite:           { action: "rewrite",           label: "Reformuler",       icon: Sparkles,     shortHint: "Version professionnelle" },
  restructure:       { action: "restructure",       label: "Restructurer",     icon: ListTree,     shortHint: "Sections claires" },
  summarize:         { action: "summarize",         label: "Résumer",          icon: FileText,     shortHint: "3 lignes" },
  suggest_category:  { action: "suggest_category",  label: "Catégoriser",      icon: Tag,          shortHint: "Suggestion IA" },
  suggest_tags:      { action: "suggest_tags",      label: "Tags",             icon: Tag,          shortHint: "3 à 6 tags" },
  detect_missing:    { action: "detect_missing",    label: "Info manquante",   icon: AlertCircle,  shortHint: "Points à compléter" },
  extract_variables: { action: "extract_variables", label: "Variables",        icon: Sparkles,     shortHint: "Détecter {{var}}" },
  explain:           { action: "explain",           label: "Expliquer simple", icon: Languages,    shortHint: "Langage clair" },
};

interface Props {
  actions: AiAction[];
  onRun: (action: AiAction) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function AiActionsBar({ actions, onRun, disabled, className }: Props) {
  const [running, setRunning] = useState<AiAction | null>(null);
  async function handle(action: AiAction) {
    if (running || disabled) return;
    setRunning(action);
    try { await onRun(action); } finally { setRunning(null); }
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" strokeWidth={2} />
        Actions IA
      </span>
      {actions.map((a) => {
        const cfg = CATALOG[a];
        const Icon = cfg.icon;
        const isRunning = running === a;
        return (
          <button
            key={a}
            type="button"
            disabled={disabled || !!running}
            onClick={() => handle(a)}
            title={cfg.shortHint}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset transition-colors",
              "bg-white text-slate-700 ring-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:ring-violet-200",
              (disabled || running) && "opacity-60 cursor-not-allowed hover:bg-white hover:text-slate-700 hover:ring-slate-200",
              isRunning && "bg-violet-50 text-violet-700 ring-violet-300",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isRunning && "animate-pulse")} strokeWidth={2} />
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
