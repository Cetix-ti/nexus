"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Monitor,
  Server,
  Laptop,
  HardDrive,
  Search,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface PortalAsset {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  ipAddress: string | null;
  siteName: string | null;
  assignedContact: { id: string; name: string; email: string } | null;
  externalSource: string | null;
}

const TYPE_ICONS: Record<string, any> = {
  WORKSTATION: Monitor,
  LAPTOP: Laptop,
  SERVER: Server,
  VIRTUAL_MACHINE: Server,
};

const STATUS_VARIANTS: Record<string, "success" | "default" | "warning" | "danger"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  MAINTENANCE: "warning",
  RETIRED: "danger",
};

export default function PortalAssetsPage() {
  const { permissions, organizationName } = usePortalUser();
  const [assets, setAssets] = useState<PortalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/v1/portal/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setAssets(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = assets.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.name, a.manufacturer, a.model, a.ipAddress, a.serialNumber, a.assignedContact?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mes actifs</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          {permissions.canSeeAllOrgAssets
            ? `Tous les actifs de ${organizationName}`
            : "Équipements qui vous sont assignés"}
        </p>
      </div>

      <Input
        placeholder="Rechercher par nom, IP, modèle..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        iconLeft={<Search className="h-4 w-4" />}
      />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-[13px] text-slate-400">
            <Monitor className="h-10 w-10 mx-auto mb-2" strokeWidth={1.5} />
            {assets.length === 0
              ? "Aucun actif assigné."
              : "Aucun résultat pour cette recherche."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const Icon = TYPE_ICONS[a.type] || HardDrive;
            return (
              <Link key={a.id} href={`/portal/assets/${a.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 truncate font-mono">
                          {a.name}
                        </p>
                        {a.manufacturer && (
                          <p className="text-[11px] text-slate-400 truncate">
                            {a.manufacturer} {a.model}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={STATUS_VARIANTS[a.status] ?? "default"}
                        className="text-[10px] shrink-0"
                      >
                        {a.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11.5px] text-slate-500">
                      {a.ipAddress && (
                        <span className="font-mono">{a.ipAddress}</span>
                      )}
                      {a.siteName && <span>{a.siteName}</span>}
                    </div>
                    {a.assignedContact && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <User className="h-3 w-3" />
                        {a.assignedContact.name}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
