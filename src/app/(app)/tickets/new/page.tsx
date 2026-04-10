"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ChevronRight, Save } from "lucide-react";
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
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  organizationName: z.string().min(1, "Organization is required"),
  requesterName: z.string().min(1, "Requester is required"),
  type: z.enum(["incident", "request", "problem", "change"]),
  priority: z.enum(["critical", "high", "medium", "low"]),
  urgency: z.enum(["critical", "high", "medium", "low"]),
  impact: z.enum(["critical", "high", "medium", "low"]),
  categoryName: z.string().min(1, "Category is required"),
  queueName: z.string().min(1, "Queue is required"),
  assigneeName: z.string().optional(),
  tags: z.string().optional(),
});

type TicketFormData = z.infer<typeof ticketSchema>;

const ORGANIZATIONS = ["Acme Corp", "TechStart Inc", "Global Finance", "HealthCare Plus", "Cetix"];
const REQUESTERS: Record<string, string[]> = {
  "Acme Corp": ["Sarah Mitchell", "Robert Kim", "Karen Lee"],
  "TechStart Inc": ["Emily Watson", "Mike Johnson", "Tom Bradley"],
  "Global Finance": ["David Chen", "Lisa Thompson", "Anna Williams"],
  "HealthCare Plus": ["Dr. James Morrison", "Nancy Adams", "Sandra Brooks"],
  Cetix: ["Jean-Philippe Côté", "Marie Tremblay", "Alexandre Dubois"],
};
const CATEGORIES = [
  "Network",
  "Hardware",
  "Software",
  "Email & Collaboration",
  "Access Management",
  "User Management",
  "Server",
  "Backup & Recovery",
  "Security",
];
const QUEUES = ["Helpdesk", "Infrastructure", "On-site Support", "Procurement", "Security"];
const TECHNICIANS = ["Jean-Philippe Côté", "Marie Tremblay", "Alexandre Dubois"];

export default function NewTicketPage() {
  const router = useRouter();

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
      categoryName: "",
      queueName: "",
      organizationName: "",
      requesterName: "",
      assigneeName: "",
      tags: "",
    },
  });

  const selectedOrg = watch("organizationName");
  const availableRequesters = selectedOrg ? REQUESTERS[selectedOrg] ?? [] : [];

  function onSubmit(data: TicketFormData) {
    // Mock submit -- in production this would POST to API
    console.log("New ticket data:", data);
    router.push("/tickets");
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <button
          onClick={() => router.push("/tickets")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Tickets
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
        <span className="text-sm text-gray-500">New Ticket</span>
      </div>

      <div className="mx-auto w-full max-w-4xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create New Ticket</h1>
          <p className="mt-1 text-sm text-gray-500">Fill in the details to create a new support ticket.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Subject */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="space-y-4">
              <Input
                label="Subject"
                placeholder="Brief description of the issue"
                error={errors.subject?.message}
                {...register("subject")}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Description
                </label>
                <textarea
                  placeholder="Detailed description of the issue or request..."
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
                  Organization
                </label>
                <Select
                  value={watch("organizationName")}
                  onValueChange={(val) => {
                    setValue("organizationName", val);
                    setValue("requesterName", "");
                  }}
                >
                  <SelectTrigger className={cn(errors.organizationName && "border-red-500")}>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORGANIZATIONS.map((org) => (
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
                  Requester
                </label>
                <Select
                  value={watch("requesterName")}
                  onValueChange={(val) => setValue("requesterName", val)}
                  disabled={!selectedOrg}
                >
                  <SelectTrigger className={cn(errors.requesterName && "border-red-500")}>
                    <SelectValue placeholder={selectedOrg ? "Select requester" : "Select organization first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRequesters.map((name) => (
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
                    <SelectItem value="request">Request</SelectItem>
                    <SelectItem value="problem">Problem</SelectItem>
                    <SelectItem value="change">Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Priority</label>
                <Select
                  value={watch("priority")}
                  onValueChange={(val) => setValue("priority", val as TicketFormData["priority"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Urgency</label>
                <Select
                  value={watch("urgency")}
                  onValueChange={(val) => setValue("urgency", val as TicketFormData["urgency"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
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
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Category</label>
                <Select
                  value={watch("categoryName")}
                  onValueChange={(val) => setValue("categoryName", val)}
                >
                  <SelectTrigger className={cn(errors.categoryName && "border-red-500")}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.categoryName && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.categoryName.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Queue</label>
                <Select
                  value={watch("queueName")}
                  onValueChange={(val) => setValue("queueName", val)}
                >
                  <SelectTrigger className={cn(errors.queueName && "border-red-500")}>
                    <SelectValue placeholder="Select queue" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUEUES.map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.queueName && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.queueName.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Assignment & Tags */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">Assignment</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">Assignee</label>
                <Select
                  value={watch("assigneeName") ?? ""}
                  onValueChange={(val) => setValue("assigneeName", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {TECHNICIANS.map((tech) => (
                      <SelectItem key={tech} value={tech}>
                        {tech}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="Tags"
                placeholder="Comma-separated tags"
                {...register("tags")}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/tickets")}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              <Save className="h-4 w-4" />
              Create Ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
