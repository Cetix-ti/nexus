"use client";

// ---------------------------------------------------------------------------
// Section « Mappage manuel » affichée sur /backups quand il y a des
// alertes Veeam orphelines (organizationId=null).
//
// Pour chaque senderDomain orphelin :
//   - affiche count + dernière alerte + 1–3 sujets d'exemple
//   - autocomplete organisation (taper → /api/v1/organizations?search=…)
//   - bouton « Assigner » → POST /api/v1/veeam/map-domain
//     (ajoute le domaine à l'org + backfill toutes les alertes du
//     domaine concerné)
//   - le panneau disparaît de la liste dès que le domaine n'a plus
//     d'alertes orphelines.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UnmatchedDomain {
  senderDomain: string;
  alertCount: number;
  latestReceivedAt: string;
  sampleSubjects: string[];
  sampleEmails: string[];
}

interface UnmatchedEmail {
  senderEmail: string;
  senderDomain: string;
  alertCount: number;
  latestReceivedAt: string;
  sampleSubjects: string[];
}

interface OrgSuggestion {
  id: string;
  name: string;
  clientCode: string | null;
}

export function UnmatchedDomainsSection({
  onChange,
}: {
  /** Callback appelé quand un mapping est appliqué — le parent recharge ses données. */
  onChange?: () => void;
}) {
  const [domains, setDomains] = useState<UnmatchedDomain[]>([]);
  const [emails, setEmails] = useState<UnmatchedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/v1/veeam/unmatched-domains")
      .then((r) => (r.ok ? r.json() : { domains: [], emails: [] }))
      .then((res: { domains: UnmatchedDomain[]; emails: UnmatchedEmail[] }) => {
        setDomains(Array.isArray(res.domains) ? res.domains : []);
        setEmails(Array.isArray(res.emails) ? res.emails : []);
      })
      .catch(() => setError("Impossible de charger les alertes orphelines"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMapDomain(senderDomain: string, org: OrgSuggestion) {
    try {
      const res = await fetch("/api/v1/veeam/map-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderDomain, organizationId: org.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setDomains((d) => d.filter((x) => x.senderDomain !== senderDomain));
      onChange?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleMapEmail(senderEmail: string, org: OrgSuggestion) {
    try {
      const res = await fetch("/api/v1/veeam/map-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmail, organizationId: org.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setEmails((e) => e.filter((x) => x.senderEmail !== senderEmail));
      onChange?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Silencieux si rien à mapper — ni domaines ni emails.
  if (!loading && domains.length === 0 && emails.length === 0 && !error) return null;
  const totalItems = domains.length + emails.length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-200/60">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Alertes non associées à un client
              </h3>
              <p className="text-[11.5px] text-slate-500">
                {loading
                  ? "Chargement…"
                  : `${totalItems} entrée${totalItems > 1 ? "s" : ""} à mapper : ${domains.length} domaine${domains.length > 1 ? "s" : ""} privé${domains.length > 1 ? "s" : ""}` +
                    (emails.length > 0
                      ? ` et ${emails.length} adresse${emails.length > 1 ? "s" : ""} courriel (domaine public)`
                      : "")}
              </p>
            </div>
          </div>
          {totalItems > 0 && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title={collapsed ? "Afficher" : "Masquer"}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-[12px] text-red-900 flex items-center gap-2">
            <X className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
            <button
              className="ml-auto text-red-700 hover:text-red-900"
              onClick={() => setError(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {!collapsed && domains.length > 0 && (
          <div className="mt-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Domaines privés ({domains.length})
            </p>
            <div className="space-y-2">
              {domains.map((d) => (
                <DomainRow
                  key={d.senderDomain}
                  domain={d}
                  onMap={(org) => handleMapDomain(d.senderDomain, org)}
                />
              ))}
            </div>
          </div>
        )}

        {!collapsed && emails.length > 0 && (
          <div className="mt-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Adresses courriel (domaine public — mappage individuel)
            </p>
            <p className="text-[11px] text-slate-500 mb-2">
              Ces adresses utilisent un fournisseur grand public (Gmail, Outlook, etc.) :
              il faut associer chaque adresse individuellement à son client, pas le domaine entier.
            </p>
            <div className="space-y-2">
              {emails.map((e) => (
                <EmailRow
                  key={e.senderEmail}
                  email={e}
                  onMap={(org) => handleMapEmail(e.senderEmail, org)}
                />
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Une ligne par domaine orphelin
// ---------------------------------------------------------------------------

function DomainRow({
  domain,
  onMap,
}: {
  domain: UnmatchedDomain;
  onMap: (org: OrgSuggestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<OrgSuggestion[]>([]);
  const [selected, setSelected] = useState<OrgSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // Debounce 200ms sur la recherche org.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/v1/organizations?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) => {
          if (Array.isArray(arr)) {
            setSuggestions(
              arr.slice(0, 10).map((o) => ({
                id: o.id,
                name: o.name,
                clientCode: o.clientCode ?? null,
              })),
            );
            setDropdownOpen(true);
          }
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Ferme le dropdown quand on clique en dehors.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [dropdownOpen]);

  function pickOrg(o: OrgSuggestion) {
    setSelected(o);
    setSearch(o.name);
    setDropdownOpen(false);
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onMap(selected);
    } finally {
      setSubmitting(false);
    }
  }

  const latestStr = new Date(domain.latestReceivedAt).toLocaleString("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      ref={rowRef}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Domain */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-[12.5px] font-semibold text-slate-900">
              {domain.senderDomain}
            </code>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
              {domain.alertCount} alerte{domain.alertCount > 1 ? "s" : ""}
            </span>
            <span className="text-[10.5px] text-slate-400">· dern. {latestStr}</span>
            <button
              className="text-[10.5px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
              onClick={() => setExpanded((s) => !s)}
            >
              {expanded ? "masquer" : "exemples"}
            </button>
          </div>
          {expanded && (
            <div className="mt-1.5 pl-1 text-[11.5px] text-slate-500 space-y-0.5">
              {domain.sampleEmails.length > 0 && (
                <p>
                  <span className="text-slate-400">De : </span>
                  {domain.sampleEmails.join(", ")}
                </p>
              )}
              {domain.sampleSubjects.map((s, i) => (
                <p key={i} className="truncate">
                  <span className="text-slate-400">Sujet : </span>
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Org picker */}
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 bg-white",
              selected
                ? "border-blue-300 ring-1 ring-blue-200/40"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder="Rechercher un client…"
              className="flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
              onFocus={() => {
                if (suggestions.length > 0) setDropdownOpen(true);
              }}
            />
            {searching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
            )}
            {selected && !searching && (
              <button
                onClick={() => {
                  setSelected(null);
                  setSearch("");
                }}
                className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Effacer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {dropdownOpen && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickOrg(s)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{s.name}</span>
                  {s.clientCode && (
                    <span className="text-[10.5px] text-slate-400 font-mono shrink-0">
                      {s.clientCode}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          size="sm"
          disabled={!selected || submitting}
          onClick={submit}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Assigner
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ligne "mapping par email" (domaine public)
// ---------------------------------------------------------------------------

function EmailRow({
  email,
  onMap,
}: {
  email: UnmatchedEmail;
  onMap: (org: OrgSuggestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<OrgSuggestion[]>([]);
  const [selected, setSelected] = useState<OrgSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/v1/organizations?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) => {
          if (Array.isArray(arr)) {
            setSuggestions(
              arr.slice(0, 10).map((o) => ({
                id: o.id,
                name: o.name,
                clientCode: o.clientCode ?? null,
              })),
            );
            setDropdownOpen(true);
          }
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [dropdownOpen]);

  function pickOrg(o: OrgSuggestion) {
    setSelected(o);
    setSearch(o.name);
    setDropdownOpen(false);
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onMap(selected);
    } finally {
      setSubmitting(false);
    }
  }

  const latestStr = new Date(email.latestReceivedAt).toLocaleString("fr-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      ref={rowRef}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-[12.5px] font-semibold text-slate-900 break-all">
              {email.senderEmail}
            </code>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-600">
              {email.alertCount} alerte{email.alertCount > 1 ? "s" : ""}
            </span>
            <span className="text-[10.5px] text-slate-400">· dern. {latestStr}</span>
            <button
              className="text-[10.5px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
              onClick={() => setExpanded((s) => !s)}
            >
              {expanded ? "masquer" : "sujets"}
            </button>
          </div>
          {expanded && (
            <div className="mt-1.5 pl-1 text-[11.5px] text-slate-500 space-y-0.5">
              {email.sampleSubjects.map((s, i) => (
                <p key={i} className="truncate">
                  <span className="text-slate-400">Sujet : </span>{s}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 bg-white",
              selected
                ? "border-blue-300 ring-1 ring-blue-200/40"
                : "border-slate-200 hover:border-slate-300",
            )}
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder="Rechercher un client…"
              className="flex-1 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
              onFocus={() => {
                if (suggestions.length > 0) setDropdownOpen(true);
              }}
            />
            {searching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
            )}
            {selected && !searching && (
              <button
                onClick={() => { setSelected(null); setSearch(""); }}
                className="h-4 w-4 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Effacer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {dropdownOpen && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickOrg(s)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50"
                >
                  <span className="truncate">{s.name}</span>
                  {s.clientCode && (
                    <span className="text-[10.5px] text-slate-400 font-mono shrink-0">
                      {s.clientCode}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!selected || submitting}
          onClick={submit}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Assigner
        </Button>
      </div>
    </div>
  );
}
