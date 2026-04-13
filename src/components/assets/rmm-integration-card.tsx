"use client";

import Image from "next/image";
import { RefreshCw, Plug, Settings, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ASSET_SOURCE_LABELS, type RmmIntegration } from "@/lib/assets/types";
import { cn } from "@/lib/utils";

const PROVIDER_LOGOS: Record<string, string> = {
  atera: "/images/atera-logo.png",
};

interface RmmIntegrationCardProps {
  integration: RmmIntegration;
  onSync: () => void;
  onConnect: () => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  atera: "from-orange-500 to-red-500",
  ninja: "from-emerald-500 to-teal-500",
  intune: "from-blue-500 to-indigo-500",
  kaseya: "from-rose-500 to-pink-500",
  datto: "from-violet-500 to-purple-500",
  manual: "from-slate-400 to-slate-500",
};

function timeAgo(iso?: string): string {
  if (!iso) return "Jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
}

export function RmmIntegrationCard({ integration, onSync, onConnect }: RmmIntegrationCardProps) {
  const label = ASSET_SOURCE_LABELS[integration.provider];
  const initial = label.charAt(0);
  const gradient = PROVIDER_COLORS[integration.provider] ?? PROVIDER_COLORS.manual;
  const logo = PROVIDER_LOGOS[integration.provider];

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {logo ? (
            <div className="h-11 w-11 rounded-xl bg-white ring-1 ring-inset ring-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              <Image src={logo} alt={label} width={32} height={32} className="object-contain" />
            </div>
          ) : (
            <div
              className={cn(
                "h-11 w-11 rounded-xl bg-gradient-to-br text-white flex items-center justify-center text-base font-semibold shadow-sm",
                gradient
              )}
            >
              {initial}
            </div>
          )}
          <div>
            <div className="text-[14px] font-semibold text-slate-900 leading-tight">{label}</div>
            <div className="mt-0.5">
              {integration.isConnected ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connecté
                </Badge>
              ) : (
                <Badge variant="default" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Non connecté
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-slate-500">Dernière sync</div>
          <div className="font-medium text-slate-800">{timeAgo(integration.lastSyncAt)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-slate-500">Actifs synchronisés</div>
          <div className="font-medium text-slate-800">{integration.syncedAssetCount}</div>
        </div>
      </div>

      {integration.errorMessage && (
        <div className="text-[12px] text-red-600 bg-red-50 rounded-md px-3 py-2">
          {integration.errorMessage}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {integration.isConnected ? (
          <Button type="button" size="sm" variant="primary" onClick={onSync} className="flex-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Synchroniser
          </Button>
        ) : (
          <Button type="button" size="sm" variant="primary" onClick={onConnect} className="flex-1">
            <Plug className="h-3.5 w-3.5" />
            Connecter
          </Button>
        )}
        <Button type="button" size="sm" variant="outline">
          <Settings className="h-3.5 w-3.5" />
          Configurer
        </Button>
      </div>
    </Card>
  );
}
