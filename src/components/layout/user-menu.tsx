"use client";

import { useState, useRef, useEffect } from "react";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  User,
  Settings,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserAvatarStore } from "@/stores/user-avatar-store";

function getInitials(first?: string, last?: string): string {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "NX";
}

interface MenuItem {
  icon: typeof User;
  label: string;
  description?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const user = session?.user;

  const initials = getInitials(user?.firstName, user?.lastName);
  const loadAvatar = useUserAvatarStore((s) => s.load);
  const avatar = useUserAvatarStore((s) => s.avatar);

  useEffect(() => { loadAvatar(); }, [loadAvatar]);
  const fullName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
    : "Utilisateur";
  const role = (user as any)?.role || "—";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const sections: { items: MenuItem[] }[] = [
    {
      items: [
        {
          icon: User,
          label: "Mon profil",
          description: "Voir et modifier votre profil",
          href: "/account?tab=profile",
        },
        {
          icon: KeyRound,
          label: "Mot de passe",
          description: "Modifier votre mot de passe",
          href: "/account?tab=security",
        },
      ],
    },
    {
      items: [
        {
          icon: Shield,
          label: "Authentification à deux facteurs",
          description: "Activer le MFA",
          href: "/account?tab=security",
        },
        {
          icon: Bell,
          label: "Préférences de notifications",
          description: "Email, in-app, SMS",
          href: "/account?tab=notifications",
        },
        {
          icon: Settings,
          label: "Paramètres du compte",
          description: "Langue, fuseau, format",
          href: "/account?tab=preferences",
        },
      ],
    },
    {
      items: [
        {
          icon: HelpCircle,
          label: "Aide & support",
          href: "/help",
        },
        {
          icon: LogOut,
          label: "Déconnexion",
          onClick: () => signOut({ callbackUrl: "/login" }),
          danger: true,
        },
      ],
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="ml-1 inline-flex items-center justify-center hover:bg-slate-100 rounded-lg p-1 transition-colors cursor-pointer"
        title={fullName}
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[12px] font-semibold ring-2 ring-white shadow-sm overflow-hidden">
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initials}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[calc(100vw-2rem)] sm:w-[320px] rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-10px_rgba(15,23,42,0.2)] overflow-hidden">
          {/* User card header */}
          <div className="px-4 py-4 bg-gradient-to-br from-blue-50/60 to-violet-50/40 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-[15px] font-semibold ring-2 ring-white shadow-sm shrink-0 overflow-hidden">
                {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 truncate">
                  {fullName}
                </p>
                <p className="text-[11.5px] text-slate-500 truncate">
                  {user?.email}
                </p>
                <span className="inline-flex h-4 items-center rounded bg-blue-100 px-1.5 mt-1 text-[9.5px] font-bold text-blue-700 uppercase tracking-wider">
                  {role}
                </span>
              </div>
            </div>
          </div>

          {/* Menu sections */}
          <div className="py-1.5">
            {sections.map((section, sIdx) => (
              <div
                key={sIdx}
                className={cn(
                  sIdx > 0 && "border-t border-slate-100 mt-1.5 pt-1.5"
                )}
              >
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const inner = (
                    <div className="flex items-center gap-3 px-3 py-2 mx-1 rounded-md hover:bg-slate-50 transition-colors">
                      <div
                        className={cn(
                          "h-7 w-7 rounded-md flex items-center justify-center shrink-0 ring-1 ring-inset",
                          item.danger
                            ? "bg-red-50 text-red-600 ring-red-200/60"
                            : "bg-slate-100 text-slate-600 ring-slate-200/60"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-[12.5px] font-medium",
                            item.danger ? "text-red-600" : "text-slate-800"
                          )}
                        >
                          {item.label}
                        </p>
                        {item.description && (
                          <p className="text-[10.5px] text-slate-400 mt-0.5 truncate">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );

                  if (item.href) {
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        item.onClick?.();
                        setOpen(false);
                      }}
                      className="w-full text-left"
                    >
                      {inner}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="px-4 py-2 bg-slate-50/60 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 text-center">
              Nexus ITSM v0.1 — Cetix MSP
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
