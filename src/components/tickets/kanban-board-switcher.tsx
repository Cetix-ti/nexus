"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Pin,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Settings,
  Check,
  Lock,
  Users,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useKanbanBoardsStore,
  SHARE_SCOPE_LABELS,
  type KanbanBoard,
} from "@/stores/kanban-boards-store";

const SHARE_ICONS = {
  private: Lock,
  team: Users,
  everyone: Globe,
};

export function KanbanBoardSwitcher({
  onManage,
}: {
  onManage?: () => void;
}) {
  const router = useRouter();
  const boards = useKanbanBoardsStore((s) => s.boards);
  const activeBoardId = useKanbanBoardsStore((s) => s.activeBoardId);
  const setActiveBoard = useKanbanBoardsStore((s) => s.setActiveBoard);
  const addBoard = useKanbanBoardsStore((s) => s.addBoard);
  const togglePin = useKanbanBoardsStore((s) => s.togglePin);
  const duplicateBoard = useKanbanBoardsStore((s) => s.duplicateBoard);
  const deleteBoard = useKanbanBoardsStore((s) => s.deleteBoard);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = boards.find((b) => b.id === activeBoardId) || boards[0];

  // Sort: pinned first, then by name
  const sorted = [...boards].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (!active) return null;

  const ShareIcon = SHARE_ICONS[active.shareScope];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 h-10 pl-3 pr-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors"
      >
        <span className="text-[14px] shrink-0">{active.icon}</span>
        <span className="text-[13px] font-semibold text-slate-900 whitespace-nowrap">
          {active.name}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform ml-1",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[360px] rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_40px_-10px_rgba(15,23,42,0.2)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              Tableaux Kanban
            </p>
          </div>
          <div className="max-h-[400px] overflow-y-auto py-1">
            {sorted.map((board) => {
              const isActive = board.id === activeBoardId;
              const SI = SHARE_ICONS[board.shareScope];
              return (
                <div
                  key={board.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 mx-1 rounded-md transition-colors group cursor-pointer",
                    isActive ? "bg-blue-50" : "hover:bg-slate-50"
                  )}
                  onClick={() => {
                    setActiveBoard(board.id);
                    setOpen(false);
                  }}
                >
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-[15px] shrink-0 ring-1 ring-inset"
                    style={{
                      backgroundColor: board.color + "15",
                      boxShadow: `inset 0 0 0 1px ${board.color}30`,
                    }}
                  >
                    {board.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[13px] font-semibold truncate",
                          isActive ? "text-blue-700" : "text-slate-900"
                        )}
                      >
                        {board.name}
                      </span>
                      {board.isPinned && (
                        <Pin className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                      )}
                      <span title={SHARE_SCOPE_LABELS[board.shareScope]}>
                        <SI className="h-3 w-3 text-slate-400 shrink-0" />
                      </span>
                    </div>
                    {board.description && (
                      <p className="text-[10.5px] text-slate-500 truncate">
                        {board.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(board.id);
                      }}
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title={board.isPinned ? "Désépingler" : "Épingler"}
                    >
                      <Pin className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateBoard(board.id);
                      }}
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      title="Dupliquer"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    {board.id !== "board_default" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Supprimer le tableau « ${board.name} » ?`))
                            deleteBoard(board.id);
                        }}
                        className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-100 p-1.5">
            <button
              onClick={async () => {
                const name = prompt("Nom du nouveau tableau :");
                if (!name?.trim()) return;
                await addBoard({
                  name: name.trim(),
                  description: "",
                  icon: "📋",
                  color: "#3B82F6",
                  groupBy: "status",
                  shareScope: "everyone",
                  sharedWithGroupIds: [],
                  sharedWithGroupNames: [],
                  isPinned: false,
                  filterOrgIds: [],
                  filterTechIds: [],
                  filterPriorities: [],
                  filterCategories: [],
                  filterTicketTypes: [],
                  filterTags: [],
                  columns: [],
                  customColumns: [],
                  ownerId: "",
                  ownerName: "",
                });
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouveau tableau
            </button>
            <button
              onClick={() => {
                setOpen(false);
                if (onManage) {
                  onManage();
                } else {
                  router.push("/settings?section=kanban_boards");
                }
              }}
              className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-3.5 w-3.5" />
              Gérer les tableaux
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
