"use client";

import { useState, useEffect } from "react";
import { signIn, getProviders } from "next-auth/react";
import Image from "next/image";

interface AuthProvider {
  id: string;
  name: string;
  type: string;
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProvider[]>([]);

  // Load available OAuth providers
  useEffect(() => {
    getProviders().then((p) => {
      if (p) {
        setProviders(
          Object.values(p).filter((pr) => pr.id !== "credentials")
        );
      }
    });
  }, []);

  // Read error from URL (NextAuth redirects with ?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(
        err === "CredentialsSignin"
          ? "Identifiants invalides. Veuillez réessayer."
          : err === "AccessDenied"
          ? "Accès refusé. Votre compte est peut-être désactivé."
          : `Erreur: ${err}`
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Identifiants invalides. Veuillez réessayer.");
        setLoading(false);
      } else if (result?.ok) {
        // Determine where to redirect based on user type
        try {
          // Try agent endpoint first
          const meRes = await fetch("/api/v1/me");
          if (meRes.ok) {
            const meData = await meRes.json();

            // Check MFA — set server-enforced cookie to block access until verified
            if (meData?.mfaEnabled) {
              document.cookie = "nexus-mfa-pending=true; path=/; max-age=600; SameSite=Lax";
              window.location.href = "/mfa-verify";
              return;
            }

            // Agent user — check role to decide destination
            const role = meData?.role;
            if (role && !role.startsWith("CLIENT_")) {
              window.location.href = "/dashboard";
              return;
            }
          }
        } catch {}

        // If not an agent or /me failed, check if portal user
        try {
          const portalRes = await fetch("/api/v1/portal/dashboard");
          if (portalRes.ok) {
            window.location.href = "/portal";
            return;
          }
        } catch {}

        // Fallback
        window.location.href = "/dashboard";
      } else if (result?.url) {
        window.location.href = result.url;
      } else {
        // Fallback: try redirect-based login
        await signIn("credentials", { email, password, callbackUrl: "/dashboard" });
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Erreur de connexion. Veuillez réessayer.");
      setLoading(false);
    }
  }

  function handleOAuthSignIn(providerId: string) {
    // OAuth: NextAuth handles redirect automatically
    // After successful auth, the signIn callback in auth.ts determines
    // if user is agent or portal client and sets the appropriate role
    signIn(providerId, { callbackUrl: "/auth-redirect" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/40 via-transparent to-transparent" />

      <div className="relative w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="bg-slate-900 rounded-2xl px-8 py-4">
            <Image
              src="/images/cetix-logo-blanc-horizontal-HD.png"
              alt="Nexus"
              width={160}
              height={52}
              priority
              className="h-10 w-auto"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 p-8">
          <div className="text-center mb-8">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Connexion</h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Agents et clients — accédez à votre espace
            </p>
          </div>

          {/* SSO Buttons */}
          {providers.length > 0 && (
            <div className="space-y-2.5 mb-6">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleOAuthSignIn(provider.id)}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  {provider.id === "microsoft-entra-id" && (
                    <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                    </svg>
                  )}
                  {provider.id === "google" && (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  )}
                  Se connecter avec {provider.name === "Microsoft Entra ID" ? "Microsoft" : provider.name}
                </button>
              ))}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-400">ou avec votre mot de passe</span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Adresse courriel
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="vous@entreprise.com"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Mot de passe
                </label>
                <a href="/reset-password" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  Mot de passe oublié ?
                </a>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Entrez votre mot de passe"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connexion...
                </span>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Nexus ITSM — Propulsé par Cetix
        </p>
      </div>
    </div>
  );
}
