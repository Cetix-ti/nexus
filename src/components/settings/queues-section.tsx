"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Inbox, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Queue {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  assignedAgents: number;
  openTickets: number;
  isDefault: boolean;
  isActive: boolean;
}

const initialQueues: Queue[] = [
  {
    id: "q1",
    name: "Support général",
    description: "File d'attente par défaut pour les demandes courantes",
    color: "#3B82F6",
    icon: "📨",
    assignedAgents: 4,
    openTickets: 28,
    isDefault: true,
    isActive: true,
  },
  {
    id: "q2",
    name: "Réseau & Infrastructure",
    description: "Problèmes réseau, VPN, pare-feu, switches",
    color: "#10B981",
    icon: "🌐",
    assignedAgents: 2,
    openTickets: 12,
    isDefault: false,
    isActive: true,
  },
  {
    id: "q3",
    name: "Sécurité",
    description: "Incidents de sécurité et menaces",
    color: "#DC2626",
    icon: "🛡️",
    assignedAgents: 2,
    openTickets: 5,
    isDefault: false,
    isActive: true,
  },
  {
    id: "q4",
    name: "Infrastructure Cloud",
    description: "Azure, AWS, GCP, services cloud",
    color: "#8B5CF6",
    icon: "☁️",
    assignedAgents: 3,
    openTickets: 18,
    isDefault: false,
    isActive: true,
  },
  {
    id: "q5",
    name: "Demandes de service",
    description: "Provisioning, comptes, accès, équipement",
    color: "#F59E0B",
    icon: "📋",
    assignedAgents: 3,
    openTickets: 24,
    isDefault: false,
    isActive: true,
  },
  {
    id: "q6",
    name: "Projets",
    description: "Tickets liés aux projets clients",
    color: "#06B6D4",
    icon: "🎯",
    assignedAgents: 5,
    openTickets: 9,
    isDefault: false,
    isActive: true,
  },
];

export function QueuesSection() {
  const [queues, setQueues] = useState<Queue[]>(initialQueues);

  function toggleActive(id: string) {
    setQueues((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isActive: !q.isActive } : q))
    );
  }

  function deleteQueue(id: string) {
    setQueues((prev) => prev.filter((q) => q.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Files d&apos;attente
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Organisez les tickets par équipe ou domaine d&apos;expertise
          </p>
        </div>
        <Button variant="primary" size="md">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Nouvelle file d&apos;attente
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q) => (
          <Card key={q.id} className="group relative card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-xl shrink-0 ring-1 ring-inset"
                    style={{
                      backgroundColor: q.color + "12",
                      boxShadow: `inset 0 0 0 1px ${q.color}30`,
                    }}
                  >
                    {q.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[14px] text-slate-900 truncate flex items-center gap-1.5">
                      {q.name}
                      {q.isDefault && (
                        <Badge variant="primary" className="h-4 px-1.5 text-[10px]">
                          Défaut
                        </Badge>
                      )}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-slate-500 line-clamp-2">
                      {q.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/60 hover:text-slate-900">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!q.isDefault && (
                    <button
                      onClick={() => deleteQueue(q.id)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Inbox className="h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Tickets ouverts
                    </p>
                    <p className="text-[15px] font-semibold text-slate-900 tabular-nums">
                      {q.openTickets}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                      Agents
                    </p>
                    <p className="text-[15px] font-semibold text-slate-900 tabular-nums">
                      {q.assignedAgents}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">État</span>
                <button
                  onClick={() => toggleActive(q.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    q.isActive ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      q.isActive ? "translate-x-[18px]" : "translate-x-0.5"
                    } translate-y-0.5`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
