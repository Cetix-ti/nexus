"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Monitor,
  Loader2,
  MessageSquare,
  Send,
  User,
  Package,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePortalUser } from "@/lib/portal/use-portal-user";

interface AssetDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  assignedContact: { id: string; firstName: string; lastName: string; email: string } | null;
  site: { name: string } | null;
  externalSource: string | null;
  externalId: string | null;
}

interface AssetNote {
  id: string;
  body: string;
  isPrivate: boolean;
  authorName: string;
  createdAt: string;
}

interface InstalledSoftware {
  name: string;
  version: string | null;
  publisher: string | null;
  installedDate: string | null;
}

export default function PortalAssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { permissions } = usePortalUser();
  const assetId = params.id as string;
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [notes, setNotes] = useState<AssetNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [posting, setPosting] = useState(false);
  const [software, setSoftware] = useState<InstalledSoftware[]>([]);
  const [softwareLoading, setSoftwareLoading] = useState(false);
  const [softwareSearch, setSoftwareSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/portal/assets/${assetId}`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/v1/portal/assets/${assetId}/notes`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([a, n]) => {
        setAsset(a);
        if (Array.isArray(n)) setNotes(n);
        // Load software if asset has an external source
        console.log("[asset-detail] externalSource:", a?.externalSource, "externalId:", a?.externalId);
        if (a?.externalSource) {
          setSoftwareLoading(true);
          fetch(`/api/v1/portal/assets/${assetId}/software`)
            .then((r) => {
              console.log("[asset-detail] software response:", r.status);
              return r.ok ? r.json() : [];
            })
            .then((s) => {
              console.log("[asset-detail] software count:", Array.isArray(s) ? s.length : "not array");
              if (Array.isArray(s)) setSoftware(s);
            })
            .catch((e) => console.error("[asset-detail] software error:", e))
            .finally(() => setSoftwareLoading(false));
        } else {
          console.log("[asset-detail] no externalSource, skipping software fetch");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  async function handlePostNote() {
    if (!newNote.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/v1/portal/assets/${assetId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newNote }),
    });
    if (res.ok) {
      const created = await res.json();
      setNotes((prev) => [
        {
          id: created.id,
          body: created.body,
          isPrivate: false,
          authorName: "Moi",
          createdAt: created.createdAt,
        },
        ...prev,
      ]);
      setNewNote("");
    }
    setPosting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-20 text-slate-400">Actif introuvable.</div>
    );
  }

  const canManage = permissions.canManageAssets || permissions.portalRole === "admin";

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/portal/assets")}
        className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour aux actifs
      </button>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
              <Monitor className="h-6 w-6 text-slate-500" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-slate-900 font-mono">
                {asset.name}
              </h1>
              <p className="text-[13px] text-slate-500">
                {asset.manufacturer} {asset.model}
              </p>
            </div>
            <Badge variant="success">{asset.status}</Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
            <div>
              <p className="text-slate-400 text-[11px]">Type</p>
              <p className="text-slate-700">{asset.type}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[11px]">N° de série</p>
              <p className="text-slate-700 font-mono">
                {asset.serialNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-[11px]">Adresse IP</p>
              <p className="text-slate-700 font-mono">
                {asset.ipAddress ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-[11px]">Site</p>
              <p className="text-slate-700">{asset.site?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-slate-400 text-[11px]">Assigné à</p>
              <p className="text-slate-700">
                {asset.assignedContact
                  ? `${asset.assignedContact.firstName} ${asset.assignedContact.lastName}`
                  : "—"}
              </p>
            </div>
            {asset.externalSource && (
              <div>
                <p className="text-slate-400 text-[11px]">Source</p>
                <p className="text-slate-700">{asset.externalSource}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Installed Software */}
      {(software.length > 0 || softwareLoading) && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-500" />
              Logiciels installés
              {!softwareLoading && (
                <span className="text-[12px] font-normal text-slate-400">
                  ({software.length})
                </span>
              )}
            </h2>

            {softwareLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {software.length > 10 && (
                  <Input
                    placeholder="Rechercher un logiciel..."
                    value={softwareSearch}
                    onChange={(e) => setSoftwareSearch(e.target.value)}
                    iconLeft={<Search className="h-4 w-4" />}
                    className="mb-3"
                  />
                )}
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase text-slate-400">
                        <th className="px-4 py-2">Nom</th>
                        <th className="px-4 py-2 hidden sm:table-cell">Version</th>
                        <th className="px-4 py-2 hidden md:table-cell">Éditeur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {software
                        .filter((s) => {
                          if (!softwareSearch) return true;
                          const q = softwareSearch.toLowerCase();
                          return [s.name, s.version, s.publisher]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase()
                            .includes(q);
                        })
                        .map((s, i) => (
                          <tr key={i} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2 text-slate-700">{s.name}</td>
                            <td className="px-4 py-2 text-slate-500 font-mono hidden sm:table-cell">
                              {s.version ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-slate-500 hidden md:table-cell">
                              {s.publisher ?? "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Notes
          </h2>

          {canManage && (
            <div className="flex gap-2 mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ajouter une note..."
                rows={2}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handlePostNote}
                disabled={posting || !newNote.trim()}
                className="self-end"
              >
                {posting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}

          {notes.length === 0 ? (
            <p className="text-[13px] text-slate-400 text-center py-8">
              Aucune note pour cet actif.
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium text-slate-700 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {n.authorName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString("fr-CA")}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-600 whitespace-pre-line">
                    {n.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
