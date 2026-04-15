"use client";

import { useState, useEffect } from "react";
import { Camera, Pencil, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  EditSignatureModal,
  type SignatureAgent,
} from "@/components/settings/edit-signature-modal";

interface Agent extends SignatureAgent {
  roleBadge: "default" | "primary" | "success" | "warning" | "danger" | "outline";
}

const initialAgents: Agent[] = [
  {
    id: "a1",
    name: "Jean-Philippe Côté",
    email: "jp.cote@cetix.ca",
    role: "MSP_ADMIN",
    roleBadge: "danger",
    gradient: "from-blue-500 to-indigo-600",
    signature:
      "Jean-Philippe Côté\nDirecteur des opérations\nCetix MSP\njp.cote@cetix.ca\n514-555-1100",
  },
  {
    id: "a2",
    name: "Marie Tremblay",
    email: "marie@cetix.ca",
    role: "TECHNICIAN",
    roleBadge: "primary",
    gradient: "from-fuchsia-500 to-pink-600",
    signature:
      "Marie Tremblay\nTechnicienne Senior\nCetix MSP\nmarie@cetix.ca\n514-555-1234",
  },
  {
    id: "a3",
    name: "Alexandre Dubois",
    email: "alex.dubois@cetix.ca",
    role: "TECHNICIAN",
    roleBadge: "primary",
    gradient: "from-emerald-500 to-teal-600",
    signature:
      "Alexandre Dubois\nTechnicien réseau\nCetix MSP\nalex.dubois@cetix.ca\n514-555-1287",
  },
  {
    id: "a4",
    name: "Sophie Lavoie",
    email: "sophie.lavoie@cetix.ca",
    role: "SUPERVISOR",
    roleBadge: "warning",
    gradient: "from-amber-500 to-orange-600",
    signature:
      "Sophie Lavoie\nSuperviseure du support\nCetix MSP\nsophie.lavoie@cetix.ca\n514-555-1322",
  },
  {
    id: "a5",
    name: "Lucas Bergeron",
    email: "lucas.b@cetix.ca",
    role: "TECHNICIAN",
    roleBadge: "primary",
    gradient: "from-violet-500 to-purple-600",
    signature:
      "Lucas Bergeron\nTechnicien support N1\nCetix MSP\nlucas.b@cetix.ca\n514-555-1356",
  },
  {
    id: "a6",
    name: "Isabelle Côté",
    email: "isabelle.cote@cetix.ca",
    role: "CLIENT_ADMIN",
    roleBadge: "success",
    gradient: "from-cyan-500 to-sky-600",
    signature:
      "Isabelle Côté\nResponsable TI\nGroupe Bélanger Inc.\nisabelle.cote@belanger.ca\n450-555-9087",
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
}

const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-fuchsia-500 to-pink-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
  "from-rose-500 to-red-600",
  "from-lime-500 to-green-600",
];

function badgeForRole(role: string): Agent["roleBadge"] {
  if (role === "MSP_ADMIN" || role === "SUPER_ADMIN") return "danger";
  if (role === "SUPERVISOR") return "warning";
  if (role === "TECHNICIAN") return "primary";
  if (role === "CLIENT_ADMIN") return "success";
  return "default";
}

export function AgentProfilesSection() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  useEffect(() => {
    // includeSignature + includeAvatar so the modal pre-fills correctly.
    fetch("/api/v1/users?includeSignature=true&includeAvatar=true")
      .then((r) => r.json())
      .then((users) => {
        if (!Array.isArray(users) || users.length === 0) return;
        const mapped: Agent[] = users.map((u, i) => ({
          id: u.id,
          name: u.name || `${u.firstName} ${u.lastName}`,
          email: u.email,
          role: u.role,
          roleBadge: badgeForRole(u.role),
          gradient: GRADIENTS[i % GRADIENTS.length],
          avatar: u.avatar ?? null,
          signature: u.signature || `${u.name || `${u.firstName} ${u.lastName}`}\n${u.email}${u.phone ? `\n${u.phone}` : ""}`,
          signatureHtml: u.signatureHtml || null,
        }));
        setAgents(mapped);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  async function handleSave(id: string, patch: Partial<SignatureAgent>) {
    // Persist to DB
    const body: Record<string, unknown> = { id };
    if (patch.signature !== undefined) body.signature = patch.signature;
    if (patch.signatureHtml !== undefined) body.signatureHtml = patch.signatureHtml;
    if ((patch as any).avatar !== undefined) body.avatar = (patch as any).avatar;
    setSaveError(null);
    setSaveOk(null);
    try {
      const res = await fetch("/api/v1/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg =
          errJson.error ||
          (res.status === 403
            ? "Permissions insuffisantes pour modifier cet agent"
            : res.status === 400
            ? "Données invalides (signature trop longue ?)"
            : `Erreur ${res.status}`);
        setSaveError(msg);
        console.error("Signature save failed:", msg, errJson);
        return; // Do NOT optimistically update the UI if the save failed
      }
      const who = agents.find((a) => a.id === id);
      setSaveOk(`Signature enregistrée pour ${who?.name ?? "l'agent"}`);
      setTimeout(() => setSaveOk(null), 4000);
    } catch (e) {
      setSaveError("Erreur réseau");
      console.error("Signature save failed:", e);
      return;
    }
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Profils d&apos;agent
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Gérez les photos de profil et signatures électroniques de vos
          techniciens
        </p>
      </div>

      {saveError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          <strong>Erreur&nbsp;:</strong> {saveError}
        </div>
      ) : null}
      {saveOk ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
          {saveOk}
        </div>
      ) : null}

      <div className="space-y-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="card-hover">
            <CardContent className="p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                {/* Identity */}
                <div className="flex items-center gap-4 lg:w-72 shrink-0">
                  {agent.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={agent.avatar}
                      alt={agent.name}
                      className="h-14 w-14 rounded-2xl object-cover shadow-sm shrink-0 ring-2 ring-white"
                    />
                  ) : (
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${agent.gradient} text-white text-lg font-semibold shadow-sm shrink-0`}
                    >
                      {getInitials(agent.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-slate-900 truncate">
                      {agent.name}
                    </h3>
                    <div className="mt-1">
                      <Badge variant={agent.roleBadge} className="text-[10px]">
                        {agent.role}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-500 truncate flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {agent.email}
                    </p>
                  </div>
                </div>

                {/* Profile picture */}
                <div className="lg:w-64 shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Photo de profil
                  </p>
                  <div className="flex items-center gap-3">
                    {agent.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className="h-12 w-12 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                      />
                    ) : (
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${agent.gradient} text-white text-sm font-semibold shrink-0`}
                      >
                        {getInitials(agent.name)}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {agent.avatar
                        ? "Cliquez sur « Éditer » pour changer la photo"
                        : "Aucune photo — cliquez sur « Éditer » pour en ajouter une"}
                    </p>
                  </div>
                </div>

                {/* Signature */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Signature électronique
                  </p>
                  <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
                    {agent.signatureHtml ? (
                      <div
                        className="text-[12px] text-slate-700 leading-relaxed [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: agent.signatureHtml }}
                      />
                    ) : (
                      <pre className="font-sans text-[12px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {agent.signature}
                      </pre>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingAgent(agent)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Modifier la signature
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EditSignatureModal
        open={!!editingAgent}
        agent={editingAgent}
        onClose={() => setEditingAgent(null)}
        onSave={handleSave}
      />
    </div>
  );
}
