"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Agent {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
  role?: string;
}

interface Supervision {
  id: string;
  supervisorId: string;
  agentId: string;
  supervisor: Agent;
  agent: Agent;
}

export function SupervisionSection() {
  const [rows, setRows] = useState<Supervision[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [supervisorId, setSupervisorId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [supRes, usersRes] = await Promise.all([
      fetch("/api/v1/supervision?all=true"),
      fetch("/api/v1/users?role=SUPER_ADMIN,MSP_ADMIN,SUPERVISOR,TECHNICIAN"),
    ]);
    if (supRes.ok) {
      const d = await supRes.json();
      setRows(d.items || []);
    }
    if (usersRes.ok) {
      const users = (await usersRes.json()) as Agent[];
      setAgents(users.filter((u) => (u as { isActive?: boolean }).isActive !== false));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, { supervisor: Agent; agents: Supervision[] }>();
    for (const r of rows) {
      if (!map.has(r.supervisorId)) {
        map.set(r.supervisorId, { supervisor: r.supervisor, agents: [] });
      }
      map.get(r.supervisorId)!.agents.push(r);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.supervisor.lastName.localeCompare(b.supervisor.lastName, "fr-CA"),
    );
  }, [rows]);

  async function add() {
    if (!supervisorId || !agentId) return;
    setSaving(true);
    const res = await fetch("/api/v1/supervision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supervisorId, agentId }),
    });
    if (res.ok) {
      setAgentId("");
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Retirer cette relation de supervision ?")) return;
    await fetch(`/api/v1/supervision?id=${id}`, { method: "DELETE" });
    load();
  }

  const assignedAgentIds = new Set(rows.map((r) => r.agentId));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Users className="h-4.5 w-4.5 text-indigo-600" />
          Supervision d&apos;agents
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Assignez des agents sous la supervision d&apos;un responsable. Le superviseur
          aura accès à la page « Supervision » avec les métriques de ses agents.
        </p>
      </div>

      {/* Formulaire d'ajout */}
      <div className="flex items-end gap-3 flex-wrap rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
            Superviseur
          </label>
          <select
            value={supervisorId}
            onChange={(e) => setSupervisorId(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
          >
            <option value="">— Choisir —</option>
            {agents
              .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr-CA"))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                </option>
              ))}
          </select>
        </div>
        <div className="flex items-center text-slate-400 pb-1">
          <ArrowRight className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[12px] font-semibold text-slate-700 mb-1.5">
            Agent supervisé
          </label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] focus:border-blue-500 focus:outline-none"
          >
            <option value="">— Choisir —</option>
            {agents
              .filter((a) => a.id !== supervisorId)
              .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr-CA"))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                  {assignedAgentIds.has(a.id) ? " (déjà supervisé)" : ""}
                </option>
              ))}
          </select>
        </div>
        <Button size="sm" onClick={add} disabled={saving || !supervisorId || !agentId}>
          <Plus className="h-3.5 w-3.5" />
          {saving ? "Ajout…" : "Ajouter"}
        </Button>
      </div>

      {loading ? (
        <p className="text-[13px] text-slate-400">Chargement…</p>
      ) : grouped.length === 0 ? (
        <p className="text-[13px] text-slate-400 italic">Aucune relation de supervision configurée.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.supervisor.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/60 border-b border-slate-200">
                {g.supervisor.avatar ? (
                  <img src={g.supervisor.avatar} className="h-7 w-7 rounded-full object-cover" alt="" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-semibold">
                    {g.supervisor.firstName[0]}{g.supervisor.lastName[0]}
                  </div>
                )}
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">
                    {g.supervisor.firstName} {g.supervisor.lastName}
                  </p>
                  <p className="text-[11px] text-slate-500">{g.supervisor.email} · Superviseur</p>
                </div>
                <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-700">
                  {g.agents.length} agent{g.agents.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {g.agents.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/50">
                    {r.agent.avatar ? (
                      <img src={r.agent.avatar} className="h-6 w-6 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-semibold">
                        {r.agent.firstName[0]}{r.agent.lastName[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-slate-800 truncate">
                        {r.agent.firstName} {r.agent.lastName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{r.agent.email}</p>
                    </div>
                    <button
                      onClick={() => remove(r.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Retirer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
