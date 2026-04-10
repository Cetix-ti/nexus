"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LogIn, Loader2 } from "lucide-react";

export default function PortalLoginPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msAvailable, setMsAvailable] = useState<boolean | null>(null);

  // Fetch CSRF token (so the credentials POST works)
  useEffect(() => {
    fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken))
      .catch(() => {});
  }, []);

  // Detect if MS provider is configured
  useEffect(() => {
    fetch("/api/auth/providers", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setMsAvailable(!!data?.["microsoft-entra-id"]))
      .catch(() => setMsAvailable(false));
  }, []);

  // Read sign-in error from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      if (err === "AccessDenied") {
        setError(
          "Votre compte n'est associé à aucune organisation cliente. Contactez votre administrateur."
        );
      } else if (err === "CredentialsSignin") {
        setError("Identifiants invalides. Veuillez réessayer.");
      } else {
        setError(`Erreur : ${err}`);
      }
    }
  }, []);

  async function handleMicrosoftSignIn() {
    setLoading(true);
    setError("");
    await signIn("microsoft-entra-id", { callbackUrl: "/portal" });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#F9FAFB]">
      {/* Logo + Branding */}
      <div className="mb-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/20 mb-4">
          <span className="text-xl font-bold text-white">N</span>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Portail client</h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          Connectez-vous pour accéder à vos billets et projets
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-7">
          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-100 px-3.5 py-2.5 text-[12.5px] text-red-700">
              {error}
            </div>
          )}

          {/* MICROSOFT SIGN IN */}
          <button
            type="button"
            onClick={handleMicrosoftSignIn}
            disabled={loading || msAvailable === false}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-[18px] w-[18px]" viewBox="0 0 23 23" fill="none">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
              </svg>
            )}
            Se connecter avec Microsoft
          </button>

          {msAvailable === false && (
            <p className="mt-2 text-[11px] text-neutral-400 text-center">
              Microsoft Entra ID non configuré. Configurez{" "}
              <code className="font-mono">AUTH_MICROSOFT_ENTRA_ID_ID</code> dans
              .env
            </p>
          )}

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              ou
            </span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          {/* CREDENTIALS SIGN IN — native form POST */}
          <form
            method="POST"
            action="/api/auth/callback/credentials"
            className="space-y-4"
          >
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="callbackUrl" value="/portal" />

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Adresse courriel
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@entreprise.com"
                className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-neutral-700">
                  Mot de passe
                </label>
                <button
                  type="button"
                  className="text-xs font-medium text-[#2563EB] hover:text-blue-700 transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  className="w-full rounded-lg border border-neutral-200 bg-[#F9FAFB] px-3.5 py-2.5 pr-10 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!csrfToken}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              Se connecter
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-neutral-400">
            En vous connectant, vous serez automatiquement associé à votre
            organisation cliente.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-neutral-400">
          Propulsé par{" "}
          <span className="font-semibold text-neutral-500">Nexus</span>
        </p>
      </div>
    </div>
  );
}
