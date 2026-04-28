"use client";

import { useState, useMemo, useEffect } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import Link from "next/link";
import {
  Plus,
  Search,
  Building2,
  FileText,
  MapPin,
  Users,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { EditOrgModal, type EditOrgModalOrg } from "@/components/organizations/edit-org-modal";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CONTRACT_TYPE_LABELS, type ContractType } from "@/lib/billing/types";

// ---------- Types ----------
interface Organization {
  id: string;
  name: string;
  slug: string;
  billingMode: ContractType;
  sites: number;
  contacts: number;
  openTickets: number;
  contractStatus: "Actif" | "Expiré" | "En attente";
  createdAt: string;
  color: string;
  domain: string;
  phone: string;
  logo?: string | null;
}

// ---------- Helpers ----------
const billingModeBadgeVariant = (mode: ContractType): "default" | "primary" | "success" | "warning" | "danger" | "outline" => {
  switch (mode) {
    case "msp_monthly":
      return "primary";
    case "hour_bank":
      return "warning";
    case "ftig":
      return "primary";
    case "time_and_materials":
      return "default";
    case "prepaid_block":
      return "success";
    case "hybrid":
      return "outline";
  }
};

const contractBadgeVariant = (status: Organization["contractStatus"]) => {
  switch (status) {
    case "Actif":
      return "success" as const;
    case "Expiré":
      return "danger" as const;
    case "En attente":
      return "warning" as const;
  }
};

type SortKey = "name" | "billingMode" | "sites" | "contacts" | "openTickets";
type SortDir = "asc" | "desc";

