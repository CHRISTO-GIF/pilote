# Installer Pilote depuis un téléphone

Aucun ordinateur n'est nécessaire : GitHub installe et met en ligne l'application pour vous.
Astuce : dans Chrome, activez **⋮ → Version pour ordinateur** sur les sites GitHub et Supabase, c'est plus confortable.

## 1. Préparer Supabase (supabase.com)
1. **New project** → choisissez un mot de passe de base de données → notez-le.
2. **Project Settings → General** : notez le **Project ID** (ex. `abcd1234efgh`).
3. **Project Settings → API Keys** : copiez la clé **anon** (ou *publishable*).
4. **Authentication → Sign In / Providers → Email** : désactivez **Confirm email**.
5. Avatar en haut à droite → **Account → Access Tokens** → **Generate new token** → copiez-le.

## 2. Clé IA (console.anthropic.com)
**API Keys → Create Key** → copiez la clé (`sk-ant-...`).

## 3. Ranger les clés dans GitHub
Dépôt **pilote** → **Settings → Secrets and variables → Actions → New repository secret**, six fois :

| Nom (à recopier exactement) | Valeur |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | jeton de l'étape 1.5 |
| `SUPABASE_PROJECT_REF` | Project ID de l'étape 1.2 |
| `SUPABASE_DB_PASSWORD` | mot de passe de l'étape 1.1 |
| `SUPABASE_ANON_KEY` | clé anon de l'étape 1.3 |
| `ANTHROPIC_API_KEY` | clé IA de l'étape 2 |
| `CRON_SECRET` | une phrase inventée, longue, sans espace (ex. `Pilote-Ndjamena-2026-xK29`) |

## 4. Activer le site
Dépôt **pilote** → **Settings → Pages → Source : GitHub Actions**.

## 5. Lancer l'installation
Onglet **Actions → Déployer Pilote → Run workflow → Run workflow**.
Attendez 3 à 5 minutes que les trois étapes passent au vert ✅.

Vos adresses :
- Tableau de bord : `https://VOTRE-NOM.github.io/pilote/`
- Motion : `https://VOTRE-NOM.github.io/pilote/motion/`

Ajoutez-les à l'écran d'accueil (Chrome **⋮ → Ajouter à l'écran d'accueil**) : elles s'ouvrent comme des applications.

## 6. Premier usage
Créer un compte → **Comptes** (ajouter la page Facebook) → **Bibliothèque** → **Planning**.

## En cas d'étape rouge ❌
Touchez l'étape en échec, lisez la dernière ligne rouge et envoyez-la (ou une capture) à Claude.
- *Secrets manquants* : un nom est mal recopié à l'étape 3.
- *password authentication failed* : mauvais `SUPABASE_DB_PASSWORD`.
- *Get Pages site failed* : l'étape 4 n'a pas été faite.

Chaque mise à jour du code relance l'installation automatiquement.
