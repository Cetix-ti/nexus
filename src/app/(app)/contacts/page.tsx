"use client";

import { useState, useMemo, useEffect } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Plus,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Star,
  Users,
  UserCheck,
  UserX,
  Crown,
  Pencil,
} from "lucide-react";
import { EditContactModal, type EditContactModalContact } from "@/components/contacts/edit-contact-modal";
import Link from "next/link";
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
import { PORTAL_ROLE_LABELS, type ClientPortalPermissions } from "@/lib/projects/types";

// Portal roles are determined from the portalEnabled field returned by the API

function portalRoleBadgeVariant(role?: ClientPortalPermissions["portalRole"]): "danger" | "warning" | "primary" | "default" {
  if (role === "admin") return "danger";
  if (role === "manager") return "warning";
  if (role === "viewer") return "primary";
  return "default";
}

// ---------- Types ----------
interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization: string;
  organizationId: string;
  jobTitle: string;
  vip: boolean;
  tickets: number;
  status: "Actif" | "Inactif";
  color: string;
}

// ---------- Sorting ----------
type SortKey = "name" | "email" | "organization" | "jobTitle" | "tickets" | "status";
type SortDir = "asc" | "desc";

// ---------- Component ----------
export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [vipFilter, setVipFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingContact, setEditingContact] = useState<EditContactModalContact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/contacts")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setContacts(data as Contact[]);
      })
      .catch((e) => console.error("Erreur de chargement des contacts", e))
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
    let result = [...contacts];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.organization.toLowerCase().includes(q) ||
          c.jobTitle.toLowerCase().includes(q) ||
          c.phone.includes(q)
      );
    }

    if (orgFilter !== "all") {
      result = result.filter((c) => c.organization === orgFilter);
    }

    if (vipFilter === "vip") {
      result = result.filter((c) => c.vip);
    } else if (vipFilter === "standard") {
      result = result.filter((c) => !c.vip);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "organization":
          cmp = a.organization.localeCompare(b.organization);
          break;
        case "jobTitle":
          cmp = a.jobTitle.localeCompare(b.jobTitle);
          break;
        case "tickets":
          cmp = a.tickets - b.tickets;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [contacts, search, orgFilter, vipFilter, sortKey, sortDir]);

  // Stats
  const totalContacts = contacts.length;
  const activeContacts = contacts.filter((c) => c.status === "Actif").length;
  const inactiveContacts = contacts.filter((c) => c.status === "Inactif").length;
  const vipContacts = contacts.filter((c) => c.vip).length;

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
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Contacts</h1>
          <span className="inline-flex h-7 items-center rounded-full bg-gray-100 px-2.5 text-sm font-medium text-gray-600">
            {filtered.length}
          </span>
        </div>
        <Button variant="primary" size="md">
          <Plus className="h-4 w-4" />
          Ajouter un contact
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Contacts totaux", value: totalContacts, icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "Actifs", value: activeContacts, icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
          { label: "Inactifs", value: inactiveContacts, icon: UserX, color: "text-gray-600 bg-gray-100" },
          { label: "VIP", value: vipContacts, icon: Crown, color: "text-amber-600 bg-amber-50" },
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
            placeholder="Rechercher un contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Organisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les organisations</SelectItem>
            {[...new Set(contacts.map((c) => c.organization))].sort().map((org) => (
              <SelectItem key={org} value={org}>
                {org}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vipFilter} onValueChange={setVipFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="VIP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="vip">VIP seulement</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!loaded ? (
        <PageLoader variant="table" rows={8} label="Chargement des contacts…" />
      ) : (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("name")}>
                    Nom complet <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("email")}>
                    Courriel <SortIcon col="email" />
                  </button>
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Téléphone</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("organization")}>
                    Organisation <SortIcon col="organization" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("jobTitle")}>
                    Poste <SortIcon col="jobTitle" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">VIP</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("tickets")}>
                    Tickets <SortIcon col="tickets" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  <button className="inline-flex items-center" onClick={() => handleSort("status")}>
                    Statut <SortIcon col="status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Permissions portail</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((contact) => (
                <tr
                  key={contact.id}
                  className="group transition-colors hover:bg-gray-50/80"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                          contact.color
                        )}
                      >
                        {contact.firstName.charAt(0)}{contact.lastName.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">
                        {contact.firstName} {contact.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{contact.email}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-600">{contact.phone}</td>
                  <td className="px-4 py-3">
                    <Link href={`/organizations/${contact.organizationId}`} className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
                      {contact.organization}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{contact.jobTitle}</td>
                  <td className="px-4 py-3 text-center">
                    {contact.vip && (
                      <Star className="inline h-4 w-4 text-amber-500 fill-amber-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-medium text-gray-700">
                      {contact.tickets}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={contact.status === "Actif" ? "success" : "danger"}>
                      {contact.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {(contact as any).portalEnabled ? (
                      <Badge variant="primary">Portail actif</Badge>
                    ) : (
                      <Badge variant="default">Pas d&apos;accès</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditingContact({
                          id: contact.id,
                          name: `${contact.firstName} ${contact.lastName}`,
                          email: contact.email,
                          phone: contact.phone,
                          organization: contact.organization,
                          organizationId: contact.organizationId,
                          jobTitle: contact.jobTitle,
                          isVIP: contact.vip,
                        })
                      }
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    Aucun contact trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <EditContactModal
        open={!!editingContact}
        onClose={() => setEditingContact(null)}
        contact={editingContact}
      />
    </div>
  );
}
