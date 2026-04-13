"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ChevronRight, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ticketSchema = z.object({
  subject: z.string().min(5, "Le sujet doit contenir au moins 5 caractères"),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères"),
  organizationName: z.string().min(1, "L'organisation est requise"),
  requesterName: z.string().min(1, "Le demandeur est requis"),
  type: z.enum(["incident", "service_request", "problem", "change", "alert"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  urgency: z.enum(["critical", "high", "medium", "low"]),
  impact: z.enum(["critical", "high", "medium", "low"]),
  category: z.string().optional(),
  queue: z.string().optional(),
  assigneeName: z.string().optional(),
  tags: z.string().optional(),
});

type TicketFormData = z.infer<typeof ticketSchema>;

export default function NewTicketPage() {
  const router = useRouter();

  const [organizations, setOrganizations] = useState<string[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [requesters, setRequesters] = useState<string[]>([]);
  const [requestersLoading, setRequestersLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(true);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(true);

  // Fetch organizations on mount
  useEffect(() => {
    fetch("/api/v1/organizations")
      .then((r) => r.json())
      .then((orgs: { name: string }[]) => {
        if (Array.isArray(orgs)) setOrganizations(orgs.map((o) => o.name));
      })
      .catch(() => {})
      .finally(() => setOrgsLoading(false));
  }, []);

  // Fetch ticket categories on mount
  useEffect(() => {
    fetch("/api/v1/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Fetch queues on mount
  useEffect(() => {
    fetch("/api/v1/queues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setQueues(data);
        }
      })
      .catch(() => {})
      .finally(() => setQueuesLoading(false));
  }, []);

  // Fetch technicians on mount
  useEffect(() => {
    fetch("/api/v1/users?role=TECHNICIAN,SUPERVISOR,MSP_ADMIN,SUPER_ADMIN")
      .then((r) => r.json())
      .then((users: { name: string }[]) => {
        if (Array.isArray(users)) setTechnicians(users.map((u) => u.name));
      })
      .catch(() => {})
      .finally(() => setTechniciansLoading(false));
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      type: "incident",
      priority: "medium",
      urgency: "medium",
      impact: "medium",
      category: "",
      queue: "",
      organizationName: "",
      requesterName: "",
      assigneeName: "",
      tags: "",
    },
  });

  const selectedOrg = watch("organizationName");

  // Fetch contacts when org changes
  useEffect(() => {
    if (!selectedOrg) {
      setRequesters([]);
      return;
    }
    setRequestersLoading(true);
    fetch(`/api/v1/contacts?organizationName=${encodeURIComponent(selectedOrg)}`)
      .then((r) => r.json())
      .then((contacts: { firstName: string; lastName: string; organization: string }[]) => {
        if (!Array.isArray(contacts)) return;
        const filtered = contacts
          .filter((c) => c.organization === selectedOrg)
          .map((c) => `${c.firstName} ${c.lastName}`);
        setRequesters(filtered);
      })
      .catch(() => {})
      .finally(() => setRequestersLoading(false));
  }, [selectedOrg]);

  async function onSubmit(data: TicketFormData) {
    try {
      const res = await fetch("/api/v1/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: data.subject,
          description: data.description,
          organizationName: data.organizationName,
          requesterName: data.requesterName,
          type: data.type,
          priority: data.priority,
          urgency: data.urgency,
          impact: data.impact,
          category: data.category,
          queue: data.queue,
          assigneeName: data.assigneeName,
          tags: data.tags,
        }),
      });
      if (res.ok) {
        router.push("/tickets");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Erreur lors de la création");
      }
    } catch {
      alert("Erreur réseau");
    }
  }

  // Build root categories (no parentId)
  const rootCategories = categories.filter((c) => !c.parentId);

  return (
    <div className="flex flex-col gap-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Tickets
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-sm text-gray-500">Nouveau ticket</span>
      </div>

      <div className="mx-auto w-full max-w-4xl p-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Nouveau ticket</h1>
          <p className="mt-1 text-sm text-gray-500">Remplissez les informations pour créer un nouveau ticket de support.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Subject */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="space-y-4">
              <Input
                label="Sujet"
                placeholder="Brève description du problème"
                error={errors.subject?.message}
                {...register("subject")}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Description
                </label>
                <textarea
                  placeholder="Description détaillée du problème ou de la demande..."
                  className={cn(
                    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 shadow-sm transition-colors",
                    "placeholder:text-neutral-400",
                    "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                    "min-h-[140px] resize-y",
                    errors.description && "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                  )}
                  {...register("description")}
                />
                {errors.description && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Organization & Requester */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Contact</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Organisation
                </label>
                <Select
                  value={watch("organizationName")}
                  onValueChange={(val) => {
                    setValue("organizationName", val);
                    setValue("requesterName", "");
                  }}
                  disabled={orgsLoading}
                >
                  <SelectTrigger className={cn(errors.organizationName && "border-red-500")}>
                    <SelectValue placeholder={orgsLoading ? "Chargement..." : "Sélectionner une organisation"} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org} value={org}>
                        {org}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.organizationName && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.organizationName.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Demandeur
                </label>
                <Select
                  value={watch("requesterName")}
                  onValueChange={(val) => setValue("requesterName", val)}
                  disabled={!selectedOrg || requestersLoading}
                >
                  <SelectTrigger className={cn(errors.requesterName && "border-red-500")}>
                    <SelectValue placeholder={
                      requestersLoading ? "Chargement..." :
                      selectedOrg ? "Sélectionner un demandeur" : "Sélectionner d'abord une organisation"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {requesters.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.requesterName && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.requesterName.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Classification</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Type</label>
                <Select
                  value={watch("type")}
                  onValueChange={(val) => setValue("type", val as TicketFormData["type"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incident">Incident</SelectItem>
                    <SelectItem value="service_request">Demande de service</SelectItem>
                    <SelectItem value="problem">Problème</SelectItem>
                    <SelectItem value="change">Changement</SelectItem>
                    <SelectItem value="alert">Alerte monitoring</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Priorité</label>
                <Select
                  value={watch("priority")}
                  onValueChange={(val) => setValue("priority", val as TicketFormData["priority"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critique</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="low">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Urgence</label>
                <Select
                  value={watch("urgency")}
                  onValueChange={(val) => setValue("urgency", val as TicketFormData["urgency"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critique</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="low">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Impact</label>
                <Select
                  value={watch("impact")}
                  onValueChange={(val) => setValue("impact", val as TicketFormData["impact"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critique</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="low">Basse</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Catégorie</label>
                <Select
                  value={watch("category") || ""}
                  onValueChange={(val) => setValue("category", val)}
                  disabled={categoriesLoading}
                >
                  <SelectTrigger className={cn(errors.category && "border-red-500")}>
                    <SelectValue placeholder={categoriesLoading ? "Chargement..." : "Sélectionner une catégorie"} />
                  </SelectTrigger>
                  <SelectContent>
                    {rootCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">File d&apos;attente</label>
                <Select
                  value={watch("queue") || ""}
                  onValueChange={(val) => setValue("queue", val)}
                  disabled={queuesLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={queuesLoading ? "Chargement..." : "Sélectionner une file d'attente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={q.name}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Assignment & Tags */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Affectation</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Assigné</label>
                <Select
                  value={watch("assigneeName") ?? ""}
                  onValueChange={(val) => setValue("assigneeName", val)}
                  disabled={techniciansLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={techniciansLoading ? "Chargement..." : "Non assigné"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Non assigné</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech} value={tech}>
                        {tech}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="Étiquettes"
                placeholder="Étiquettes séparées par des virgules"
                {...register("tags")}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              <Save className="h-4 w-4" />
              Créer le ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
