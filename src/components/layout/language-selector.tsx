"use client";

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/locale-store";
import type { Locale } from "@/lib/i18n/translations";

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSelector({ compact, className }: LanguageSelectorProps) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const options: { value: Locale; label: string; flag: string }[] = [
    { value: "fr", label: "Français", flag: "🇫🇷" },
    { value: "en", label: "English", flag: "🇬🇧" },
  ];

  if (compact) {
    return (
      <button
        onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors",
          className,
        )}
        title={locale === "fr" ? "Switch to English" : "Passer au français"}
      >
        <Globe className="h-3.5 w-3.5" strokeWidth={2} />
        {locale.toUpperCase()}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setLocale(opt.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
            locale === opt.value
              ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/60"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
          )}
        >
          <span className="text-sm">{opt.flag}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
