"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ShieldCheck,
  Pencil,
  Eye,
  Ticket as TicketIcon,
  FolderKanban,
  BarChart3,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PORTAL_ROLE_LABELS, type ClientPortalPermissions } from "@/lib/projects/types";
import {
  EditPortalAccessModal,
  type PortalAccessUser,
} from "@/components/portal/edit-portal-access-modal";
import { useRouter } from "next/navigation";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";
import { PORTAL_ORGS } from "@/lib/portal/org-resolver";
import {
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
} from "@/lib/projects/types";

const ORGANIZATIONS = [
  "Cetix",
  "Acme Corp",
  "TechStart Inc",
  "Global Finance",
  "HealthCare Plus",
  "MédiaCentre QC",
];

interface PortalUser {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: ClientPortalPermissions["portalRole"];
  canSeeAllTickets: boolean;
  canSeeProjects: boolean;
  canSeeReports: boolean;
  canSeeTeam: boolean;
  lastLogin: string;
}

const initialPortalUsers: PortalUser[] = [
  { id: "pu1", name: "Marc Tremblay", email: "marc.tremblay@cetix.ca", organization: "Cetix", role: "admin", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Aujourd'hui, 09:42" },
  { id: "pu2", name: "Sophie Gagnon", email: "sophie.gagnon@cetix.ca", organization: "Cetix", role: "manager", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Hier, 16:10" },
  { id: "pu3", name: "Julien Lavoie", email: "julien.lavoie@cetix.ca", organization: "Cetix", role: "viewer", canSeeAllTickets: false, canSeeProjects: false, canSeeReports: false, canSeeTeam: false, lastLogin: "Il y a 3 jours" },
  { id: "pu4", name: "James Wilson", email: "j.wilson@acmecorp.com", organization: "Acme Corp", role: "admin", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Aujourd'hui, 08:01" },
  { id: "pu5", name: "Sarah Chen", email: "s.chen@acmecorp.com", organization: "Acme Corp", role: "manager", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Hier, 11:30" },
  { id: "pu6", name: "David Kumar", email: "d.kumar@acmecorp.com", organization: "Acme Corp", role: "viewer", canSeeAllTickets: false, canSeeProjects: false, canSeeReports: false, canSeeTeam: false, lastLogin: "Il y a 8 jours" },
  { id: "pu7", name: "Émile Bouchard", email: "e.bouchard@techstart.io", organization: "TechStart Inc", role: "admin", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Aujourd'hui, 10:25" },
  { id: "pu8", name: "Nathalie Bergeron", email: "n.bergeron@globalfinance.ca", organization: "Global Finance", role: "admin", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: true, canSeeTeam: true, lastLogin: "Aujourd'hui, 07:55" },
  { id: "pu9", name: "Pierre Dufour", email: "p.dufour@globalfinance.ca", organization: "Global Finance", role: "manager", canSeeAllTickets: true, canSeeProjects: true, canSeeReports: false, canSeeTeam: true, lastLogin: "Hier, 14:02" },
  { id: "pu10", name: "Catherine Leblanc", email: "c.leblanc@healthcareplus.ca", organization: "HealthCare Plus", role: "viewer", canSeeAllTickets: false, canSeeProjects: false, canSeeReports: false, canSeeTeam: false, lastLogin: "Il y a 21 jours" },
];

function roleVariant(role: ClientPortalPermissions["portalRole"]): "danger" | "warning" | "primary" {
  if (role === "admin") return "danger";
  if (role === "manager") return "warning";
  return "primary";
}

export function PortalAccessSection() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [users, setUsers] = useState<PortalUser[]>(initialPortalUsers);
  const [editing, setEditing] = useState<PortalAccessUser | null>(null);
  const router = useRouter();
  const startImpersonation = usePortalImpersonation((s) => s.startImpersonation);

  function impersonate(u: PortalUser) {
    const matchedOrg =
      PORTAL_ORGS.find(
        (o) =>
          o.name.toLowerCase() === u.organization.toLowerCase() ||
          u.email.toLowerCase().endsWith("@" + o.emailDomains[0])
      ) || PORTAL_ORGS[0];
    const basePerms =
      u.role === "admin"
        ? DEFAULT_ADMIN_PERMISSIONS
        : u.role === "manager"
        ? DEFAULT_MANAGER_PERMISSIONS
        : DEFAULT_VIEWER_PERMISSIONS;
    startImpersonation({
      userId: u.id,
      name: u.name,
      email: u.email,
      organizationId: matchedOrg.id,
      organizationName: u.organization,
      role: u.role,
      permissions: {
        ...basePerms,
        canSeeAllOrganizationTickets: u.canSeeAllTickets,
        canSeeProjects: u.canSeeProjects,
        canSeeReports: u.canSeeReports,
        canSeeTeamMembers: u.canSeeTeam,
        portalRole: u.role,
      },
      startedByName: "Admin",
      startedAt: new Date().toISOString(),
    });
    router.push("/portal");
  }

  function handleSave(
    id: string,
    patch: Partial<PortalAccessUser>
  ) {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
    );
  }

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (orgFilter !== "all" && u.organization !== orgFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !u.name.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !u.organization.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [search, orgFilter, users]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Accès portail client
          </h2>
          <p className="text-sm text-neutral-500">
            Gérez les utilisateurs ayant accès au portail client
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilisateurs du portail</CardTitle>
          <CardDescription>{filtered.length} utilisateur(s)</CardDescription>
        </CardHeader>
        <div className="px-6 pb-4 flex items-center gap-3">
          <div className="w-72">
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Organisation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les organisations</SelectItem>
              {ORGANIZATIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Organisation</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Rôle portail</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Permissions clés</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Dernière connexion</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-700">{u.organization}</td>
                  <td className="px-4 py-3">
                    <Badge variant={roleVariant(u.role)}>{PORTAL_ROLE_LABELS[u.role]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PermIcon active={u.canSeeAllTickets} icon={TicketIcon} title="Tous les billets" />
                      <PermIcon active={u.canSeeProjects} icon={FolderKanban} title="Projets" />
                      <PermIcon active={u.canSeeReports} icon={BarChart3} title="Rapports" />
                      <PermIcon active={u.canSeeTeam} icon={UsersIcon} title="Équipe" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.lastLogin}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Voir le portail comme cet utilisateur"
                        onClick={() => impersonate(u)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Modifier"
                        onClick={() => setEditing(u as PortalAccessUser)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EditPortalAccessModal
        open={!!editing}
        user={editing}
        onClose={() => setEditing(null)}
        onSave={handleSave}
      />
    </div>
  );
}

function PermIcon({
  active,
  icon: Icon,
  title,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md ring-1",
        active
          ? "bg-blue-50 text-blue-600 ring-blue-200"
          : "bg-slate-50 text-slate-300 ring-slate-200"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
