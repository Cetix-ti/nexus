"use client";

import React, { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Search,
  Rocket,
  Mail,
  Wifi,
  Monitor,
  AppWindow,
  Shield,
  KeyRound,
  Eye,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";

const categories = [
  { titleKey: "portal.kb.categories.firstSteps.title", descKey: "portal.kb.categories.firstSteps.desc", icon: Rocket,    articles: 12, color: "bg-blue-50 text-[#2563EB]" },
  { titleKey: "portal.kb.categories.email.title",      descKey: "portal.kb.categories.email.desc",      icon: Mail,      articles: 18, color: "bg-emerald-50 text-emerald-600" },
  { titleKey: "portal.kb.categories.network.title",    descKey: "portal.kb.categories.network.desc",    icon: Wifi,      articles: 9,  color: "bg-violet-50 text-violet-600" },
  { titleKey: "portal.kb.categories.hardware.title",   descKey: "portal.kb.categories.hardware.desc",   icon: Monitor,   articles: 14, color: "bg-amber-50 text-amber-600" },
  { titleKey: "portal.kb.categories.software.title",   descKey: "portal.kb.categories.software.desc",   icon: AppWindow, articles: 21, color: "bg-pink-50 text-pink-600" },
  { titleKey: "portal.kb.categories.security.title",   descKey: "portal.kb.categories.security.desc",   icon: Shield,    articles: 8,  color: "bg-red-50 text-red-600" },
  { titleKey: "portal.kb.categories.account.title",    descKey: "portal.kb.categories.account.desc",    icon: KeyRound,  articles: 11, color: "bg-teal-50 text-teal-600" },
];

const popularArticles = [
  { titleKey: "portal.kb.articles.vpn",        categoryKey: "portal.kb.categories.network.title", views: 1243 },
  { titleKey: "portal.kb.articles.resetPwd",   categoryKey: "portal.kb.categories.account.title", views: 987 },
  { titleKey: "portal.kb.articles.emailSig",   categoryKey: "portal.kb.categories.email.title",   views: 856 },
  { titleKey: "portal.kb.articles.newLicense", categoryKey: "portal.kb.categories.software.title",views: 742 },
  { titleKey: "portal.kb.articles.officeWifi", categoryKey: "portal.kb.categories.network.title", views: 698 },
  { titleKey: "portal.kb.articles.enable2fa",  categoryKey: "portal.kb.categories.security.title",views: 621 },
];

export default function PortalKnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const t = useLocaleStore((s) => s.t);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#2563EB] mb-4">
          <BookOpen className="h-3.5 w-3.5" />
          {t("portal.kb.badge")}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
          {t("portal.kb.heading")}
        </h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-md mx-auto">
          {t("portal.kb.subtitle")}
        </p>

        {/* Search */}
        <div className="mt-6 max-w-lg mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("portal.kb.searchPlaceholder")}
            className="w-full rounded-xl border border-neutral-200 bg-white py-3.5 pl-12 pr-4 text-sm placeholder:text-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories
          .filter((c) => {
            if (!search) return true;
            const q = search.toLowerCase();
            return t(c.titleKey).toLowerCase().includes(q) || t(c.descKey).toLowerCase().includes(q);
          })
          .map((cat) => (
            <button
              key={cat.titleKey}
              className="group flex flex-col items-start gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-left"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  cat.color
                )}
              >
                <cat.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-[#2563EB] transition-colors">
                  {t(cat.titleKey)}
                </h3>
                <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                  {t(cat.descKey)}
                </p>
              </div>
              <span className="text-xs text-neutral-400">
                {t("portal.kb.articlesCount", { count: cat.articles })}
              </span>
            </button>
          ))}
      </div>

      {/* Popular Articles */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">
            {t("portal.kb.popular")}
          </h2>
        </div>
        <div className="divide-y divide-neutral-100">
          {popularArticles.map((article, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-neutral-50 transition-colors text-left group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 group-hover:text-[#2563EB] transition-colors">
                  {t(article.titleKey)}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {t(article.categoryKey)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1 text-xs text-neutral-400">
                  <Eye className="h-3.5 w-3.5" />
                  {article.views.toLocaleString()}
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-300 group-hover:text-[#2563EB] transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
