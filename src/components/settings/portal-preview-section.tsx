"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Eye,
  Building2,
  User,
  Loader2,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { usePortalImpersonation } from "@/stores/portal-impersonation-store";

interface ContactResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  portalEnabled: boolean;
  portalRole: string | null;
  organizationId: string;
  organizationName: string;
  organizationLogo: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  STANDARD: "Utilisateur standard",
  VIEWER: "Utilisateur standard",
};

export function PortalPreviewSection() {
  const router = useRouter();
  const startImpersonation = usePortalImpersonation((s) => s.startImpersonation);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/v1/contacts/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (Array.isArray(d)) setResults(d); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handleImpersonate(contact: ContactResult) {
    const role = (contact.portalRole?.toLowerCase() || "viewer") as "admin" | "manager" | "viewer";
    startImpersonation({
      userId: contact.id,
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      organizationId: contact.organizationId,
      organizationName: contact.organizationName,
      role,
      permissions: {
        portalRole: role,
        canAccessPortal: true,
        canSeeOwnTickets: true,
        canSeeAllOrganizationTickets: role !== "viewer",
        canCreateTickets: true,
        canSeeProjects: role !== "viewer",
        canSeeProjectDetails: role !== "viewer",
        canSeeProjectTasks: role === "admin",
        canSeeProjectLinkedTickets: role === "admin",
        canSeeReports: role !== "viewer",
        canSeeBillingReports: role === "admin",
        canSeeTimeReports: role === "admin",
        canSeeHourBankBalance: role === "admin",
        canSeeDocuments: role !== "viewer",
        canSeeTeamMembers: role !== "viewer",
      },
      startedByName: "Admin",
      startedAt: new Date().toISOString(),
    });
    router.push("/portal");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Visualiser le portail client
        </h2>
        <p className="text-[13px] text-slate-500 mt-1">
          Recherchez un contact pour visualiser le portail client sous son
          identité. Vous verrez exactement ce que le client voit.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom, courriel ou entreprise..."
              className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>

          {query.length > 0 && query.length < 2 && (
            <p className="text-[12px] text-slate-400">
              Tapez au moins 2 caractères pour rechercher...
            </p>
          )}

          {results.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {results.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Org logo */}
                  <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white text-[11px] font-bold">
                    {c.organizationLogo ? (
                      <img
                        src={c.organizationLogo}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      c.organizationName.charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Contact info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-900">
                        {c.firstName} {c.lastName}
                      </span>
                      {c.portalRole && (
                        <Badge
                          variant={
                            c.portalRole === "ADMIN"
                              ? "primary"
                              : c.portalRole === "MANAGER"
                                ? "warning"
                                : "default"
                          }
                          className="text-[9px]"
                        >
                          {ROLE_LABELS[c.portalRole] ?? c.portalRole}
                        </Badge>
                      )}
                      {!c.portalEnabled && (
                        <Badge variant="default" className="text-[9px]">
                          Portail désactivé
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
                      <span>{c.email}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {c.organizationName}
                      </span>
                    </div>
                  </div>

                  {/* Impersonate button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleImpersonate(c)}
                    className="shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visualiser
                  </Button>
                </div>
              ))}
            </div>
          )}

          {query.length >= 2 && !searching && results.length === 0 && (
            <div className="text-center py-8 text-[13px] text-slate-400">
              <User className="h-8 w-8 mx-auto mb-2" strokeWidth={1.5} />
              Aucun contact trouvé pour « {query} »
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
