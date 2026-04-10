"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrgAsset } from "./types";

const ASSET_TYPE_LABELS: Record<string, string> = {
  server_physical: "Serveur physique", server_virtual: "VM", windows_server: "Serveur Windows",
  linux_server: "Serveur Linux", nas: "NAS", san: "SAN", hypervisor: "Hyperviseur",
  workstation: "Poste de travail", laptop: "Portable", network_switch: "Switch",
  firewall: "Pare-feu", router: "Routeur", wifi_ap: "WiFi AP", ups: "UPS",
  printer: "Imprimante", ip_phone: "Téléphone IP", monitoring_appliance: "Monitoring",
  tape_library: "Sauvegarde", cloud_resource: "Cloud",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif", maintenance: "En maintenance", inactive: "Inactif",
  retired: "Retiré", decommissioned: "Hors service",
};

export function exportAssetsPdf(assets: OrgAsset[], orgName: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header — Cetix logo text (since we can't embed the actual image without base64)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("CETIX", 15, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Services TI gérés", 42, 14);

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

  doc.save(`actifs-${orgName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}-${new Date().toISOString().split("T")[0]}.pdf`);
}
