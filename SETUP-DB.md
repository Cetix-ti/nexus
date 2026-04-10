# Nexus — Mise en route base de données

PostgreSQL 16 + MinIO (S3-compatible) + Redis, le tout via docker compose.

## 1. Démarrer l'infrastructure

```bash
cd /opt/nexus
docker compose up -d
```

Cela démarre :
- **postgres** sur `localhost:5432` (user `nexus`, password `nexus`, db `nexus`)
- **minio** sur `localhost:9000` (API S3) et `localhost:9001` (console web — `nexus` / `nexus-dev-secret`)
- **redis** sur `localhost:6379`

Vérification :
```bash
docker compose ps
docker compose logs postgres | tail -20
```

## 2. Variables d'environnement

`/opt/nexus/.env` doit contenir au minimum :

```env
DATABASE_URL="postgresql://nexus:nexus@localhost:5432/nexus"
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="nexus"
S3_SECRET_KEY="nexus-dev-secret"
S3_BUCKET="nexus"
REDIS_URL="redis://localhost:6379"
```

(Le fichier `.env` existe déjà avec `DATABASE_URL` correct.)

## 3. Appliquer le schema Prisma

Première fois (création des tables) :

```bash
npx prisma migrate dev --name init
```

Prisma va lire `prisma/schema.prisma`, générer une migration SQL initiale, l'appliquer, puis générer le client TypeScript dans `node_modules/@prisma/client`.

Pour les changements ultérieurs :

```bash
npx prisma migrate dev --name <nom-changement>
```

## 4. Seed initial (extensions FR + données KB)

```bash
npm run db:seed
```

Le script `prisma/seed.ts` va :
1. Activer `pgcrypto` et `unaccent` (et `pgvector` si dispo)
2. Créer la configuration de recherche plein texte `french_unaccent` (français + sans accents)
3. Installer le trigger qui maintient `articles.search_vector` automatiquement
4. Créer un arbre de catégories de démonstration et 5 articles

## 5. Accès Prisma Studio (visualisation web)

```bash
npm run db:studio
```

Ouvre une UI sur `localhost:5555` pour parcourir/éditer la base.

---

## Architecture choisie

| Composant | Rôle | Pourquoi |
|---|---|---|
| **PostgreSQL 16** | Base primaire (tickets, KB, contacts, assets...) | ACID strict, JSONB, FTS natif FR, partitioning, RLS multi-tenant, écosystème |
| **MinIO** | Stockage binaire S3-compatible (pièces jointes, images KB, logos) | Ne pas polluer la DB avec des fichiers — backups rapides, CDN-friendly, presigned URLs |
| **Redis** | Cache, sessions, queues BullMQ (envoi email, imports FS) | Standard de fait, indispensable dès que l'app a des jobs asynchrones |
| **Prisma 7** | ORM TypeScript-first | DX excellente, migrations versionnées, génération de types stricte, driver Rust performant |

## Recherche plein texte française

Les articles KB sont indexés via un `tsvector` pondéré :
- **A** : titre (poids le plus fort)
- **B** : résumé + tags
- **C** : corps HTML (balises strippées)

La recherche utilise `websearch_to_tsquery` qui accepte la syntaxe utilisateur naturelle :
```
"vpn" → trouve "VPN", "vpn", "VPN"
"connexion -wifi" → tickets contenant "connexion" sans "wifi"
"sécurité OR mfa" → l'un ou l'autre
```

L'extension `unaccent` permet de chercher "securite" et trouver "sécurité".

## Backups

Pour la production, ajouter :
```bash
docker exec nexus-postgres pg_dump -U nexus -Fc nexus > backup-$(date +%Y%m%d).dump
```

Ou activer WAL archiving vers MinIO/S3 pour du PITR.

## Reset complet (DEV uniquement, ⚠️ détruit les données)

```bash
docker compose down -v
docker compose up -d
npx prisma migrate dev --name init
npm run db:seed
```
