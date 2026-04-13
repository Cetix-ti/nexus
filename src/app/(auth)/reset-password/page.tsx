"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { KeyRound, CheckCircle2, AlertTriangle, Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Request form (enter email to get a reset link)
// ---------------------------------------------------------------------------
function RequestForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/users/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError(data.error || "Erreur");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Mail className="h-10 w-10 text-blue-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-slate-900">Courriel envoyé</h1>
            <p className="mt-2 text-[13px] text-slate-500">
              Si un compte est associé à <strong>{email}</strong>, vous recevrez un courriel avec un lien de réinitialisation.
            </p>
            <p className="mt-1 text-[12px] text-slate-400">Vérifiez également vos courriels indésirables.</p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 font-medium">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <KeyRound className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Mot de passe oublié ?</h1>
            <p className="mt-1 text-[13px] text-slate-500">Entrez votre adresse courriel pour recevoir un lien de réinitialisation</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Adresse courriel" type="email" placeholder="exemple@entreprise.ca" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">{error}</div>}
            <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!email.trim()}>
              <Mail className="h-4 w-4" /> Envoyer le lien de réinitialisation
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/login" className="text-[12px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-3 w-3 inline mr-1" /> Retour à la connexion
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reset form (enter new password with token)
// ---------------------------------------------------------------------------
function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setResult({ ok: false, message: "Le mot de passe doit contenir au moins 8 caractères" }); return; }
    if (password !== confirm) { setResult({ ok: false, message: "Les mots de passe ne correspondent pas" }); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      setResult(data.success
        ? { ok: true, message: "Mot de passe modifié avec succès !" }
        : { ok: false, message: data.error || "Erreur" });
    } catch {
      setResult({ ok: false, message: "Erreur réseau" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <div className="mx-auto h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <KeyRound className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Nouveau mot de passe</h1>
            <p className="mt-1 text-[13px] text-slate-500">Choisissez un nouveau mot de passe pour votre compte</p>
          </div>

          {result?.ok ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="text-[14px] font-medium text-emerald-700">{result.message}</p>
              <Button onClick={() => window.location.href = "/login"}>Se connecter</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Nouveau mot de passe" type="password" placeholder="Minimum 8 caractères" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Input label="Confirmer le mot de passe" type="password" placeholder="Répétez le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {result && !result.ok && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">{result.message}</div>
              )}
              <Button type="submit" variant="primary" className="w-full" loading={loading}>
                Réinitialiser le mot de passe
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link href="/login" className="text-[12px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-3 w-3 inline mr-1" /> Retour à la connexion
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function ResetPasswordRouter() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (token) return <ResetForm token={token} />;
  return <RequestForm />;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordRouter /></Suspense>;
}
