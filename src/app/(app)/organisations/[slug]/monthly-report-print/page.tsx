"use client";

// ============================================================================
// Page d'impression PDF du rapport mensuel.
//
// S'ouvre dans un nouvel onglet. Lit le rapport depuis localStorage
// (stocké par le bouton "Télécharger PDF" de l'onglet Intelligence IA)
// puis auto-déclenche window.print() après render. L'utilisateur choisit
// "Enregistrer en PDF" dans le dialog d'impression du navigateur.
//
// Design : layout sans chrome de l'app, typographie optimisée, couleurs
// print-safe. @media print cache les éléments interactifs.
// ============================================================================

import { useEffect, useState } from "react";
import { use as usePromise } from "react";

interface Report {
  organizationId: string;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  executiveSummary: string;
  keyFacts: string[];
  trends: string[];
  completedActions: string[];
  recommendations: string[];
  discussionPoints: string[];
  markdown: string;
  generatedAt: string;
}

export default function MonthlyReportPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // `use()` résout le Promise de params (Next 15+)
  const { slug } = usePromise(params);
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Récupère le rapport depuis localStorage (mis par l'onglet parent).
    // Clé conventionnelle : nexus:monthly-report:{orgSlug}
    const key = `nexus:monthly-report:${slug}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        setNotFound(true);
        return;
      }
      const data = JSON.parse(raw) as Report;
      setReport(data);
    } catch {
      setNotFound(true);
    }
  }, [slug]);

  // Auto-déclenche l'impression 300ms après render — laisse le temps au
  // layout de se stabiliser. L'utilisateur peut annuler et ré-imprimer.
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => {
      window.print();
    }, 400);
    return () => clearTimeout(t);
  }, [report]);

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <p className="text-slate-700">
          Aucun rapport trouvé pour cette organisation. Retourne sur la fiche
          client, onglet « Intelligence IA », et clique sur « Générer » avant
          d'ouvrir cette vue.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-slate-500">Chargement…</div>
    );
  }

  return (
    <div className="ai-report-print max-w-3xl mx-auto p-10 text-slate-900">
      <header className="border-b border-slate-300 pb-4 mb-6">
        <h1 className="text-2xl font-bold">
          Rapport mensuel — {report.organizationName}
        </h1>
        <p className="text-slate-600 mt-1">
          Période : {report.periodStart} → {report.periodEnd}
        </p>
      </header>

      <Section title="Résumé exécutif">
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">
          {report.executiveSummary}
        </p>
      </Section>

      <Section title="Faits saillants">
        <ul className="list-disc list-inside space-y-1 text-[13px]">
          {report.keyFacts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </Section>

      {report.trends.length > 0 && (
        <Section title="Tendances observées">
          <ul className="list-disc list-inside space-y-1 text-[13px]">
            {report.trends.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.completedActions.length > 0 && (
        <Section title="Actions accomplies">
          <ul className="list-disc list-inside space-y-1 text-[13px]">
            {report.completedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.recommendations.length > 0 && (
        <Section title="Recommandations pour le prochain mois">
          <ul className="list-disc list-inside space-y-1 text-[13px]">
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.discussionPoints.length > 0 && (
        <Section title="Points à discuter en rencontre">
          <ul className="list-disc list-inside space-y-1 text-[13px]">
            {report.discussionPoints.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-10 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
        Généré par Nexus le{" "}
        {new Date(report.generatedAt).toLocaleString("fr-CA", {
          dateStyle: "long",
          timeStyle: "short",
        })}
      </footer>

      {/* Styles print — cache les chromes de l'app, optimise la typo pour
          l'impression, marges réduites pour éviter les troncatures.
          Le layout (app) wrap dans une sidebar + topbar — on les cache
          via sélecteurs structurels (aside, header, nav). */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 1.5cm 1.8cm;
          }
          body {
            background: white !important;
          }
          /* Cache les chromes app (sidebar / topbar / bottomsheet mobile).
             Sélecteurs basés sur les balises sémantiques du (app)/layout.tsx. */
          aside,
          header.sticky,
          nav.sidebar-scroll,
          .no-print,
          [data-print-hidden] {
            display: none !important;
          }
          /* Dégage les contraintes du layout principal */
          main {
            overflow: visible !important;
            padding: 0 !important;
          }
          .ai-report-print {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            color: #000 !important;
          }
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid-page">
      <h2 className="text-[15px] font-bold text-slate-900 mb-2 pb-1 border-b border-slate-200">
        {title}
      </h2>
      {children}
    </section>
  );
}
