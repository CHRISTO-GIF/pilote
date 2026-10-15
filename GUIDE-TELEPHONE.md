# Installer Pilote depuis un téléphone

L'installation est automatique : GitHub crée le projet Supabase, les tables, les fonctions,
la publication automatique et met les sites en ligne. Vous n'avez qu'**un code** à copier.

## 1. Le code Supabase (obligatoire)
1. Ouvrez **https://supabase.com/dashboard/account/tokens** (créez un compte si besoin : *Continue with GitHub* est le plus simple).
2. Touchez **Generate new token**, nom : `pilote`, puis **Generate token**.
3. Touchez **Copy** (le code commence par `sbp_`).

## 2. Le coller dans GitHub
1. Ouvrez **https://github.com/CHRISTO-GIF/pilote/settings/secrets/actions/new**
2. Case **Name** : `SUPABASE_ACCESS_TOKEN`
3. Case **Secret** : collez le code.
4. Touchez **Add secret**.

C'est tout. Prévenez Claude : il lance l'installation (5 minutes).

## 3. (Facultatif) La rédaction par l'IA
Créez une clé sur **https://console.anthropic.com/settings/keys** (un crédit prépayé est nécessaire),
puis ajoutez-la comme au point 2 avec le nom `ANTHROPIC_API_KEY`.
Sans cette clé, Pilote et Motion fonctionnent : seuls les boutons d'IA sont inactifs.

## Vos adresses
- Tableau de bord : **https://christo-gif.github.io/pilote/**
- Motion : **https://christo-gif.github.io/pilote/motion/**

Dans Chrome : **⋮ → Ajouter à l'écran d'accueil** pour les ouvrir comme des applications.
