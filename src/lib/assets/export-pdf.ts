"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrgAsset } from "./types";

const ASSET_TYPE_LABELS: Record<string, string> = {
  server_physical: "Serveur physique", server_virtual: "VM",
  windows_server: "Serveurs Windows/Linux", linux_server: "Serveurs Windows/Linux",
  nas: "NAS", san: "SAN", hypervisor: "Hyperviseur",
  workstation: "Postes de travail", laptop: "Postes de travail", network_switch: "Switch",
  firewall: "Pare-feu", router: "Routeur", wifi_ap: "WiFi AP", ups: "UPS",
  printer: "Imprimante", ip_phone: "Téléphone IP", monitoring_appliance: "Monitoring",
  tape_library: "Sauvegarde", cloud_resource: "Cloud",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif", maintenance: "En maintenance", inactive: "Inactif",
  retired: "Retiré", decommissioned: "Hors service",
};

// Charge une image statique publique en data-URL (PNG) pour jsPDF.
// Cache par URL — évite de re-fetcher à chaque export.
const imgCache = new Map<string, { dataUrl: string; width: number; height: number }>();
async function loadPublicImage(
  url: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (imgCache.has(url)) return imgCache.get(url)!;
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  const dims: { width: number; height: number } = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 600, height: 200 });
    img.src = dataUrl;
  });
  const entry = { dataUrl, width: dims.width, height: dims.height };
  imgCache.set(url, entry);
  return entry;
}

// Normalise un nom de client pour un nom de fichier (accents, espaces, etc.)
function slugForFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function exportAssetsPdf(assets: OrgAsset[], orgName: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Bandeau foncé
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 22, "F");

  // Logo Cetix — version blanche sur fond sombre
  try {
    const logo = await loadPublicImage("/images/cetix-logo-blanc-horizontal-HD.png");
    const logoH = 12; // mm — hauteur cible dans le bandeau
    const logoW = (logo.width / logo.height) * logoH;
    doc.addImage(logo.dataUrl, "PNG", 15, 5, logoW, logoH, undefined, "FAST");
  } catch {
    // Fallback : texte "CETIX" si le chargement échoue (offline, etc.)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CETIX", 15, 14);
  }

  // Libellé à droite du logo
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Rapport d'inventaire", pageWidth - 15, 14, { align: "right" });

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Inventaire des actifs — ${orgName}`, 15, 32);

  // Subtitle
  doc.setTextColor(100, 116, 139); // slate-500
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const dateStr = new Date().toLocaleDateString("fr-CA", {
    year: "numeric", month: "long", day: "numeric",
  });
  doc.text(`Généré le ${dateStr} · ${assets.length} actif${assets.length > 1 ? "s" : ""}`, 15, 38);

  // Table
  const rows = assets.map((a) => [
    a.name,
    ASSET_TYPE_LABELS[a.type] ?? a.type,
    STATUS_LABELS[a.status] ?? a.status,
    a.manufacturer ?? "—",
    a.model ?? "—",
    a.serialNumber ?? "—",
    a.ipAddress ?? "—",
    a.siteName ?? "—",
    a.lastLoggedUser ?? "—",
  ]);

  autoTable(doc, {
    startY: 42,
    head: [["Nom", "Type", "Statut", "Fabricant", "Modèle", "N° série", "IP", "Site", "Dernier utilisateur"]],
    body: rows,
    headStyles: {
      fillColor: [37, 99, 235], // blue-600
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59], // slate-800
      cellPadding: 2.5,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    styles: {
      lineColor: [226, 232, 240], // slate-200
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: 18 },
      3: { cellWidth: 22 },
      4: { cellWidth: 28 },
      5: { cellWidth: 24 },
      6: { cellWidth: 22 },
      7: { cellWidth: 25 },
      8: { cellWidth: 28 },
    },
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      // Footer on each page
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Nexus ITSM — Cetix · Page ${data.pageNumber}`,
        pageWidth / 2,
        pageH - 8,
        { align: "center" },
      );
    },
  });

  const slug = slugForFilename(orgName) || "client";
  const dateIso = new Date().toISOString().split("T")[0];
  doc.save(`Inventaire-actifs-${slug}-${dateIso}.pdf`);
}
