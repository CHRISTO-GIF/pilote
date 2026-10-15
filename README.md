# Pilote — publication automatique sur vos réseaux sociaux

Vous ajoutez vos pages (Facebook, Instagram, LinkedIn, TikTok), vous remplissez une bibliothèque de textes et de visuels, vous créez des règles (« chaque jour à 8 h », « lundi, mercredi et vendredi à 18 h »). Pilote prépare les publications, l'IA adapte le texte à chaque réseau, et tout part à l'heure, sans vous.

## Ce que fait l'application

| Écran | Rôle |
|---|---|
| **Comptes** | Ajouter une page/un profil (ID + jeton), tester la connexion, mettre en pause |
| **Bibliothèque** | Textes de base, images, vidéos, étiquettes. Rotation automatique : le contenu le moins récemment utilisé passe en premier |
| **Planning** | Règles quotidiennes ou hebdomadaires : comptes visés, heure, étiquettes, mode IA (tel quel / adapter / rédiger), validation manuelle facultative |
| **Publications** | File d'attente par jour : relire, corriger, réécrire avec l'IA, valider, publier maintenant, annuler. Historique et échecs |
| **Accueil** | Chiffres clés, prochaines publications, boutons « Préparer la semaine » et « Publier ce qui est dû » |

**Automatisation** : toutes les heures, le planificateur prépare les 7 prochains jours (sans doublons) ; toutes les 5 minutes, le publieur envoie ce qui est arrivé à échéance. En cas d'erreur : 3 essais espacés de 15 minutes, puis statut « Échec » avec le message du réseau.

## Pilote Motion — vidéos animées rapides

Application séparée (`motion/`) pour garder Pilote léger : tout le rendu vidéo se fait dans le navigateur, rien ne charge le serveur.

