"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function MfaVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError("Entrez un code à 6 chiffres");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/me/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "verify" }),
      });

      if (res.ok) {
        // MFA verified — clear the pending cookie and redirect
        document.cookie = "nexus-mfa-pending=; path=/; max-age=0";
        window.location.href = "/dashboard";
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Code invalide");
      }
    } catch {
      setError("Erreur de vérification");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent" />

      <div className="relative w-full max-w-md px-6">
        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 p-8">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
              <Shield className="h-7 w-7 text-blue-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              Vérification MFA
            </h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Entrez le code à 6 chiffres de votre application d&apos;authentification
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}

            <Input
              label="Code MFA"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />

            <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={code.length !== 6}>
              Vérifier
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Nexus ITSM — Propulsé par Cetix
        </p>
      </div>
    </div>
  );
}
