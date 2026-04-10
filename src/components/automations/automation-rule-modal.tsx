"use client";

import { useState, useEffect } from "react";
import { X, Zap, Clock, ArrowRightLeft, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  triggerIcon: React.ElementType;
  conditions: string;
  actions: string;
  active: boolean;
  executions: number;
  lastExecuted: string;
}

const TRIGGERS: { value: string; icon: React.ElementType }[] = [
  { value: "Quand un ticket est créé", icon: Zap },
  { value: "Quand le statut change", icon: ArrowRightLeft },
  { value: "Quand le SLA est dépassé", icon: Clock },
  { value: "Quand le SLA est à 80%", icon: ShieldAlert },
  { value: "Quand un commentaire est ajouté", icon: Mail },
  { value: "Quand une organisation est créée", icon: Mail },
  { value: "Planifié - Chaque jour à 8h00", icon: Clock },
];

interface Props {
  open: boolean;
  rule: AutomationRule | null;
  onClose: () => void;
  onSave: (r: AutomationRule) => void;
}

export function AutomationRuleModal({ open, rule, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState(TRIGGERS[0].value);
  const [conditions, setConditions] = useState("");
  const [actions, setActions] = useState("");

  useEffect(() => {
    if (open) {
      setName(rule?.name || "");
      setDescription(rule?.description || "");
      setTrigger(rule?.trigger || TRIGGERS[0].value);
      setConditions(rule?.conditions || "");
      setActions(rule?.actions || "");
    }
  }, [open, rule]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave() {
    if (!name.trim()) return;
    const triggerDef = TRIGGERS.find((t) => t.value === trigger) || TRIGGERS[0];
    onSave({
      id: rule?.id || `rule_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      trigger,
      triggerIcon: triggerDef.icon,
      conditions: conditions.trim(),
      actions: actions.trim(),
      active: rule?.active ?? true,
      executions: rule?.executions ?? 0,
      lastExecuted: rule?.lastExecuted ?? "Jamais exécutée",
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl my-4 rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-32px)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 ring-1 ring-inset ring-emerald-200/60 shrink-0">
              <Zap className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                {rule ? "Modifier la règle d'automatisation" : "Nouvelle règle d'automatisation"}
              </h2>
              <p className="text-[12.5px] text-slate-500 truncate">
                Définissez le déclencheur, les conditions et les actions
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

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Input
            label="Nom de la règle"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Assignation auto - Tickets critiques"
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="À quoi sert cette règle ?"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Déclencheur (Quand...)
            </label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Conditions (Si...)
            </label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={2}
              placeholder="Priorité = Critique ET Catégorie = Sécurité"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Une condition par phrase, séparées par ET / OU. L&apos;éditeur visuel
              avancé sera disponible dans une prochaine itération.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Actions (Alors...)
            </label>
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              rows={3}
              placeholder="Assigner à Marie Tremblay, Notifier #urgences, Ajouter tag #incident"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Séparez les actions par des virgules.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {rule ? "Enregistrer" : "Créer la règle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