// ---------- Component ----------
export default function OrganizationsPage() {
  const [search, setSearch] = useState("");
  const [billingModeFilter, setBillingModeFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingOrg, setEditingOrg] = useState<EditOrgModalOrg | null>(null);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/organizations")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setOrganizations(data as Organization[]);
        }
      })
      .catch((e) => console.error("Erreur de chargement des organisations", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let result = [...organizations];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.slug.toLowerCase().includes(q) ||
          o.domain.toLowerCase().includes(q)
      );
    }

    if (billingModeFilter !== "all") {
      result = result.filter((o) => o.billingMode === billingModeFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "billingMode":
          cmp = a.billingMode.localeCompare(b.billingMode);
          break;
        case "sites":
          cmp = a.sites - b.sites;
          break;
        case "contacts":
          cmp = a.contacts - b.contacts;
          break;
        case "openTickets":
          cmp = a.openTickets - b.openTickets;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [organizations, search, billingModeFilter, sortKey, sortDir]);

  // Stats
  const totalOrgs = organizations.length;
  const activeContracts = organizations.filter((o) => o.contractStatus === "Actif").length;
  const totalSites = organizations.reduce((sum, o) => sum + o.sites, 0);
  const totalContacts = organizations.reduce((sum, o) => sum + o.contacts, 0);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-gray-400" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 text-blue-600" />
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Organisations</h1>
          <span className="inline-flex h-7 items-center rounded-full bg-gray-100 px-2.5 text-sm font-medium text-gray-600">
            {filtered.length}
          </span>
        </div>
        <Button variant="primary" size="md" onClick={() => setCreatingOrg(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Ajouter une organisation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Organisations totales", value: totalOrgs, icon: Building2, color: "text-blue-600 bg-blue-50" },
          { label: "Contrats actifs", value: activeContracts, icon: FileText, color: "text-emerald-600 bg-emerald-50" },
          { label: "Sites totaux", value: totalSites, icon: MapPin, color: "text-violet-600 bg-violet-50" },
          { label: "Contacts totaux", value: totalContacts, icon: Users, color: "text-amber-600 bg-amber-50" },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4 p-5">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", stat.color)}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Rechercher une organisation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <Select value={billingModeFilter} onValueChange={setBillingModeFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Mode de facturation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modes</SelectItem>
            {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!loaded ? (
        <PageLoader variant="table" rows={8} label="Chargement des organisations…" />
      ) : (
      <>
      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-gray-400">Aucune organisation trouvée.</Card>
        ) : (
          filtered.map((org) => (
            <Link key={org.id} href={`/organisations/${encodeURIComponent(org.slug || org.name)}`}>
              <Card className="p-3.5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  {org.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={org.logo} alt={org.name} className="h-11 w-11 shrink-0 rounded-lg object-contain bg-white ring-1 ring-slate-200" />
                  ) : (
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white", org.color)}>
                      {org.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{org.name}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={billingModeBadgeVariant(org.billingMode)} className="text-[10px]">
                        {CONTRACT_TYPE_LABELS[org.billingMode]}
                      </Badge>
                      <Badge variant={contractBadgeVariant(org.contractStatus)} className="text-[10px]">
                        {org.contractStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                      <span>{org.contacts} contact{org.contacts > 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{org.sites} site{org.sites > 1 ? "s" : ""}</span>
                      {org.openTickets > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-blue-600 font-medium">{org.openTickets} billet{org.openTickets > 1 ? "s" : ""}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-3 lg:px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("name")}>
                    Nom <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-3 lg:px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("billingMode")}>
                    Facturation <SortIcon col="billingMode" />
                  </button>
                </th>
                <th className="hidden md:table-cell px-3 lg:px-4 py-3 text-center font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("sites")}>
                    Sites <SortIcon col="sites" />
                  </button>
                </th>
                <th className="hidden md:table-cell px-3 lg:px-4 py-3 text-center font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("contacts")}>
                    Contacts <SortIcon col="contacts" />
                  </button>
                </th>
                <th className="px-3 lg:px-4 py-3 text-center font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("openTickets")}>
                    Tickets <SortIcon col="openTickets" />
                  </button>
                </th>
                <th className="hidden lg:table-cell px-3 lg:px-4 py-3 text-left font-medium text-gray-500">Contrat</th>
                <th className="px-3 lg:px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="group transition-colors hover:bg-gray-50/80"
                >
                  <td className="px-3 lg:px-4 py-3">
                    <Link
                      href={`/organisations/${encodeURIComponent(org.slug || org.name)}`}
                      className="flex items-center gap-3"
                    >
                      {org.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={org.logo}
                          alt={org.name}
                          className="h-9 w-9 shrink-0 rounded-lg object-contain bg-white ring-1 ring-slate-200"
                        />
                      ) : (
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white",
                            org.color
                          )}
                        >
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                        {org.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 lg:px-4 py-3">
                    <Badge variant={billingModeBadgeVariant(org.billingMode)}>
                      {CONTRACT_TYPE_LABELS[org.billingMode]}
                    </Badge>
                  </td>
                  <td className="hidden md:table-cell px-3 lg:px-4 py-3 text-center text-gray-700">{org.sites}</td>
                  <td className="hidden md:table-cell px-3 lg:px-4 py-3 text-center text-gray-700">{org.contacts}</td>
                  <td className="px-3 lg:px-4 py-3 text-center text-gray-700">{org.openTickets}</td>
                  <td className="hidden lg:table-cell px-3 lg:px-4 py-3">
                    <Badge variant={contractBadgeVariant(org.contractStatus)}>
                      {org.contractStatus}
                    </Badge>
                  </td>
                  <td className="px-3 lg:px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditingOrg({
                            id: org.id,
                            name: org.name,
                            slug: org.slug,
                            plan: "Standard",
                            domain: org.domain,
                            isActive: org.contractStatus === "Actif",
                          })
                        }
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Supprimer « ${org.name} » ?\n\nCette action supprimera l'organisation et toutes ses données associées. Cette action est irréversible.`)) return;
                          try {
                            const res = await fetch(`/api/v1/organizations/${org.id}`, { method: "DELETE" });
                            if (res.ok) {
                              setOrganizations((prev) => prev.filter((o) => o.id !== org.id));
                            } else {
                              const data = await res.json().catch(() => ({}));
                              alert(data.error || "Erreur lors de la suppression");
                            }
                          } catch {
                            alert("Erreur réseau");
                          }
                        }}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Aucune organisation trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}

      <EditOrgModal
        open={!!editingOrg}
        onClose={() => setEditingOrg(null)}
        org={editingOrg}
      />

      <EditOrgModal
        open={creatingOrg}
        onClose={() => setCreatingOrg(false)}
        org={null}
      />
    </div>
  );
}
