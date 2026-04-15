"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  progressPercent: number;
  managerName: string;
  targetEndDate: string | null;
  isInternal?: boolean;
}

export default function InternalProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/v1/projects?internal=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setProjects(d.data ?? d ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
            Projets internes
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Projets administratifs et stratégiques de Cetix — séparés des projets clients.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Nouveau projet interne
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900">Aucun projet interne</h3>
            <p className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto">
              Utilise le bouton « Nouveau projet interne » pour créer un chantier administratif Cetix.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-400">{p.code}</span>
                    <Badge variant={p.status === "active" ? "primary" : p.status === "completed" ? "success" : "default"} className="text-[9.5px]">
                      {p.status}
                    </Badge>
                  </div>
                  <h3 className="mt-1 text-[14px] font-semibold text-slate-900 truncate">{p.name}</h3>
                  <p className="mt-1 text-[11.5px] text-slate-500 line-clamp-2">{p.description}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{p.managerName}</span>
                    <span className="tabular-nums">{p.progressPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, p.progressPercent)}%` }} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <QuickInternalProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.push(`/projects/${id}`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal rapide de création de projet interne — minimum de champs pour
// bootstrapper ; on édite les détails ensuite via la page projet complète.
// ---------------------------------------------------------------------------
function QuickInternalProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOrgId, setInternalOrgId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/organizations?internal=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ id: string; isInternal?: boolean }>) => {
        const list = Array.isArray(arr) ? arr : [];
        const internal = list.find((o) => o.isInternal) ?? list[0];
        if (internal) setInternalOrgId(internal.id);
      })
      .catch(() => {});
  }, []);

  async function submit() {
    if (!name.trim()) return;
    if (!internalOrgId) {
      setError("Aucune organisation interne configurée.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description,
          organizationId: internalOrgId,
          type: "internal",
          status: "planning",
          startDate: new Date().toISOString().split("T")[0],
          isInternal: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Erreur ${res.status}`);
        return;
      }
      const data = await res.json();
      onCreated(data.data?.id ?? data.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md my-4 rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Nouveau projet interne</h2>
        </div>
        <div className="p-5 space-y-3">
          <Input
            label="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Refonte site Cetix, Migration Microsoft 365"
            autoFocus
          />
          <div>
            <label className="text-[11px] font-medium text-slate-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!name.trim()}>
            <Plus className="h-3.5 w-3.5" />
            Créer
          </Button>
        </div>
      </div>
    </div>
  );
}
