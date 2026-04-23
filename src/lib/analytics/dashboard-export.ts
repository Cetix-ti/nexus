// ============================================================================
// Export d'un dashboard vers PDF / PNG / JPG.
// Utilise html2canvas côté client pour rasteriser le DOM ciblé (marqué
// data-print-target), puis jsPDF pour wrapper l'image dans un PDF.
//
// Précautions :
//   - Les éléments avec la classe print-export-hide sont retirés de la
//     capture (boutons d'édition, drag handles, etc.).
//   - Fond blanc forcé pour éviter un PDF transparent/gris.
//   - Échelle ×2 pour un rendu net (évite le flou sur Recharts SVG).
//   - Scroll DOM remis à 0 avant capture pour éviter que le haut soit coupé.
// ============================================================================

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export type ExportFormat = "pdf" | "png" | "jpg";

interface ExportOptions {
  /** Nom de fichier sans extension. */
  filename: string;
  /** Format de sortie. */
  format: ExportFormat;
  /** Sélecteur de l'élément à exporter. Défaut [data-print-target]. */
  targetSelector?: string;
  /** Orientation PDF. Défaut landscape. */
  orientation?: "portrait" | "landscape";
}

/**
 * Capture un élément DOM en canvas haute résolution.
 * Cache temporairement les éléments non pertinents pour l'export
 * (drag bars, boutons d'édition, resize handles).
 */
async function captureElement(target: HTMLElement): Promise<HTMLCanvasElement> {
  // Temporairement ajouter une classe au body pour que les boutons
  // FAB/drag/resize se cachent via CSS @media print-like rules.
  document.body.classList.add("exporting-dashboard");
  try {
    const canvas = await html2canvas(target, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      // Force la taille du viewport lors du render — évite les petits
      // bugs où un parent a overflow: hidden qui coupe le canvas.
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      // Ignore les éléments marqués pour ne pas apparaître à l'export.
      ignoreElements: (el) => {
        if (!(el instanceof HTMLElement)) return false;
        return (
          el.dataset.exportHide === "true"
          || el.classList.contains("print-export-hide")
          || el.hasAttribute("data-floating-ui")
        );
      },
    });
    return canvas;
  } finally {
    document.body.classList.remove("exporting-dashboard");
  }
}

export async function exportDashboard({ filename, format, targetSelector = "[data-print-target]", orientation = "landscape" }: ExportOptions): Promise<void> {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) {
    throw new Error(`Aucun élément à exporter trouvé (sélecteur : ${targetSelector})`);
  }

  const canvas = await captureElement(target);

  if (format === "png" || format === "jpg") {
    const mime = format === "png" ? "image/png" : "image/jpeg";
    const quality = format === "jpg" ? 0.92 : undefined;
    canvas.toBlob((blob) => {
      if (!blob) throw new Error("Impossible de générer l'image");
      downloadBlob(blob, `${filename}.${format}`);
    }, mime, quality);
    return;
  }

  // PDF
  const pdfOrientation = orientation === "landscape" ? "l" : "p";
  const pdf = new jsPDF({ orientation: pdfOrientation, unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8; // mm
  const usableW = pageWidth - margin * 2;
  const usableH = pageHeight - margin * 2;

  // Calcul du ratio pour tenir sur la page (une page A4, scale-to-fit).
  const imgW = canvas.width;
  const imgH = canvas.height;
  const ratio = Math.min(usableW / (imgW / 2), usableH / (imgH / 2));
  // ÷2 car scale: 2 dans html2canvas → on garde la dimension logique en mm.

  const drawW = (imgW / 2) * ratio;
  const drawH = (imgH / 2) * ratio;
  const offsetX = margin + (usableW - drawW) / 2;
  const offsetY = margin + (usableH - drawH) / 2;

  // Si l'image est plus haute qu'une page, on pagine en découpant
  // verticalement. Sinon tout sur 1 page.
  const singlePageHeightLogical = usableH;
  if (drawH <= singlePageHeightLogical) {
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      offsetX, offsetY, drawW, drawH,
      undefined, "FAST",
    );
  } else {
    // Multi-page : on découpe le canvas en tranches.
    const pageCount = Math.ceil(drawH / singlePageHeightLogical);
    const sliceHeightPx = Math.floor(imgH / pageCount);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = imgW;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("Impossible de créer le contexte canvas");

    for (let i = 0; i < pageCount; i++) {
      const srcY = i * sliceHeightPx;
      const thisHeight = Math.min(sliceHeightPx, imgH - srcY);
      sliceCanvas.height = thisHeight;
      ctx.clearRect(0, 0, sliceCanvas.width, thisHeight);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, thisHeight);
      ctx.drawImage(canvas, 0, srcY, imgW, thisHeight, 0, 0, imgW, thisHeight);
      if (i > 0) pdf.addPage();
      const sliceDrawH = (thisHeight / 2) * ratio;
      pdf.addImage(
        sliceCanvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        margin, margin, drawW, sliceDrawH,
        undefined, "FAST",
      );
    }
  }

  pdf.save(`${filename}.pdf`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
