// ============================================================================
// Export d'un dashboard vers PDF / PNG / JPG.
//
// Utilise `html-to-image` (pas html2canvas) pour capturer le DOM —
// html2canvas 1.x ne supporte pas les couleurs oklch() de Tailwind 4
// et produit des exports entièrement blancs.
//
// Flow :
//   html-to-image → dataURL PNG/JPG ; pour PDF, on passe par une Image
//   puis un canvas pour contrôler la pagination via jsPDF.
// ============================================================================

import { toPng, toJpeg } from "html-to-image";
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

async function captureDataUrl(target: HTMLElement, format: "png" | "jpg"): Promise<string> {
  const options = {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
    filter: (el: HTMLElement) => {
      if (!(el instanceof HTMLElement)) return true;
      if (el.dataset.exportHide === "true") return false;
      if (el.classList.contains("print-export-hide")) return false;
      if (el.hasAttribute("data-floating-ui")) return false;
      return true;
    },
    style: { background: "#ffffff" },
  };
  return format === "png"
    ? await toPng(target, options)
    : await toJpeg(target, { ...options, quality: 0.92 });
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportDashboard({
  filename,
  format,
  targetSelector = "[data-print-target]",
  orientation = "landscape",
}: ExportOptions): Promise<void> {
  const target = document.querySelector<HTMLElement>(targetSelector);
  if (!target) {
    throw new Error(`Aucun élément à exporter trouvé (${targetSelector})`);
  }

  document.body.classList.add("exporting-dashboard");
  try {
    if (format === "png" || format === "jpg") {
      const dataUrl = await captureDataUrl(target, format);
      downloadDataUrl(dataUrl, `${filename}.${format}`);
      return;
    }

    const dataUrl = await captureDataUrl(target, "jpg");
    await dataUrlToPdf(dataUrl, filename, orientation);
  } finally {
    document.body.classList.remove("exporting-dashboard");
  }
}

async function dataUrlToPdf(
  dataUrl: string,
  filename: string,
  orientation: "portrait" | "landscape",
): Promise<void> {
  const img = await loadImage(dataUrl);
  const pdfOrientation = orientation === "landscape" ? "l" : "p";
  const pdf = new jsPDF({ orientation: pdfOrientation, unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableW = pageWidth - margin * 2;
  const usableH = pageHeight - margin * 2;

  const logicalW = img.width / 2;
  const logicalH = img.height / 2;
  const scale = usableW / logicalW;
  const drawW = logicalW * scale;
  const totalDrawH = logicalH * scale;

  if (totalDrawH <= usableH) {
    pdf.addImage(dataUrl, "JPEG", margin, margin, drawW, totalDrawH, undefined, "FAST");
  } else {
    const pageCount = Math.ceil(totalDrawH / usableH);
    const sliceHeightPx = Math.floor(img.height / pageCount);
    const sliceCanvas = document.createElement("canvas");
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("Contexte canvas indisponible");
    sliceCanvas.width = img.width;

    for (let i = 0; i < pageCount; i++) {
      const srcY = i * sliceHeightPx;
      const thisHeight = Math.min(sliceHeightPx, img.height - srcY);
      sliceCanvas.height = thisHeight;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, thisHeight);
      ctx.drawImage(img, 0, srcY, img.width, thisHeight, 0, 0, img.width, thisHeight);
      if (i > 0) pdf.addPage();
      const sliceLogicalH = thisHeight / 2;
      const sliceDrawH = sliceLogicalH * scale;
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Échec du chargement de l'image"));
    img.src = src;
  });
}
