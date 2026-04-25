"use client";

// Boundary réutilisable — affiche un encart ambre détaillé quand un sous-arbre
// React throw au rendu. Permet d'éviter qu'un crash dans un widget/section
// précis ne fasse écran blanc sur toute la page.
//
// Diffère du boundary spécifique de ClientBillingOverridesSection : celui-ci
// est générique, sans bouton « réinitialiser localStorage » (cas spécifique).

import React from "react";

interface BoundaryState {
  hasError: boolean;
  message?: string;
  stack?: string;
  componentStack?: string;
}

interface BoundaryProps {
  children: React.ReactNode;
  /** Titre de l'encart d'erreur — décrit ce qui n'a pas pu se charger. */
  label: string;
  /** Optionnel : ID stable pour différencier plusieurs instances dans les logs. */
  scope?: string;
}

export class SectionErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(err: Error): BoundaryState {
    return { hasError: true, message: err?.message ?? String(err), stack: err?.stack };
  }

  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    console.error(`[SectionErrorBoundary:${this.props.scope ?? this.props.label}]`, err, info);
    this.setState({ componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900">
          <p className="font-semibold text-[14px]">⚠ {this.props.label}</p>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-[11.5px] font-medium">Détails techniques</summary>
            <div className="mt-2 rounded bg-white border border-amber-200 p-2.5 text-[11px] text-slate-800 font-mono">
              <div><strong>Message :</strong> {this.state.message}</div>
              {this.state.componentStack && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-slate-700">{this.state.componentStack.trim()}</pre>
              )}
              {this.state.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10.5px] text-slate-600">Stack trace</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-[10px] text-slate-600">{this.state.stack.trim()}</pre>
                </details>
              )}
            </div>
          </details>
          <button
            onClick={() => location.reload()}
            className="mt-3 text-[11.5px] rounded bg-amber-700 text-white px-3 py-1.5 hover:bg-amber-800"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
