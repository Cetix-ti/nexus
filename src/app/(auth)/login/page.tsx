"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Read error from URL (NextAuth redirects with ?error=... on failure)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(
        err === "CredentialsSignin"
          ? "Identifiants invalides. Veuillez réessayer."
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
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      setError("Identifiants invalides. Veuillez réessayer.");
      setLoading(false);
    } else if (result?.ok) {
      window.location.href = "/dashboard";
    } else {
      setLoading(false);
    }
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
            <h1 className="text-2xl font-semibold text-slate-900">Connexion</h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Accédez à votre espace de gestion
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Adresse email
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
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Mot de passe
                </label>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mot de passe oublié ?
                </button>
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
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Connexion...
                </span>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8">
          Nexus ITSM &mdash; Propulsé par Cetix
        </p>
      </div>
    </div>
  );
}
