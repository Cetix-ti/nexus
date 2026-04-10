"use client";

import { useEffect, useState, useMemo } from "react";
import { useSortable } from "@/lib/hooks/use-sortable";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
  Users,
  Search,
  Loader2,
  Pencil,
  Monitor,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface PortalContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  isActive: boolean;
  portalEnabled: boolean;
  portalStatus: string;
  assignedAssets: { id: string; name: string; type: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  permanent_departure: "Départ permanent",
  partial_departure: "Départ partiel",
  temporary_departure: "Départ temporaire",
};

const STATUS_VARIANTS: Record<string, "success" | "default" | "danger" | "warning"> = {
  active: "success",
  inactive: "default",
  permanent_departure: "danger",
  partial_departure: "warning",
  temporary_departure: "warning",
};

export default function PortalContactsPage() {
  const { permissions } = usePortalUser();
  const [contacts, setContacts] = useState<PortalContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PortalContact | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setContacts(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.firstName} ${c.lastName} ${c.email} ${c.jobTitle ?? ""}`.toLowerCase().includes(q);
  }), [contacts, search]);

  const { sorted: sortedContacts, sort: contactSort, toggleSort: toggleContactSort } = useSortable(filtered, "lastName");

  if (permissions.portalRole !== "admin" && !permissions.canManageContacts) {
    return (
      <div className="text-center py-20 text-slate-400 text-[13px]">
        Vous n&apos;avez pas la permission de gérer les contacts.
      </div>
    );
  }

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
        <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Gérez les utilisateurs de votre organisation
        </p>
      </div>

      <Input
        placeholder="Rechercher un contact..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        iconLeft={<Search className="h-4 w-4" />}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
              <SortableHeader label="Nom" sortKey="lastName" sort={contactSort} onToggle={toggleContactSort} />
              <SortableHeader label="Courriel" sortKey="email" sort={contactSort} onToggle={toggleContactSort} />
              <SortableHeader label="Poste" sortKey="jobTitle" sort={contactSort} onToggle={toggleContactSort} />
              <SortableHeader label="Statut" sortKey="portalStatus" sort={contactSort} onToggle={toggleContactSort} />
              <th className="px-4 py-3 font-medium text-slate-500">Actifs</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedContacts.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-slate-50/80 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {c.firstName} {c.lastName}
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-600">
                  {c.email}
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-500">
                  {c.jobTitle ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={STATUS_VARIANTS[c.portalStatus] ?? "default"}
                    className="text-[10.5px]"
                  >
                    {STATUS_LABELS[c.portalStatus] ?? c.portalStatus}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {c.assignedAssets.length > 0 ? (
                    <span className="text-[12px] text-slate-600 flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      {c.assignedAssets.length}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(c)}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-[13px] text-slate-400"
                >
                  Aucun contact trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
      </Card>

      {editing && (
        <EditContactModal
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setContacts((prev) =>
              prev.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c,
              ),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EditContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: PortalContact;
  onClose: () => void;
  onSaved: (c: any) => void;
}) {
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [jobTitle, setJobTitle] = useState(contact.jobTitle ?? "");
  const [status, setStatus] = useState(contact.portalStatus);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/v1/portal/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        phone: phone || null,
        jobTitle: jobTitle || null,
        portalStatus: status,
        isActive: status === "active",
      }),
    });
    if (res.ok) {
      onSaved({
        ...contact,
        firstName,
        lastName,
        phone,
        jobTitle,
        portalStatus: status,
        isActive: status === "active",
      });
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg my-8 rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-[16px] font-semibold text-slate-900">
            Modifier le contact
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <Input
            label="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Poste / Titre"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Statut
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
                <SelectItem value="temporary_departure">Départ temporaire</SelectItem>
                <SelectItem value="partial_departure">Départ partiel</SelectItem>
                <SelectItem value="permanent_departure">Départ permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
