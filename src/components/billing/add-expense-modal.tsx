"use client";

import { useState } from "react";
import { X, Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPENSE_TYPE_LABELS,
  type ExpenseType,
  type ExpenseEntry,
} from "@/lib/billing/types";

interface AddExpenseModalProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  onSave: (entry: ExpenseEntry) => void;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseModal({
  open,
  onClose,
  ticketId,
  ticketNumber,
  organizationId,
  organizationName,
  onSave,
}: AddExpenseModalProps) {
  const [date, setDate] = useState(todayISODate());
  const [expenseType, setExpenseType] = useState<ExpenseType>("meal");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [isReimbursable, setReimb] = useState(true);
  const [isRebillable, setRebill] = useState(true);
  const [hasReceipt, setReceipt] = useState(false);
  const [notes, setNotes] = useState("");

  if (!open) return null;

  function reset() {
    setDate(todayISODate());
    setExpenseType("meal");
    setDescription("");
    setAmount(0);
    setReimb(true);
    setRebill(true);
    setReceipt(false);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entry: ExpenseEntry = {
      id: `ex_${Date.now()}`,
      ticketId,
      ticketNumber,
      organizationId,
      organizationName,
      agentId: "usr_current",
      agentName: "Jean-Philippe Côté",
      date: new Date(`${date}T00:00:00`).toISOString(),
      expenseType,
      description,
      amount,
      isReimbursable,
      isRebillable,
      hasReceipt,
      coverageStatus: isRebillable ? "billable" : "non_billable",
      coverageReason: isRebillable
        ? "Frais refacturable au client"
        : "Frais non refacturable",
      approvalStatus: "draft",
      notes,
      createdAt: new Date().toISOString(),
    };
    onSave(entry);
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60">
              <Receipt className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
                Ajouter une dépense
              </h2>
              <p className="text-[12.5px] text-slate-500">
                Ticket {ticketNumber} — {organizationName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
                Type de dépense
              </label>
              <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {EXPENSE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Souper équipe pendant intervention"
              required
            />
          </div>

          <div>
            <Input
              label="Montant ($)"
              type="number"
              min={0}
              step={0.01}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            {[
              { label: "Remboursable au technicien", value: isReimbursable, set: setReimb },
              { label: "Refacturable au client", value: isRebillable, set: setRebill },
              { label: "Reçu joint", value: hasReceipt, set: setReceipt },
            ].map((row) => (
              <label key={row.label} className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-[13px] text-slate-700">{row.label}</span>
                <Switch checked={row.value} onCheckedChange={row.set} />
              </label>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" disabled={!description.trim() || amount <= 0}>
              <Save className="h-4 w-4" strokeWidth={2.5} />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
