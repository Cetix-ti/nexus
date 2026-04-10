"use client";

import { useState, useEffect } from "react";
import {
  Globe,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Calendar,
  Cloud,
  Terminal,
  ExternalLink,
  Copy,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface DomainConfig {
  subdomain: string;
  rootDomain: string;
  fullDomain: string;
  dnsConfigured: boolean;
  lastDnsSyncAt?: string;
  forceHttps: boolean;
  autoRenewEnabled: boolean;
  lastRenewedAt?: string;
  acmeEmail?: string;
  updatedAt: string;
  updatedBy?: string;
}

interface CertStatus {
  isInstalled: boolean;
  domain: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  fingerprint?: string;
  autoRenewActive: boolean;
  errorMessage?: string;
}

interface CertbotAvailability {
  certbot: boolean;
  cloudflarePlugin: boolean;
  version?: string;
  error?: string;
}

interface CloudflareTest {
  tokenValid?: boolean;
  tokenError?: string;
  zoneFound?: boolean;
  zoneError?: string;
  zoneId?: string;
  fullDomain?: string;
  serverIp?: string;
  existingRecords?: Array<{ id: string; type: string; content: string }>;
  dnsConfigured?: boolean;
  dnsMatchesServer?: boolean;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-blue-600" : "bg-slate-300"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow translate-y-0.5",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function PortalDomainSection() {
  const [config, setConfig] = useState<DomainConfig | null>(null);
  const [certStatus, setCertStatus] = useState<CertStatus | null>(null);
  const [availability, setAvailability] = useState<CertbotAvailability | null>(
    null
  );
  const [cfTest, setCfTest] = useState<CloudflareTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingCf, setTestingCf] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewalOutput, setRenewalOutput] = useState<string | null>(null);
  const [renewalSuccess, setRenewalSuccess] = useState<boolean | null>(null);

  // Form state
  const [subdomain, setSubdomain] = useState("");
  const [acmeEmail, setAcmeEmail] = useState("");
  const [forceHttps, setForceHttps] = useState(true);
  const [autoRenew, setAutoRenew] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        fetch("/api/v1/portal-domain").then((r) => r.json()),
        fetch("/api/v1/portal-domain/cert-status").then((r) => r.json()),
      ]);
      if (c.success) {
        setConfig(c.data);
        setSubdomain(c.data.subdomain);
        setAcmeEmail(c.data.acmeEmail || "");
        setForceHttps(c.data.forceHttps);
        setAutoRenew(c.data.autoRenewEnabled);
      }
      if (s.success) {
        setCertStatus(s.data.certificate);
        setAvailability(s.data.availability);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSave(syncDns: boolean) {
    setSaving(true);
    setRenewalOutput(null);
    try {
      const res = await fetch("/api/v1/portal-domain", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subdomain,
          acmeEmail,
          forceHttps,
          autoRenewEnabled: autoRenew,
          syncDns,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
      } else {
        alert(json.error || "Erreur d'enregistrement");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTestCloudflare() {
    setTestingCf(true);
    setCfTest(null);
    try {
      const res = await fetch("/api/v1/portal-domain/test-cloudflare");
      const json = await res.json();
      setCfTest(json.data);
    } finally {
      setTestingCf(false);
    }
  }

  async function handleTestRenewal(dryRun: boolean) {
    setRenewing(true);
    setRenewalOutput(null);
    setRenewalSuccess(null);
    try {
      const res = await fetch("/api/v1/portal-domain/test-renewal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = await res.json();
      setRenewalSuccess(json.success);
      setRenewalOutput(
        json.data?.output ||
          json.data?.error ||
          json.error ||
          "Aucune sortie"
      );
      // Refresh cert status after a real renewal
      if (!dryRun && json.success) {
        setTimeout(loadAll, 1000);
      }
    } catch (err) {
      setRenewalSuccess(false);
      setRenewalOutput(err instanceof Error ? err.message : String(err));
    } finally {
      setRenewing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-7 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const fullDomain = `${subdomain || "—"}.cetix.ca`;
  const certInstalled = certStatus?.isInstalled;
  const expiringSoon =
    typeof certStatus?.daysUntilExpiry === "number" &&
    certStatus.daysUntilExpiry < 30;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
            Domaine du portail
          </h2>
          <Badge variant="danger">Super-admin</Badge>
        </div>
        <p className="mt-1 text-[13px] text-slate-500">
          Configurez l&apos;URL publique du portail client et le renouvellement
          SSL automatique via Cloudflare DNS
        </p>
      </div>

      {/* SUBDOMAIN CARD */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 ring-1 ring-inset ring-blue-200/60 shrink-0">
              <Globe className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-slate-900">
                URL du portail
              </h3>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                Le domaine racine <code className="font-mono">cetix.ca</code> est
                figé. Vous pouvez uniquement modifier le sous-domaine.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Sous-domaine
            </label>
            <div className="flex items-center">
              <input
                type="text"
                value={subdomain}
                onChange={(e) =>
                  setSubdomain(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                  )
                }
                placeholder="nexus"
                className="flex h-10 w-40 rounded-l-lg border border-r-0 border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="inline-flex h-10 items-center rounded-r-lg border border-slate-200 bg-slate-50 px-3.5 text-[13px] font-mono text-slate-500">
                .cetix.ca
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-400">
              URL complète :{" "}
              <span className="font-mono text-blue-600">
                https://{fullDomain}
              </span>
            </p>
          </div>

          <div>
            <Input
              label="Adresse courriel ACME (Let's Encrypt)"
              type="email"
              value={acmeEmail}
              onChange={(e) => setAcmeEmail(e.target.value)}
              placeholder="admin@cetix.ca"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-slate-700">
                  Forcer HTTPS
                </p>
                <p className="text-[11.5px] text-slate-500">
                  Redirige automatiquement HTTP → HTTPS
                </p>
              </div>
              <Toggle checked={forceHttps} onChange={setForceHttps} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-slate-700">
                  Renouvellement automatique
                </p>
                <p className="text-[11.5px] text-slate-500">
                  Le certificat sera renouvelé tous les 60 jours
                </p>
              </div>
              <Toggle checked={autoRenew} onChange={setAutoRenew} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              loading={saving}
              onClick={() => handleSave(false)}
            >
              Enregistrer
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={() => handleSave(true)}
            >
              <Cloud className="h-3.5 w-3.5" strokeWidth={2.25} />
              Enregistrer + Synchroniser DNS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CLOUDFLARE CARD */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 ring-1 ring-inset ring-orange-200/60 shrink-0">
              <Cloud className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[14px] font-semibold text-slate-900">
                Intégration Cloudflare
              </h3>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                Le token API doit être configuré dans{" "}
                <code className="font-mono">CLOUDFLARE_API_TOKEN</code> côté
                serveur
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={testingCf}
              onClick={handleTestCloudflare}
            >
              <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
              Tester
            </Button>
          </div>

          {cfTest && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <CheckRow
                ok={cfTest.tokenValid}
                label="Token API valide"
                detail={cfTest.tokenError}
              />
              <CheckRow
                ok={cfTest.zoneFound}
                label="Zone cetix.ca trouvée"
                detail={cfTest.zoneError || cfTest.zoneId}
              />
              <CheckRow
                ok={cfTest.dnsConfigured}
                label="Enregistrement DNS configuré"
                detail={
                  cfTest.existingRecords && cfTest.existingRecords.length > 0
                    ? `${cfTest.existingRecords[0].type} → ${cfTest.existingRecords[0].content}`
                    : "Aucun enregistrement trouvé"
                }
              />
              {typeof cfTest.dnsMatchesServer === "boolean" && (
                <CheckRow
                  ok={cfTest.dnsMatchesServer}
                  label="DNS pointe vers ce serveur"
                  detail={
                    cfTest.serverIp
                      ? `IP serveur : ${cfTest.serverIp}`
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CERTIFICATE CARD */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-inset shrink-0",
                certInstalled && !expiringSoon
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-200/60"
                  : expiringSoon
                  ? "bg-amber-50 text-amber-600 ring-amber-200/60"
                  : "bg-slate-50 text-slate-500 ring-slate-200/60"
              )}
            >
              {certInstalled ? (
                <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
              ) : (
                <Shield className="h-5 w-5" strokeWidth={2.25} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-slate-900">
                  Certificat SSL
                </h3>
                {certInstalled ? (
                  expiringSoon ? (
                    <Badge variant="warning">Expire bientôt</Badge>
                  ) : (
                    <Badge variant="success">Actif</Badge>
                  )
                ) : (
                  <Badge variant="default">Non installé</Badge>
                )}
                {certStatus?.autoRenewActive && (
                  <Badge variant="primary">
                    <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.5} />
                    Auto-renouvellement actif
                  </Badge>
                )}
              </div>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                {certStatus?.domain || fullDomain}
              </p>
            </div>
          </div>

          {certInstalled && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-[12px]">
              <Field label="Émetteur" value={certStatus?.issuer || "—"} />
              <Field
                label="Jours restants"
                value={
                  typeof certStatus?.daysUntilExpiry === "number"
                    ? `${certStatus.daysUntilExpiry} j`
                    : "—"
                }
                accent={
                  expiringSoon ? "danger" : "success"
                }
              />
              <Field
                label="Valide depuis"
                value={
                  certStatus?.validFrom
                    ? new Date(certStatus.validFrom).toLocaleDateString("fr-CA")
                    : "—"
                }
              />
              <Field
                label="Expire le"
                value={
                  certStatus?.validTo
                    ? new Date(certStatus.validTo).toLocaleDateString("fr-CA")
                    : "—"
                }
              />
            </div>
          )}

          {certStatus?.errorMessage && (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200/60 px-3 py-2 text-[11.5px] text-amber-700">
              {certStatus.errorMessage}
            </div>
          )}

          {availability && (
            <div className="space-y-1.5 pt-3 border-t border-slate-100">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                Environnement serveur
              </p>
              <CheckRow
                ok={availability.certbot}
                label="certbot installé"
                detail={availability.version || availability.error}
              />
              <CheckRow
                ok={availability.cloudflarePlugin}
                label="Plugin DNS Cloudflare disponible"
                detail={
                  availability.cloudflarePlugin
                    ? "python3-certbot-dns-cloudflare"
                    : "À installer"
                }
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              loading={renewing}
              onClick={() => handleTestRenewal(true)}
            >
              <Terminal className="h-3 w-3" strokeWidth={2.25} />
              Tester (dry-run)
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={renewing}
              onClick={() => handleTestRenewal(false)}
            >
              <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
              Renouveler maintenant
            </Button>
          </div>

          {/* Renewal output */}
          {renewalOutput && (
            <div
              className={cn(
                "rounded-lg ring-1 ring-inset overflow-hidden",
                renewalSuccess
                  ? "bg-emerald-50/40 ring-emerald-200/60"
                  : "bg-red-50/40 ring-red-200/60"
              )}
            >
              <div
                className={cn(
                  "px-3 py-2 flex items-center gap-2 text-[12px] font-semibold border-b",
                  renewalSuccess
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                    : "bg-red-50 text-red-700 border-red-200/60"
                )}
              >
                {renewalSuccess ? (
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                )}
                {renewalSuccess
                  ? "Test de renouvellement réussi"
                  : "Échec du test de renouvellement"}
              </div>
              <pre className="p-3 text-[10.5px] font-mono text-slate-700 max-h-72 overflow-auto whitespace-pre-wrap">
                {renewalOutput}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* INSTRUCTIONS — collapsed by default */}
      <Card className="border-blue-200/60 bg-blue-50/30">
        <CardContent className="p-5">
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="text-[13px] font-semibold text-slate-900 inline-flex items-center gap-2">
              <Terminal className="h-4 w-4 text-blue-600" strokeWidth={2.25} />
              Instructions d&apos;installation initiale
            </h3>
            <span className="text-[12px] text-blue-600 font-medium">
              {showInstructions ? "Masquer" : "Afficher"}
            </span>
          </button>
          {showInstructions && (
          <>
          <p className="text-[12px] text-slate-600 mb-3 mt-2">
            Si certbot n&apos;est pas installé, exécutez ces commandes une seule fois :
          </p>
          <div className="space-y-2">
            <CodeBlock
              label="1. Installer certbot + plugin Cloudflare"
              code={`sudo apt update
sudo apt install -y certbot python3-certbot-dns-cloudflare`}
            />
            <CodeBlock
              label="2. Créer le fichier credentials Cloudflare"
              code={`sudo mkdir -p /etc/letsencrypt
sudo tee /etc/letsencrypt/cloudflare.ini > /dev/null <<EOF
dns_cloudflare_api_token = VOTRE_TOKEN_CLOUDFLARE
EOF
sudo chmod 600 /etc/letsencrypt/cloudflare.ini`}
            />
            <CodeBlock
              label="3. Activer le timer systemd de renouvellement"
              code={`sudo systemctl enable --now certbot.timer
systemctl status certbot.timer`}
            />
            <CodeBlock
              label="4. Émission initiale du certificat (à faire une fois après avoir cliqué « Synchroniser DNS »)"
              code={`sudo certbot certonly \\
  --dns-cloudflare \\
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \\
  --dns-cloudflare-propagation-seconds 30 \\
  -d ${fullDomain} \\
  --email ${acmeEmail || "admin@cetix.ca"} \\
  --agree-tos \\
  --non-interactive`}
            />
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CheckRow({
  ok,
  label,
  detail,
}: {
  ok?: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
      ) : ok === false ? (
        <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-[12px] text-slate-700">{label}</p>
        {detail && (
          <p className="text-[10.5px] text-slate-500 font-mono break-all">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-medium",
          accent === "success" && "text-emerald-700",
          accent === "danger" && "text-red-700",
          !accent && "text-slate-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-slate-700">{label}</p>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[10.5px] text-blue-600 hover:text-blue-700"
        >
          <Copy className="h-2.5 w-2.5" />
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
      <pre className="rounded-md bg-slate-900 text-slate-100 px-3 py-2.5 text-[11px] font-mono overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
