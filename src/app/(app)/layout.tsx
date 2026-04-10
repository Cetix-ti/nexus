"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useSidebarStore } from "@/stores/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarStore();

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-slate-50 grid"
      style={{
        gridTemplateColumns: `${collapsed ? "76px" : "260px"} 1fr`,
        gridTemplateRows: "100%",
        transition: "grid-template-columns 300ms ease-in-out",
      }}
    >
      {/* Colonne gauche : sidebar */}
      <div className="h-screen overflow-hidden">
        <Sidebar />
      </div>

      {/* Colonne droite : topbar + contenu */}
      <div className="flex flex-col h-screen min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-8 py-7 min-w-0 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
