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

const categories = [
  {
    title: "Getting Started",
    description: "New employee setup, first steps, and onboarding guides",
    icon: Rocket,
    articles: 12,
    color: "bg-blue-50 text-[#2563EB]",
  },
  {
    title: "Email & Communication",
    description: "Outlook, Teams, email signatures, and calendar setup",
    icon: Mail,
    articles: 18,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "Network & VPN",
    description: "VPN setup, Wi-Fi, network drives, and remote access",
    icon: Wifi,
    articles: 9,
    color: "bg-violet-50 text-violet-600",
  },
  {
    title: "Hardware",
    description: "Laptops, monitors, printers, and peripherals",
    icon: Monitor,
    articles: 14,
    color: "bg-amber-50 text-amber-600",
  },
  {
    title: "Software",
    description: "Installation, licenses, updates, and troubleshooting",
    icon: AppWindow,
    articles: 21,
    color: "bg-pink-50 text-pink-600",
  },
  {
    title: "Security",
    description: "Password policies, 2FA, phishing, and data protection",
    icon: Shield,
    articles: 8,
    color: "bg-red-50 text-red-600",
  },
  {
    title: "Account & Access",
    description: "Password resets, permissions, and access requests",
    icon: KeyRound,
    articles: 11,
    color: "bg-teal-50 text-teal-600",
  },
];

const popularArticles = [
  {
    title: "How to connect to the VPN from home",
    category: "Network & VPN",
    views: 1243,
  },
  {
    title: "Reset your password using self-service portal",
    category: "Account & Access",
    views: 987,
  },
  {
    title: "Set up your email signature in Outlook",
    category: "Email & Communication",
    views: 856,
  },
  {
    title: "Request a new software license",
    category: "Software",
    views: 742,
  },
  {
    title: "Connect to the office Wi-Fi network",
    category: "Network & VPN",
    views: 698,
  },
  {
    title: "Enable two-factor authentication on your account",
    category: "Security",
    views: 621,
  },
];

export default function PortalKnowledgeBasePage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-[#2563EB] mb-4">
          <BookOpen className="h-3.5 w-3.5" />
          Knowledge Base
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
          Find answers to your questions
        </h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-md mx-auto">
          Browse our help articles or search for a specific topic.
        </p>

        {/* Search */}
        <div className="mt-6 max-w-lg mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles..."
            className="w-full rounded-xl border border-neutral-200 bg-white py-3.5 pl-12 pr-4 text-sm placeholder:text-neutral-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories
          .filter(
            (c) =>
              !search ||
              c.title.toLowerCase().includes(search.toLowerCase()) ||
              c.description.toLowerCase().includes(search.toLowerCase())
          )
          .map((cat) => (
            <button
              key={cat.title}
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
                  {cat.title}
                </h3>
                <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                  {cat.description}
                </p>
              </div>
              <span className="text-xs text-neutral-400">
                {cat.articles} articles
              </span>
            </button>
          ))}
      </div>

      {/* Popular Articles */}
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-neutral-900">
            Popular Articles
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
                  {article.title}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {article.category}
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
