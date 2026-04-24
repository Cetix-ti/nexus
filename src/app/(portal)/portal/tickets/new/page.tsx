"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePortalUser } from "@/lib/portal/use-portal-user";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import { useLocaleStore } from "@/stores/locale-store";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Info,
  Send,
} from "lucide-react";

const priorities = [
  { value: "low",      labelKey: "portal.newTicket.priorityLow",      descKey: "portal.newTicket.priorityLowDesc" },
  { value: "medium",   labelKey: "portal.newTicket.priorityMedium",   descKey: "portal.newTicket.priorityMediumDesc" },
  { value: "high",     labelKey: "portal.newTicket.priorityHigh",     descKey: "portal.newTicket.priorityHighDesc" },
  { value: "critical", labelKey: "portal.newTicket.priorityCritical", descKey: "portal.newTicket.priorityCriticalDesc" },
];

export default function PortalNewTicketPage() {
  const router = useRouter();
  const { organizationName } = usePortalUser();
  const t = useLocaleStore((s) => s.t);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [allCategories, setAllCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [catLevel1, setCatLevel1] = useState("");
  const [catLevel2, setCatLevel2] = useState("");
  const [catLevel3, setCatLevel3] = useState("");

  // Fetch categories from database
  useEffect(() => {
    fetch("/api/v1/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setAllCategories(data);
      })
      .catch(() => {});
  }, []);

  const rootCategories = allCategories.filter((c) => !c.parentId);
  const subCategories1 = catLevel1 ? allCategories.filter((c) => c.parentId === catLevel1) : [];
  const subCategories2 = catLevel2 ? allCategories.filter((c) => c.parentId === catLevel2) : [];

  async function handleSubmit() {
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          description,
          category: (() => {
            // Use the most specific selected category
            const catId = catLevel3 || catLevel2 || catLevel1;
            return allCategories.find((c) => c.id === catId)?.name || category;
          })(),
          priority,
        }),
      });
      if (res.ok) {
        router.push("/portal/tickets");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || t("portal.newTicket.creationError"));
      }
    } catch {
      alert(t("portal.newTicket.networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files).map((f) => f.name);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("portal.newTicket.back")}
      </button>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
          {t("portal.newTicket.title")}
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          {t("portal.newTicket.subtitle")}
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              {t("portal.newTicket.subject")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("portal.newTicket.subjectPlaceholder")}
              className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  {t("portal.newTicket.category")}
                </label>
                <select
                  value={catLevel1}
                  onChange={(e) => { setCatLevel1(e.target.value); setCatLevel2(""); setCatLevel3(""); }}
                  className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
                >
                  <option value="">{t("portal.newTicket.selectPlaceholder")}</option>
                  {rootCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {subCategories1.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    {t("portal.newTicket.subcategory")}
                  </label>
                  <select
                    value={catLevel2}
                    onChange={(e) => { setCatLevel2(e.target.value); setCatLevel3(""); }}
                    className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
                  >
                    <option value="">{t("portal.newTicket.selectPlaceholder")}</option>
                    {subCategories1.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {subCategories2.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                    {t("portal.newTicket.subcategory2")}
                  </label>
                  <select
                    value={catLevel3}
                    onChange={(e) => setCatLevel3(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
                  >
                    <option value="">{t("portal.newTicket.selectPlaceholder")}</option>
                    {subCategories2.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                {t("portal.newTicket.priority")} <span className="text-red-500">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
              >
                {priorities.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.labelKey)} — {t(p.descKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              {t("portal.newTicket.description")} <span className="text-red-500">*</span>
            </label>
            <AdvancedRichEditor
              value={description}
              onChange={setDescription}
              placeholder={t("portal.newTicket.descriptionPlaceholder")}
              minHeight="220px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              {t("portal.newTicket.attachments")}
            </label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors cursor-pointer",
                dragActive
                  ? "border-[#2563EB] bg-blue-50"
                  : "border-neutral-200 bg-[#F9FAFB] hover:border-neutral-300"
              )}
            >
              <Upload
                className={cn(
                  "h-8 w-8 mb-2",
                  dragActive ? "text-[#2563EB]" : "text-neutral-300"
                )}
              />
              <p className="text-sm text-neutral-600">
                <span className="font-medium text-[#2563EB]">
                  {t("portal.newTicket.uploadClick")}
                </span>{" "}
                {t("portal.newTicket.uploadOrDrop")}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {t("portal.newTicket.fileTypes")}
              </p>
              <input
                type="file"
                multiple
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                  if (e.target.files) {
                    const newFiles = Array.from(e.target.files).map(
                      (f) => f.name
                    );
                    setFiles((prev) => [...prev, ...newFiles]);
                  }
                }}
              />
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2"
                  >
                    <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                    <span className="text-sm text-neutral-700 flex-1 truncate">
                      {file}
                    </span>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-100 bg-[#F9FAFB] px-6 py-4 rounded-b-xl">
          <div className="flex items-start gap-2.5 mb-4">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-500">
              {t("portal.newTicket.info")}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              {t("portal.newTicket.cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !subject.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submitting ? t("portal.newTicket.submitting") : t("portal.newTicket.submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
