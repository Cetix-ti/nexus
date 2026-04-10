"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressResult {
  display: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
  label?: string;
}

export function AddressAutocomplete({ value, onChange, onSelect, placeholder, label }: Props) {
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (value.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(value)}&format=json&addressdetails=1&limit=5&countrycodes=ca,us`,
          { headers: { "User-Agent": "Nexus-ITSM/1.0" } },
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(
          data.map((item: any) => {
            const a = item.address ?? {};
            return {
              display: item.display_name,
              street: [a.house_number, a.road].filter(Boolean).join(" ") || "",
              city: a.city || a.town || a.village || a.municipality || "",
              province: a.state || a.province || "",
              postalCode: a.postcode || "",
              country: a.country || "",
            };
          }),
        );
        setOpen(true);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</label>
      )}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder ?? "Commencez à taper une adresse..."}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-8 text-[13px] text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(s);
                onChange(s.street || s.display.split(",")[0]);
                setOpen(false);
              }}
              className="flex items-start gap-2.5 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[12.5px] text-slate-900 truncate">{s.street || s.display.split(",")[0]}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {[s.city, s.province, s.postalCode, s.country].filter(Boolean).join(", ")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
