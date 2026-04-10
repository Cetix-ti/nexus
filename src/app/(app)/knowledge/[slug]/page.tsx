"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useKbStore } from "@/stores/kb-store";
import { NewArticleModal } from "@/components/knowledge/new-article-modal";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  User,
  Clock,
  Tag,
  Wifi,
  BookOpen,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const FALLBACK_RELATED = [
  { slug: "connexion-wifi-corporatif", title: "Connexion au réseau Wi-Fi corporatif", category: "Réseau & VPN" },
  { slug: "reinitialisation-mot-de-passe", title: "Réinitialisation du mot de passe Active Directory", category: "Compte & Accès" },
  { slug: "activation-mfa-microsoft", title: "Activation de l'authentification multifacteur (MFA)", category: "Sécurité" },
];

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug as string;
  const stored = useKbStore((s) => s.articles.find((a) => a.slug === slug));
  const categories = useKbStore((s) => s.categories);
  const categoryName = stored?.categoryId
    ? categories.find((c) => c.id === stored.categoryId)?.name || "—"
    : "—";

  const [feedbackGiven, setFeedbackGiven] = useState<"yes" | "no" | null>(null);
  const [editing, setEditing] = useState(false);

  // Compose article object — prefer store data, fall back to static demo for old slug
  const article = stored
    ? {
        slug: stored.slug,
        title: stored.title,
        category: categoryName,
        categorySlug: stored.categoryId || "",
        status: stored.status,
        author: stored.author,
        authorRole: "",
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        views: stored.views,
        helpful: stored.helpful,
        tags: stored.tags,
        body: stored.body,
        summary: stored.summary,
        relatedArticles: FALLBACK_RELATED,
      }
    : {
        slug: "depannage-connexion-vpn",
        title: "Dépannage de la connexion VPN",
        category: "Réseau & VPN",
        categorySlug: "reseau",
        status: "published" as const,
        author: "Marc Bélanger",
        authorRole: "Technicien réseau senior",
        createdAt: "2024-09-15",
        updatedAt: "2025-03-28",
        views: 1247,
        helpful: 89,
        tags: ["VPN", "FortiClient", "Réseau"],
        body: "",
        summary: "",
        relatedArticles: FALLBACK_RELATED,
      };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-neutral-500">
        <Link href="/knowledge" className="hover:text-neutral-700">
          Base de connaissances
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/knowledge" className="hover:text-neutral-700">
          {article.category}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-neutral-900">{article.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Main content - 3/4 */}
        <div className="flex flex-col gap-6 lg:col-span-3">
          {/* Article header */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{article.category}</Badge>
                  <Badge variant="success">Publié</Badge>
                </div>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {article.title}
                </h1>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={!stored}
                title={stored ? "Modifier" : "Article démo non éditable"}
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-neutral-500">
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                <span>{article.author}</span>
                <span className="text-neutral-300">-</span>
                <span className="text-neutral-400">{article.authorRole}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span>
                  Mis à jour le{" "}
                  {new Date(article.updatedAt).toLocaleDateString("fr-CA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                <span>{article.views.toLocaleString("fr-CA")} vues</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ThumbsUp className="h-4 w-4" />
                <span>{article.helpful} trouvé utile</span>
              </div>
            </div>
          </div>

          {/* Article body */}
          <Card>
            <CardContent className="p-8">
              {stored && article.body ? (
                <div
                  className="tiptap prose prose-slate max-w-none"
                  dangerouslySetInnerHTML={{ __html: article.body }}
                />
              ) : (
              <div className="prose prose-neutral max-w-none">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Problème
                </h2>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Les utilisateurs peuvent rencontrer des difficultés à établir ou maintenir une connexion VPN via FortiClient.
                  Ce guide couvre les problèmes les plus fréquents et leurs solutions. La connexion VPN est essentielle pour
                  accéder aux ressources internes de l&apos;entreprise lors du travail à distance.
                </p>

                <h2 className="mt-8 text-xl font-semibold text-neutral-900">
                  Prérequis
                </h2>
                <ul className="mt-3 space-y-2 text-neutral-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    <span>FortiClient VPN version 7.0 ou supérieure installé sur votre poste</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    <span>Identifiants Active Directory valides (nom d&apos;utilisateur et mot de passe)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    <span>Authentification multifacteur (MFA) configurée sur votre compte Microsoft 365</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                    <span>Connexion Internet active et stable</span>
                  </li>
                </ul>

                <h2 className="mt-8 text-xl font-semibold text-neutral-900">
                  Étapes de dépannage
                </h2>

                <h3 className="mt-5 text-lg font-medium text-neutral-800">
                  Étape 1 : Vérifier votre connexion Internet
                </h3>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Avant tout, assurez-vous que votre connexion Internet fonctionne correctement. Ouvrez un navigateur
                  et essayez d&apos;accéder à un site externe comme <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">google.ca</code>.
                  Si le site ne se charge pas, le problème vient de votre connexion Internet et non du VPN.
                </p>

                <h3 className="mt-5 text-lg font-medium text-neutral-800">
                  Étape 2 : Redémarrer le client FortiClient
                </h3>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Fermez complètement FortiClient en faisant un clic droit sur l&apos;icône dans la barre des tâches et en
                  sélectionnant <strong>Quitter</strong>. Attendez 10 secondes, puis relancez l&apos;application. Tentez une
                  nouvelle connexion avec le profil <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">VPN-Cetix-Production</code>.
                </p>

                <h3 className="mt-5 text-lg font-medium text-neutral-800">
                  Étape 3 : Vérifier les identifiants
                </h3>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Assurez-vous d&apos;utiliser votre identifiant au format <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">prenom.nom@cetix.ca</code>.
                  Si votre mot de passe a été modifié récemment, utilisez le nouveau mot de passe. En cas de doute,
                  procédez à une réinitialisation via le portail en libre-service à{" "}
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">https://passwordreset.microsoftonline.com</code>.
                </p>

                <h3 className="mt-5 text-lg font-medium text-neutral-800">
                  Étape 4 : Vider le cache DNS
                </h3>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Ouvrez une invite de commandes en tant qu&apos;administrateur et exécutez les commandes suivantes :
                </p>
                <div className="mt-3 rounded-lg bg-neutral-900 p-4">
                  <code className="text-sm text-green-400">
                    <span className="text-neutral-500">C:\&gt;</span> ipconfig /flushdns
                    <br />
                    <span className="text-neutral-500">C:\&gt;</span> ipconfig /release
                    <br />
                    <span className="text-neutral-500">C:\&gt;</span> ipconfig /renew
                    <br />
                    <span className="text-neutral-500">C:\&gt;</span> netsh winsock reset
                  </code>
                </div>
                <p className="mt-3 leading-relaxed text-neutral-700">
                  Redémarrez votre ordinateur après avoir exécuté ces commandes, puis tentez à nouveau la connexion VPN.
                </p>

                <h3 className="mt-5 text-lg font-medium text-neutral-800">
                  Étape 5 : Vérifier le pare-feu local
                </h3>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Certains pare-feu ou logiciels de sécurité tiers peuvent bloquer la connexion VPN.
                  Vérifiez que les ports <strong>UDP 500</strong>, <strong>UDP 4500</strong> et <strong>TCP 443</strong> ne sont pas bloqués.
                  Si vous utilisez un réseau public (hôtel, café), essayez de passer en partage de connexion depuis votre téléphone
                  pour éliminer un éventuel blocage réseau.
                </p>

                <h2 className="mt-8 text-xl font-semibold text-neutral-900">
                  Si le problème persiste
                </h2>
                <p className="mt-2 leading-relaxed text-neutral-700">
                  Si aucune des étapes ci-dessus ne résout le problème, veuillez créer un ticket de support en incluant
                  les informations suivantes :
                </p>
                <ul className="mt-3 space-y-2 text-neutral-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                    <span>Capture d&apos;écran du message d&apos;erreur FortiClient</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                    <span>Résultat de la commande <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">ipconfig /all</code></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                    <span>Type de connexion Internet (domicile, Wi-Fi public, partage mobile)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
                    <span>Heure et date de la dernière tentative de connexion</span>
                  </li>
                </ul>
                <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-800">
                    Priorité : Si vous ne pouvez pas travailler sans le VPN, sélectionnez la priorité
                    &quot;Haute&quot; lors de la création du ticket. Un technicien vous contactera dans l&apos;heure.
                  </p>
                </div>
              </div>
              )}
            </CardContent>
          </Card>

          {/* Feedback */}
          <Card>
            <CardContent className="flex items-center justify-between p-5">
              <p className="text-sm font-medium text-neutral-700">
                Cet article vous a-t-il été utile ?
              </p>
              <div className="flex items-center gap-3">
                {feedbackGiven === null ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeedbackGiven("yes")}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Oui
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFeedbackGiven("no")}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Non
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    {feedbackGiven === "yes" ? (
                      <ThumbsUp className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ThumbsDown className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-sm text-neutral-600">
                      Merci pour votre retour !
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar - 1/4 */}
        <div className="flex flex-col gap-6">
          {/* Related articles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-neutral-400" />
                Articles connexes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {article.relatedArticles.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/knowledge/${related.slug}`}
                    className="group flex flex-col gap-1 rounded-lg border border-neutral-100 p-3 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
                  >
                    <p className="text-sm font-medium text-neutral-700 group-hover:text-blue-600">
                      {related.title}
                    </p>
                    <span className="text-xs text-neutral-400">
                      {related.category}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-neutral-400" />
                Étiquettes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Article info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-neutral-400" />
                Informations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Créé le</span>
                  <span className="text-neutral-900">
                    {new Date(article.createdAt).toLocaleDateString("fr-CA")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Modifié le</span>
                  <span className="text-neutral-900">
                    {new Date(article.updatedAt).toLocaleDateString("fr-CA")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Auteur</span>
                  <span className="text-neutral-900">{article.author}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Vues</span>
                  <span className="text-neutral-900">
                    {article.views.toLocaleString("fr-CA")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {stored && (
        <NewArticleModal
          open={editing}
          article={stored}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
