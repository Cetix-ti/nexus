"use client";

import { useState, useMemo, useEffect } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import Link from "next/link";
import {
  Plus,
  Search,
  Server,
  Laptop,
  Monitor,
  Printer,
  Smartphone,
  Network,
  Cloud,
  Box,
  Cpu,
  MemoryStick,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  PackageCheck,
  Wrench,
  PackageX,
  AlertTriangle,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ManageAssetCategoriesModal } from "@/components/assets/manage-asset-categories-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AssetType =
  | "workstation"
  | "laptop"
  | "server"
  | "network"
  | "printer"
  | "mobile"
  | "software"
  | "vm"
  | "cloud";

type AssetStatus = "active" | "inactive" | "maintenance" | "retired";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  organization: string;
  site: string;
  serial: string;
  ip: string;
  status: AssetStatus;
  warranty: string;
  manufacturer: string;
  model: string;
  cpuModel: string | null;
  ramGb: number | null;
}

const TYPE_CONFIG: Record<
  AssetType,
  { label: string; icon: React.ElementType; color: string }
> = {
  workstation: { label: "Poste de travail", icon: Monitor, color: "text-blue-600" },
  laptop: { label: "Ordinateur portable", icon: Laptop, color: "text-indigo-600" },
  server: { label: "Serveur", icon: Server, color: "text-purple-600" },
  network: { label: "Réseau", icon: Network, color: "text-teal-600" },
  printer: { label: "Imprimante", icon: Printer, color: "text-orange-600" },
  mobile: { label: "Mobile", icon: Smartphone, color: "text-pink-600" },
  software: { label: "Logiciel", icon: Box, color: "text-green-600" },
  vm: { label: "VM", icon: Cpu, color: "text-cyan-600" },
  cloud: { label: "Cloud", icon: Cloud, color: "text-sky-600" },
};

const STATUS_CONFIG: Record<
  AssetStatus,
  { label: string; variant: "success" | "default" | "warning" | "danger" }
> = {
  active: { label: "Actif", variant: "success" },
  inactive: { label: "Inactif", variant: "default" },
  maintenance: { label: "Maintenance", variant: "warning" },
  retired: { label: "Retiré", variant: "danger" },
};

function isWarrantyExpired(date: string): boolean {
  if (date === "—") return false;
  return new Date(date) < new Date();
}

function isWarrantyExpiringSoon(date: string): boolean {
  if (date === "—") return false;
  const warrantyDate = new Date(date);
  const now = new Date();
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  return warrantyDate >= now && warrantyDate <= threeMonths;
}

export default function AssetsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/assets")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setAssets(data as Asset[]);
      })
      .catch((e) => console.error("Erreur de chargement des actifs", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orgOptions = useMemo(
    () => Array.from(new Set(assets.map((a) => a.organization))).sort(),
    [assets]
  );

  const filtered = useMemo(() => {
    let result = [...assets];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.serial.toLowerCase().includes(q) ||
          a.ip.toLowerCase().includes(q) ||
          a.organization.toLowerCase().includes(q) ||
          a.manufacturer.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((a) => a.type === typeFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    if (orgFilter !== "all") {
      result = result.filter((a) => a.organization === orgFilter);
    }

    return result;
  }, [assets, search, typeFilter, statusFilter, orgFilter]);

  const stats = useMemo(() => {
    return {
      total: assets.length,
      active: assets.filter((a) => a.status === "active").length,
      maintenance: assets.filter((a) => a.status === "maintenance").length,
      retired: assets.filter((a) => a.status === "retired").length,
    };
  }, [assets]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Actifs</h1>
          <span className="inline-flex h-7 items-center rounded-full bg-neutral-100 px-2.5 text-sm font-medium text-neutral-600">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => setManageCategoriesOpen(true)}
          >
            <Boxes className="h-4 w-4" />
            Gérer les catégories
          </Button>
          <Button variant="primary" size="md">
            <Plus className="h-4 w-4" />
            Ajouter un actif
          </Button>
        </div>
      </div>

      <ManageAssetCategoriesModal
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Box className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Actifs</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Actifs Actifs</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Wrench className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">En maintenance</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.maintenance}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
              <PackageX className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Retirés</p>
              <p className="text-xl sm:text-2xl font-bold text-neutral-900">{stats.retired}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Rechercher un actif..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="workstation">Poste de travail</SelectItem>
            <SelectItem value="laptop">Ordinateur portable</SelectItem>
            <SelectItem value="server">Serveur</SelectItem>
            <SelectItem value="network">Réseau</SelectItem>
            <SelectItem value="printer">Imprimante</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="software">Logiciel</SelectItem>
            <SelectItem value="vm">VM</SelectItem>
            <SelectItem value="cloud">Cloud</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="inactive">Inactif</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="retired">Retiré</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les organisations</SelectItem>
            {orgOptions.map((org) => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!loaded ? (
        <PageLoader variant="table" rows={8} label="Chargement des actifs…" />
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Nom
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Organisation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Site
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  N° de série
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Adresse IP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  CPU
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  RAM
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Garantie
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((asset) => {
                const typeConf = TYPE_CONFIG[asset.type];
                const statusConf = STATUS_CONFIG[asset.status];
                const TypeIcon = typeConf.icon;
                const expired = isWarrantyExpired(asset.warranty);
                const expiringSoon = isWarrantyExpiringSoon(asset.warranty);

                return (
                  <tr
                    key={asset.id}
                    className="transition-colors hover:bg-neutral-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/assets/${asset.id}`}
                        className="font-medium text-neutral-900 hover:text-blue-600"
                      >
                        {asset.name}
                      </Link>
                      <p className="text-xs text-neutral-500">
                        {asset.manufacturer} {asset.model}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon
                          className={cn("h-4 w-4", typeConf.color)}
                        />
                        <span className="text-sm text-neutral-700">
                          {typeConf.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      {asset.organization}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      {asset.site}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                        {asset.serial}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                        {asset.ip}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      {asset.cpuModel ? (
                        <div className="flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="text-xs text-neutral-700 max-w-[180px] truncate" title={asset.cpuModel}>
                            {asset.cpuModel}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {asset.ramGb ? (
                        <div className="flex items-center gap-1.5">
                          <MemoryStick className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="text-xs font-medium text-neutral-700">{asset.ramGb} Go</span>
                        </div>
                      ) : (
                        <span className="text-sm text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusConf.variant}>
                        {statusConf.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {asset.warranty === "—" ? (
                        <span className="text-sm text-neutral-400">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-sm",
                              expired
                                ? "font-medium text-red-600"
                                : expiringSoon
                                  ? "font-medium text-amber-600"
                                  : "text-neutral-700"
                            )}
                          >
                            {new Date(asset.warranty).toLocaleDateString("fr-CA")}
                          </span>
                          {expired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          )}
                          {expiringSoon && !expired && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() =>
                            setOpenMenu(
                              openMenu === asset.id ? null : asset.id
                            )
                          }
                          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenu === asset.id && (
                          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                            <Link
                              href={`/assets/${asset.id}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                            >
                              <Eye className="h-4 w-4" />
                              Voir
                            </Link>
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
                              <Pencil className="h-4 w-4" />
                              Modifier
                            </button>
                            <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Box className="h-10 w-10 text-neutral-300" />
              <p className="mt-3 text-sm text-neutral-500">
                Aucun actif trouvé
              </p>
            </div>
          )}
        </div>
      </Card>
      )}
    </div>
  );
}
