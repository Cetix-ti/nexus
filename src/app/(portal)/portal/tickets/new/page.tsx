"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdvancedRichEditor } from "@/components/ui/advanced-rich-editor";
import {
  ArrowLeft,
  Upload,
  X,
  FileText,
  Info,
  Send,
} from "lucide-react";

const categories = [
  { value: "", label: "Sélectionner une catégorie..." },
  { value: "hardware", label: "Matériel" },
  { value: "software", label: "Logiciels" },
  { value: "network-vpn", label: "Réseau & VPN" },
  { value: "email", label: "Courriel & Communication" },
  { value: "account-access", label: "Compte & Accès" },
  { value: "security", label: "Sécurité" },
  { value: "other", label: "Autre" },
];

const priorities = [
  { value: "low", label: "Faible", description: "Aucun impact immédiat" },
  { value: "medium", label: "Moyenne", description: "Impact partiel sur votre travail" },
  { value: "high", label: "Élevée", description: "Impact important sur votre travail" },
  { value: "critical", label: "Critique", description: "Vous ne pouvez plus travailler" },
];

export default function PortalNewTicketPage() {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

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
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/portal/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à mes billets
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-neutral-900">
          Soumettre un nouveau billet
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          Décrivez votre problème ou votre demande et notre équipe vous
          répondra dans les meilleurs délais.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Sujet <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Décrivez brièvement votre problème ou votre demande"
              className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Catégorie <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Priorité <span className="text-red-500">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 appearance-none"
              >
                {priorities.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <AdvancedRichEditor
              value={description}
              onChange={setDescription}
              placeholder="Donnez le plus de détails possible : messages d'erreur, étapes pour reproduire, ce que vous avez déjà essayé. Vous pouvez coller des images directement."
              minHeight="180px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Pièces jointes
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
                  Cliquez pour téléverser
                </span>{" "}
                ou glissez-déposez
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                PNG, JPG, PDF, DOCX jusqu&apos;à 10 Mo
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
              Votre billet sera examiné par notre équipe de support et vous
              recevrez une notification par courriel à chaque mise à jour. Le
              temps de réponse moyen est de moins de 4 heures durant les heures
              ouvrables.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/portal/tickets"
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Annuler
            </Link>
            <button className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
              <Send className="h-4 w-4" />
              Soumettre le billet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