- **8 modèles** : Titre choc, Offre promo, Événement, Citation, Étapes / conseils, Chiffre clé, Diaporama photos, Logo animé.
- **Un seul contenu, tous les modèles** : l'onglet « Modèles » montre votre texte animé dans les 8 modèles en même temps ; vous choisissez celui qui rend le mieux.
- **3 formats** : 9:16 (Story, Reel, TikTok), 1:1 (fil d'actualité), 16:9 (YouTube, Facebook).
- **Style** : 7 palettes + couleurs personnalisées, 5 polices, durée de 4 à 20 s, musique facultative (libre de droits).
- **IA** : décrivez l'annonce en une phrase, l'IA remplit les textes du modèle et propose la légende de publication.
- **Export** : MP4 (Chrome récent, Edge, Safari) ou WebM, plus une image PNG. Puis **« Envoyer vers Pilote »** : la vidéo entre dans la bibliothèque avec l'étiquette `#motion`, et vos règles de planning la publient.

```bash
cd motion
cp .env.example .env      # mêmes URL et clé Supabase que le tableau de bord
npm install
npm run dev               # http://localhost:5174
```
Sans `.env`, Motion fonctionne quand même en mode « création + téléchargement » (sans IA ni envoi vers Pilote).
Dans le tableau de bord, renseignez `VITE_MOTION_URL` pour afficher le bouton « Créer une vidéo animée » dans la Bibliothèque.

> L'export se fait en temps réel (une vidéo de 8 s prend 8 s) : gardez l'onglet au premier plan pendant l'enregistrement.

## Architecture

```
motion/               Pilote Motion : modèles animés, aperçu, export vidéo (navigateur)
dashboard/            React + Vite (tableau de bord, responsive mobile)
supabase/
  migrations/         Tables, sécurité RLS, bucket "media"
  functions/
    planner/          Règles -> publications concrètes (+ rédaction IA)
    publisher/        Envoi aux réseaux, reprises, rafraîchissement TikTok
    generate-caption/ Rédaction IA à la demande
    account-tools/    Enregistrement sécurisé des jetons + test de connexion
    motion-script/    Textes IA des vidéos Motion + légende
    _shared/          Connecteurs Facebook, Instagram, LinkedIn, TikTok, IA, fuseaux horaires
  cron.sql            Tâches pg_cron (à exécuter une fois)
```

Les jetons d'accès sont stockés dans une table sans aucun accès navigateur : seules les fonctions serveur les lisent.

## Installation depuis un téléphone

Voir **GUIDE-TELEPHONE.md** : GitHub installe tout (base, fonctions, automatisation, sites) via le bouton *Run workflow* de `.github/workflows/deploy.yml`.

## Installation depuis un ordinateur (≈ 20 minutes)

### 1. Supabase
Depuis le dossier `pilote/` (la CLI Supabase s'utilise via `npx`, pas d'installation globale) :
```bash
npx supabase login
npx supabase link --project-ref VOTRE_REF
npx supabase db push                   # crée les tables et le bucket
```

### 2. Secrets des fonctions
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... CRON_SECRET=une-longue-chaine-aleatoire
# Facultatif :
#   ANTHROPIC_MODEL=claude-sonnet-5-5   META_GRAPH_VERSION=v23.0   LINKEDIN_VERSION=202606
#   TIKTOK_CLIENT_KEY=...  TIKTOK_CLIENT_SECRET=...  TIKTOK_PRIVACY=SELF_ONLY
#   AUDIENCE="un public principalement tchadien et d'Afrique francophone"
```

### 3. Déployer les fonctions
```bash
npx supabase functions deploy planner publisher generate-caption account-tools motion-script
```

### 4. Activer l'automatisation
Ouvrez `supabase/cron.sql`, remplacez l'URL du projet et la valeur de `CRON_SECRET`, puis exécutez-le dans **SQL Editor**.

### 5. Tableau de bord
```bash
cd dashboard
cp .env.example .env      # renseignez l'URL et la clé "anon" (Settings → API)
npm install
npm run dev               # puis npm run build pour déployer (Vercel, Netlify…)
```

## Obtenir les identifiants de chaque réseau

### Facebook (Pages)
1. Créez une application de type **Business** sur developers.facebook.com.
2. Dans l'Explorateur de l'API Graph, générez un jeton utilisateur avec `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
3. Échangez-le contre un jeton **longue durée**, puis appelez `/me/accounts` : chaque page a son `id` et son `access_token` (ce jeton de Page n'expire pas).
4. Dans Pilote : ID = l'`id` de la page, jeton = son `access_token`.

> En mode développement, l'app fonctionne pour les pages dont vous êtes administrateur. Pour gérer les pages de clients, il faut passer l'examen d'application Meta.

### Instagram
- Le compte doit être **professionnel** et relié à une Page Facebook.
- Ajoutez `instagram_basic` et `instagram_content_publish` au jeton.
- ID : `GET /{page-id}?fields=instagram_business_account`. Jeton : celui de la Page.
- Instagram exige une image (JPEG) ou une vidéo : pas de publication texte seul.

### LinkedIn
- Créez une app sur linkedin.com/developers, produit **Share on LinkedIn** (profil, `w_member_social`) ou **Community Management API** (page entreprise, `w_organization_social`, soumis à validation).
- ID : `urn:li:organization:123456` (page) ou `urn:li:person:xxxx` (profil).
- Le jeton expire après **60 jours** : indiquez-le à l'ajout, Pilote signalera l'expiration.

### TikTok
- App sur developers.tiktok.com avec **Content Posting API** (scope `video.publish`).
- Jeton valable 24 h + jeton de rafraîchissement (valable un an) : renseignez les deux et les secrets `TIKTOK_CLIENT_KEY/SECRET`, Pilote renouvelle automatiquement.
- Tant que l'app n'est pas auditée par TikTok, les publications sont **privées** (`SELF_ONLY`).
- TikTok n'accepte que des médias venant d'un domaine que vous avez vérifié : il faut un domaine personnalisé pour le stockage (ou un relais sur votre domaine).

## Limites de cette première version
- Pas de carrousel Instagram, pas de vidéo LinkedIn.
- Pas encore de statistiques (likes, portée) ni de connexion OAuth en un clic : les jetons sont saisis à la main.
- L'heure d'une publication ponctuelle utilise le fuseau du navigateur ; les règles utilisent `VITE_TIMEZONE` (Africa/Ndjamena par défaut).

## Idées pour la suite
1. Connexion « Se connecter avec Facebook / LinkedIn / TikTok » (OAuth) au lieu de copier des jetons.
2. Récupération des statistiques et choix automatique des meilleures heures.
3. Carrousels et Stories Instagram.
4. Notifications WhatsApp ou e-mail en cas d'échec.
