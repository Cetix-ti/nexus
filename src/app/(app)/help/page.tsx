"use client";

import { HelpCircle, Mail, BookOpen, Bug } from "lucide-react";
import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-200/60">
          <HelpCircle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Aide & support</h1>
          <p className="text-[13px] text-slate-500">
            Documentation, questions fréquentes et contact équipe.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HelpCard
          icon={BookOpen}
          title="Base de connaissances"
          description="Articles, procédures et guides internes."
          href="/knowledge"
        />
        <HelpCard
          icon={Mail}
          title="Contacter le support"
          description="Écrivez à l'équipe Nexus pour toute question."
          href="mailto:support@cetix.ca"
          external
        />
        <HelpCard
          icon={Bug}
          title="Signaler un bug"
          description="Décrivez ce qui ne va pas pour qu'on le corrige."
          href="/tickets/new?category=bug"
        />
        <HelpCard
          icon={HelpCircle}
          title="Documentation complète"
          description="Pages d'aide détaillées (à venir)."
          href="/help"
        />
      </div>
    </div>
  );
}

function HelpCard({
  icon: Icon,
  title,
  description,
  href,
  external,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200/60">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[14px] font-semibold text-slate-900">{title}</p>
        <p className="text-[12.5px] text-slate-500">{description}</p>
      </div>
    </div>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return <Link href={href}>{content}</Link>;
}
