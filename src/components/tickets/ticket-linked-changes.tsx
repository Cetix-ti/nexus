"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitCommit } from "lucide-react";
import { Card } from "@/components/ui/card";

interface LinkedChange {
  id: string; title: string; summary: string | null;
  category: string; impact: string; status: string;
  changeDate: string; publishedAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  AI_SUGGESTED: "Suggéré IA", IN_REVIEW: "En révision", APPROVED: "Approuvé",
  PUBLISHED: "Publié", REJECTED: "Rejeté", ARCHIVED: "Archivé",
};
const STATUS_COLOR: Record<string, string> = {
  AI_SUGGESTED: "bg-violet-50 text-violet-700 ring-violet-200",
  IN_REVIEW: "bg-slate-100 text-slate-700 ring-slate-200",
  APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PUBLISHED: "bg-blue-50 text-blue-700 ring-blue-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  ARCHIVED: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function TicketLinkedChanges({ ticketId }: { ticketId: string }) {
  const [items, setItems] = useState<LinkedChange[] | null>(null);

  useEffect(() => {
    void fetch(`/api/v1/tickets/${ticketId}/changes`).then(async (r) => {
      if (r.ok) setItems(await r.json());
      else setItems([]);
    });
  }, [ticketId]);

  if (items === null || items.length === 0) return null;

  return (
    <Card>
      <div className="p-4 space-y-2">
        <h3 className="text-[13px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
          <GitCommit className="h-4 w-4 text-blue-500" /> Changements liés ({items.length})
        </h3>
        <div className="space-y-1.5">
          {items.map((c) => (
            <Link key={c.id} href={`/changes/${c.id}`} className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:border-slate-300">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[13px] font-medium text-slate-900">{c.title}</span>
                <span className={`text-[10.5px] rounded px-1.5 py-0.5 ring-1 ring-inset ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              {c.summary && <p className="mt-0.5 text-[11.5px] text-slate-600">{c.summary}</p>}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
