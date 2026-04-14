/**
 * Restructure the Category table with a proper 3-level MSP taxonomy.
 *
 * Strategy:
 *   1. Soft-deactivate all existing categories (isActive = false).
 *      Existing tickets keep their categoryId — the name still resolves via
 *      the Prisma relation. But the UI dropdowns (which filter by
 *      isActive=true) no longer show them.
 *   2. Insert a fresh 3-level hierarchy of active categories.
 *
 * Run with:
 *   npx tsx scripts/restructure-categories.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

interface LeafOrNode {
  name: string;
  children?: LeafOrNode[];
}

// ============================================================================
// MSP 3-level taxonomy — designed for typical Cetix-style MSP ticket flow
// Level 1 = service area, Level 2 = category, Level 3 = specific issue/topic
// ============================================================================

const TAXONOMY: {
  name: string;
  icon?: string;
  children: LeafOrNode[];
}[] = [
  {
    name: "Matériel informatique",
    icon: "monitor",
    children: [
      {
        name: "Poste de travail",
        children: [
          { name: "Ordinateur fixe" },
          { name: "Ordinateur portable" },
          { name: "Moniteur / Écran" },
          { name: "Clavier / Souris" },
          { name: "Casque / Audio" },
          { name: "Webcam" },
          { name: "Remplacement matériel" },
        ],
      },
      {
        name: "Imprimante",
        children: [
          { name: "Installation" },
          { name: "Panne" },
          { name: "Bourrage / Qualité d'impression" },
          { name: "Consommables (toner, cartouche)" },
          { name: "Pilote / Configuration" },
        ],
      },
      {
        name: "Serveur physique",
        children: [
          { name: "Panne matérielle" },
          { name: "Remplacement de composant" },
          { name: "Mise à niveau" },
          { name: "Alerte de santé" },
        ],
      },
      {
        name: "Équipement mobile",
        children: [
          { name: "Téléphone intelligent" },
          { name: "Tablette" },
          { name: "Configuration MDM" },
        ],
      },
      {
        name: "Périphériques",
        children: [
          { name: "Scanner" },
          { name: "Lecteur de code-barres" },
          { name: "Disque externe / USB" },
          { name: "Audio / Visuel" },
        ],
      },
      {
        name: "Onduleur (UPS)",
        children: [
          { name: "Panne" },
          { name: "Remplacement de batterie" },
          { name: "Configuration" },
        ],
      },
    ],
  },
  {
    name: "Logiciels & applications",
    icon: "file-code",
    children: [
      {
        name: "Microsoft Office",
        children: [
          { name: "Outlook" },
          { name: "Word" },
          { name: "Excel" },
          { name: "PowerPoint" },
          { name: "OneNote" },
        ],
      },
      {
        name: "Système d'exploitation",
        children: [
          { name: "Windows 10/11" },
          { name: "Windows Server" },
          { name: "macOS" },
          { name: "Linux" },
          { name: "Mise à jour / Patch" },
        ],
      },
      {
        name: "Application métier",
        children: [
          { name: "Installation" },
          { name: "Erreur / Plantage" },
          { name: "Configuration" },
          { name: "Licence" },
          { name: "Mise à jour" },
          { name: "Intégration" },
        ],
      },
      {
        name: "Navigateur web",
        children: [
          { name: "Chrome" },
          { name: "Edge" },
          { name: "Firefox" },
          { name: "Safari" },
        ],
      },
      {
        name: "Antivirus / Endpoint",
        children: [
          { name: "Bitdefender" },
          { name: "Détection / Alerte" },
          { name: "Installation / Désinstallation" },
          { name: "Exclusion / Faux positif" },
        ],
      },
    ],
  },
  {
    name: "Réseau & Connectivité",
    icon: "wifi",
    children: [
      {
        name: "Internet",
        children: [
          { name: "Panne totale" },
          { name: "Lenteur" },
          { name: "Connexion intermittente" },
          { name: "Nouveau service" },
        ],
      },
      {
        name: "Wi-Fi",
        children: [
          { name: "Impossible de se connecter" },
          { name: "Signal faible" },
          { name: "Ajout de point d'accès" },
          { name: "Réseau invité / SSID" },
        ],
      },
      {
        name: "VPN",
        children: [
          { name: "Connexion impossible" },
          { name: "Configuration utilisateur" },
          { name: "Performance" },
          { name: "VPN site à site" },
        ],
      },
      {
        name: "Commutateur / Switch",
        children: [
          { name: "Panne" },
          { name: "Configuration de port" },
          { name: "VLAN" },
          { name: "PoE" },
        ],
      },
      {
        name: "Pare-feu / Firewall",
        children: [
          { name: "Règle d'accès" },
          { name: "Panne / Redémarrage" },
          { name: "Mise à jour de firmware" },
          { name: "Politique de filtrage" },
        ],
      },
      {
        name: "DNS / DHCP",
        children: [
          { name: "Résolution de nom" },
          { name: "Attribution IP" },
          { name: "Réservation DHCP" },
        ],
      },
    ],
  },
  {
    name: "Sécurité",
    icon: "shield",
    children: [
      {
        name: "Phishing / Hameçonnage",
        children: [
          { name: "Courriel suspect signalé" },
          { name: "Site frauduleux" },
          { name: "Compte potentiellement compromis" },
        ],
      },
      {
        name: "Antivirus / EDR",
        children: [
          { name: "Alerte critique" },
          { name: "Quarantaine" },
          { name: "Analyse à la demande" },
        ],
      },
      {
        name: "Incident de sécurité",
        children: [
          { name: "Intrusion suspectée" },
          { name: "Ransomware" },
          { name: "Fuite de données" },
          { name: "Perte d'appareil" },
        ],
      },
      {
        name: "Authentification",
        children: [
          { name: "MFA / 2FA" },
          { name: "Mot de passe oublié" },
          { name: "Compte bloqué / verrouillé" },
          { name: "Jeton matériel" },
        ],
      },
      {
        name: "Conformité & Politique",
        children: [
          { name: "Audit" },
          { name: "Politique de sécurité" },
          { name: "Formation utilisateur" },
        ],
      },
    ],
  },
  {
    name: "Téléphonie & Communication",
    icon: "phone",
    children: [
      {
        name: "Téléphonie IP",
        children: [
          { name: "Configuration de poste" },
          { name: "Panne d'appel" },
          { name: "Transfert d'appel" },
          { name: "Ligne sortante" },
        ],
      },
      {
        name: "Visioconférence",
        children: [
          { name: "Microsoft Teams" },
          { name: "Zoom" },
          { name: "Équipement de salle" },
        ],
      },
      {
        name: "Messagerie vocale",
        children: [
          { name: "Configuration" },
          { name: "Accès à distance" },
        ],
      },
      {
        name: "Salle de conférence",
        children: [
          { name: "Microphone / Haut-parleur" },
          { name: "Écran / Projecteur" },
        ],
      },
    ],
  },
  {
    name: "Sauvegardes & Restauration",
    icon: "database",
    children: [
      {
        name: "Veeam Backup",
        children: [
          { name: "Échec de sauvegarde" },
          { name: "Configuration initiale" },
          { name: "Nouveau poste / serveur" },
          { name: "Alerte / Monitoring" },
        ],
      },
      {
        name: "Restauration",
        children: [
          { name: "Fichier individuel" },
          { name: "Boîte de courriel" },
          { name: "Serveur complet" },
          { name: "Base de données" },
        ],
      },
      {
        name: "Test de restauration",
        children: [
          { name: "Planifié" },
          { name: "Ad hoc" },
        ],
      },
      {
        name: "Archivage longue durée",
        children: [
          { name: "Archive" },
          { name: "Purge" },
        ],
      },
    ],
  },
  {
    name: "Infrastructure serveur",
    icon: "server",
    children: [
      {
        name: "Windows Server",
        children: [
          { name: "Active Directory" },
          { name: "Stratégies de groupe (GPO)" },
          { name: "DNS interne" },
          { name: "Performance / Lenteur" },
          { name: "Mise à jour / Patch" },
        ],
      },
      {
        name: "Hyperviseur",
        children: [
          { name: "VMware ESXi / vCenter" },
          { name: "Hyper-V" },
          { name: "Proxmox" },
          { name: "Autre" },
        ],
      },
      {
        name: "Stockage",
        children: [
          { name: "NAS" },
          { name: "SAN" },
          { name: "Capacité disque" },
          { name: "Performance" },
        ],
      },
      {
        name: "Base de données",
        children: [
          { name: "SQL Server" },
          { name: "MySQL / MariaDB" },
          { name: "PostgreSQL" },
          { name: "Sauvegarde / Restauration" },
        ],
      },
    ],
  },
  {
    name: "Microsoft 365 & Cloud",
    icon: "cloud",
    children: [
      {
        name: "Exchange Online",
        children: [
          { name: "Boîte partagée" },
          { name: "Groupe de distribution" },
          { name: "Calendrier" },
          { name: "Règle de transport" },
          { name: "Anti-spam / Filtrage" },
        ],
      },
      {
        name: "SharePoint Online",
        children: [
          { name: "Site d'équipe" },
          { name: "Permissions" },
          { name: "Migration" },
        ],
      },
      {
        name: "OneDrive for Business",
        children: [
          { name: "Synchronisation" },
          { name: "Espace de stockage" },
          { name: "Partage externe" },
        ],
      },
      {
        name: "Microsoft Teams",
        children: [
          { name: "Équipe / Canal" },
          { name: "Réunion" },
          { name: "Téléphonie Teams" },
          { name: "Application intégrée" },
        ],
      },
      {
        name: "Azure",
        children: [
          { name: "Machine virtuelle" },
          { name: "Stockage" },
          { name: "Réseau virtuel" },
          { name: "Entra ID (Azure AD)" },
        ],
      },
      {
        name: "Licences & Abonnements",
        children: [
          { name: "Attribution" },
          { name: "Facturation" },
          { name: "Achat / Renouvellement" },
        ],
      },
    ],
  },
  {
    name: "Comptes & Accès",
    icon: "user",
    children: [
      {
        name: "Nouvel employé (onboarding)",
        children: [
          { name: "Création de compte" },
          { name: "Configuration du poste" },
          { name: "Attribution de licences" },
          { name: "Accès applications" },
          { name: "Formation initiale" },
        ],
      },
      {
        name: "Départ d'employé (offboarding)",
        children: [
          { name: "Désactivation de compte" },
          { name: "Transfert de données" },
          { name: "Révocation d'accès" },
          { name: "Récupération d'équipement" },
        ],
      },
      {
        name: "Changement de rôle",
        children: [
          { name: "Ajout de permissions" },
          { name: "Retrait de permissions" },
          { name: "Transfert de poste" },
        ],
      },
      {
        name: "Mot de passe",
        children: [
          { name: "Réinitialisation" },
          { name: "Déverrouillage de compte" },
          { name: "Expiration" },
        ],
      },
    ],
  },
  {
    name: "Support utilisateur",
    icon: "help-circle",
    children: [
      {
        name: "Question / Comment faire",
        children: [
          { name: "Logiciel" },
          { name: "Matériel" },
          { name: "Service Cloud" },
        ],
      },
      {
        name: "Formation",
        children: [
          { name: "Office 365" },
          { name: "Logiciel spécifique" },
          { name: "Sécurité" },
        ],
      },
      {
        name: "Relocalisation",
        children: [
          { name: "Déplacement de poste" },
          { name: "Changement de bureau" },
          { name: "Télétravail" },
        ],
      },
      {
        name: "Demande d'information",
        children: [
          { name: "Service" },
          { name: "Produit" },
          { name: "Inventaire" },
        ],
      },
      {
        name: "Commande d'équipement",
        children: [
          { name: "Soumission" },
          { name: "Commande" },
          { name: "Réception" },
        ],
      },
    ],
  },
  {
    name: "Projets & Changements",
    icon: "folder-kanban",
    children: [
      {
        name: "Nouveau projet",
        children: [
          { name: "Migration" },
          { name: "Déploiement" },
          { name: "Implémentation" },
        ],
      },
      {
        name: "Demande de changement",
        children: [
          { name: "Standard" },
          { name: "Urgent" },
          { name: "Majeur" },
        ],
      },
      {
        name: "Planification",
        children: [
          { name: "Évaluation" },
          { name: "Conception" },
        ],
      },
      {
        name: "Documentation",
        children: [
          { name: "Procédure" },
          { name: "Diagramme" },
          { name: "Wiki client" },
        ],
      },
    ],
  },
  {
    name: "Surveillance & Monitoring",
    icon: "activity",
    children: [
      {
        name: "Alertes",
        children: [
          { name: "Zabbix" },
          { name: "Atera" },
          { name: "Wazuh" },
          { name: "FortiGate / FortiMail" },
          { name: "SNMP / Autres" },
        ],
      },
      {
        name: "Rapports",
        children: [
          { name: "Hebdomadaire" },
          { name: "Mensuel" },
          { name: "Ad hoc" },
        ],
      },
      {
        name: "Configuration de sonde",
        children: [
          { name: "Ajout" },
          { name: "Modification" },
          { name: "Retrait" },
        ],
      },
    ],
  },
  {
    name: "Facturation & Administration",
    icon: "receipt",
    children: [
      {
        name: "Facturation",
        children: [
          { name: "Question de facturation" },
          { name: "Correction" },
          { name: "Paiement" },
        ],
      },
      {
        name: "Contrat / Entente",
        children: [
          { name: "Renouvellement" },
          { name: "Modification" },
          { name: "Résiliation" },
        ],
      },
      {
        name: "Rapports",
        children: [
          { name: "Rapport mensuel" },
          { name: "Heures consommées" },
          { name: "Rapport d'incident" },
        ],
      },
      {
        name: "Soumission",
        children: [
          { name: "Matériel" },
          { name: "Services" },
          { name: "Projet" },
        ],
      },
    ],
  },
  {
    name: "Autre / À classer",
    icon: "help-circle",
    children: [
      {
        name: "Non classifié",
        children: [
          { name: "À déterminer" },
        ],
      },
    ],
  },
];

async function main() {
  console.log("=== Restructure catégories de tickets ===\n");

  // Snapshot existing state
  const existingCount = await prisma.category.count();
  const ticketsWithCategory = await prisma.ticket.count({
    where: { categoryId: { not: null } },
  });
  console.log(`État actuel : ${existingCount} catégories, ${ticketsWithCategory} tickets catégorisés`);

  // Step 1: soft-deactivate all existing categories
  const deactivated = await prisma.category.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });
  console.log(`\nÉtape 1 : ${deactivated.count} anciennes catégories désactivées (conservées pour les tickets existants)`);

  // Step 2: build the new 3-level hierarchy
  let totalCreated = 0;
  let rootCount = 0;
  let subCount = 0;
  let leafCount = 0;

  console.log("\nÉtape 2 : création de la nouvelle taxonomie 3 niveaux...");

  for (const [i, topNode] of TAXONOMY.entries()) {
    const topSortOrder = i * 1000;
    const topCat = await prisma.category.create({
      data: {
        name: topNode.name,
        icon: topNode.icon ?? null,
        sortOrder: topSortOrder,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    totalCreated++;
    rootCount++;

    for (const [j, subNode] of (topNode.children ?? []).entries()) {
      const subCat = await prisma.category.create({
        data: {
          name: subNode.name,
          parentId: topCat.id,
          sortOrder: topSortOrder + (j + 1) * 10,
          isActive: true,
        },
        select: { id: true },
      });
      totalCreated++;
      subCount++;

      for (const [k, leafNode] of (subNode.children ?? []).entries()) {
        await prisma.category.create({
          data: {
            name: leafNode.name,
            parentId: subCat.id,
            sortOrder: topSortOrder + (j + 1) * 10 + (k + 1),
            isActive: true,
          },
        });
        totalCreated++;
        leafCount++;
      }
    }
  }

  console.log(`\nCréé ${totalCreated} catégories :`);
  console.log(`  - Niveau 1 (parents)   : ${rootCount}`);
  console.log(`  - Niveau 2 (sous-cats) : ${subCount}`);
  console.log(`  - Niveau 3 (feuilles)  : ${leafCount}`);

  // Verify
  const finalActive = await prisma.category.count({ where: { isActive: true } });
  const finalRoots = await prisma.category.count({
    where: { isActive: true, parentId: null },
  });
  console.log(`\nÉtat final : ${finalActive} catégories actives (${finalRoots} racines)`);
  console.log("Les anciennes catégories restent en DB mais cachées des dropdowns.");
  console.log("Les tickets existants conservent leur categoryId d'origine.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ERREUR:", err);
  process.exit(1);
});
