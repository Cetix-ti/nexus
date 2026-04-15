"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/projects?internal=true")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setProjects(d.data ?? d ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-slate-900">
          Projets internes
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Projets administratifs et stratégiques de Cetix — séparés des projets clients.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900">Aucun projet interne</h3>
            <p className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto">
              Crée un projet depuis <Link href="/projects" className="text-blue-600 underline">la page Projets</Link> puis active la case &quot;Projet interne&quot;, ou crée-le depuis le calendrier.
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
    </div>
  );
}
