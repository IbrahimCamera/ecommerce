# Plateforme commandes COD → Yalidine

Multi-tenant : marchands algériens créent des landing pages de commande (paiement à la livraison) et poussent les commandes vers Yalidine.

## Stack

React 18 + Vite + TypeScript (strict) + Tailwind · Supabase (Postgres + Auth + RLS + Edge Functions Deno) · Zod partagé front/back.

## Lot 1 (livré)

- Schéma Postgres complet + RLS sur toutes les tables (voir `supabase/migrations/`)
- Auth marchand (signup/login) avec création automatique du profil
- Connexion + test des identifiants Yalidine (Edge Function `yalidine-credentials`), clés chiffrées via Supabase Vault, jamais renvoyées au client
- Adresse d'expédition (wilaya + poids/dimensions par défaut)
- Sync géo quotidienne (Edge Function `sync-yalidine-geo`) : wilayas, communes, centers (cache partagé) + delivery fees (scopé par marchand, voir note ci-dessous)

### Déviation par rapport au schéma initial (à valider)

Le schéma décrivait une seule table `yalidine_geo_cache` (wilayas, communes, centers, deliveryfees en blobs). Implémenté à la place :

- `yalidine_wilayas`, `yalidine_communes`, `yalidine_centers` : tables normalisées (au lieu de JSONB) pour permettre au formulaire public (Lot 2) de filtrer communes/centres par ID avec un index, plutôt que de parser un JSON de plusieurs milliers de lignes à chaque chargement.
- `yalidine_delivery_fees` / `yalidine_delivery_fees_communes` : scopées par `merchant_id` car il n'est pas confirmé que les tarifs Yalidine (cod_percentage, insurance_percentage, tarifs par commune) sont identiques pour tous les comptes revendeurs. Si c'est confirmé, on peut simplifier en cache global.

### Point non résolu : webhooks Yalidine

La doc API publique consultée (Authentication, Rate Limits, Pagination, Parcels, Histories, Centers, Communes, Wilayas, Fees) ne contient pas de section "Webhooks". La colonne `webhook_secret_id` existe dans `yalidine_credentials` mais rien n'est branché dessus — à clarifier avec la doc avant le Lot 4.

## Mise en route

### 1. Créer le projet Supabase

Créez un projet sur [supabase.com](https://supabase.com), puis récupérez dans Project Settings > API : Project URL, `anon` key, `service_role` key.

### 2. Variables d'environnement du frontend

```bash
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 3. Appliquer les migrations

Avec le [CLI Supabase](https://supabase.com/docs/guides/cli) :

```bash
supabase link --project-ref <votre-project-ref>
supabase db push
```

Sans CLI : copier-coller le contenu de chaque fichier de `supabase/migrations/` dans l'éditeur SQL du dashboard Supabase, dans l'ordre des noms de fichiers.

Vault/pgsodium sont activés par défaut sur les projets Supabase hébergés — aucune étape supplémentaire n'est nécessaire pour le chiffrement des clés Yalidine.

### 4. Déployer les Edge Functions

```bash
npx supabase functions deploy yalidine-credentials
npx supabase functions deploy sync-yalidine-geo
```

`supabase/config.toml` pointe déjà chaque fonction vers `supabase/functions/deno.json` (import map pour les spécificateurs `zod` / `@supabase/supabase-js` utilisés par le schéma Zod partagé) — pas besoin du flag `--import-map` manuellement.

Aucune variable d'environnement supplémentaire à définir : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par la plateforme dans chaque Edge Function.

Le CLI Supabase est installé en local (`devDependencies`, pas besoin de Docker pour `db push`/`functions deploy` — seul `supabase start`, la stack 100% locale, en a besoin) :

```bash
npx supabase login          # une fois, ouvre le navigateur
npx supabase link --project-ref <votre-project-ref>
npx supabase db push
```

### 5. Sync géo quotidienne (à faire une seule fois, manuellement)

Le job `cron.schedule` n'est pas commité (il embarque la service role key). Dans l'éditeur SQL du dashboard, avec vos propres valeurs :

```sql
select cron.schedule(
  'sync-yalidine-geo-daily',
  '0 3 * * *', -- 03:00 chaque jour, à ajuster
  $$
  select net.http_post(
    url := 'https://<votre-project-ref>.supabase.co/functions/v1/sync-yalidine-geo',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <votre-service-role-key>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Pour tester immédiatement sans attendre le cron, invoquez la fonction manuellement (ex. via `curl` avec le header `Authorization: Bearer <service-role-key>`) — mais un marchand doit d'abord avoir des identifiants Yalidine actifs (connectés depuis le dashboard) et une adresse d'expédition configurée pour que la sync des tarifs fasse quelque chose.

## Structure

```
src/                      # Frontend React (dashboard marchand)
shared/schemas/           # Zod partagés front (Vite) / back (Deno, via import map)
supabase/migrations/      # Schéma Postgres + RLS, un fichier par étape
supabase/functions/       # Edge Functions Deno
  _shared/                # Client Yalidine (quotas, retry/backoff), CORS
  yalidine-credentials/   # Test + sauvegarde chiffrée des clés
  sync-yalidine-geo/      # Cron: wilayas/communes/centers + fees par marchand
```
