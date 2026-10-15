-- =====================================================================
-- Pilote — schéma de publication automatique multi-plateformes
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Comptes / pages connectés (Facebook, Instagram, LinkedIn, TikTok)
-- ---------------------------------------------------------------------
create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform           text not null check (platform in ('facebook','instagram','linkedin','tiktok')),
  name               text not null,
  external_id        text not null,           -- ID de Page, ID IG Business, URN LinkedIn, open_id TikTok
  active             boolean not null default true,
  last_check_at      timestamptz,
  last_check_ok      boolean,
  last_check_message text,
  created_at         timestamptz not null default now()
);

-- Jetons d'accès : jamais lisibles depuis le navigateur (aucune policy => service role uniquement)
create table public.account_secrets (
  account_id    uuid primary key references public.accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Bibliothèque de contenus (textes + visuels / vidéos)
-- ---------------------------------------------------------------------
create table public.content_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  body         text not null default '',
  media_path   text,                          -- chemin dans le bucket "media"
  media_type   text check (media_type in ('image','video')),
  tags         text[] not null default '{}',
  active       boolean not null default true,
  use_count    integer not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Règles de planification (quotidienne / hebdomadaire)
-- ---------------------------------------------------------------------
create table public.schedules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  frequency        text not null check (frequency in ('daily','weekly')),
  weekdays         smallint[] not null default '{}',   -- 0 = dimanche … 6 = samedi (pour weekly)
  post_time        time not null default '09:00',
  timezone         text not null default 'Africa/Ndjamena',
  account_ids      uuid[] not null default '{}',
  tags             text[] not null default '{}',       -- filtre sur la bibliothèque (vide = tout)
  ai_mode          text not null default 'enhance' check (ai_mode in ('none','enhance','generate')),
  ai_brief         text not null default '',
  require_approval boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Publications (file d'attente + historique)
-- ---------------------------------------------------------------------
create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schedule_id      uuid references public.schedules(id) on delete set null,
  account_id       uuid not null references public.accounts(id) on delete cascade,
  content_item_id  uuid references public.content_items(id) on delete set null,
  caption          text not null default '',
  media_path       text,
  media_type       text check (media_type in ('image','video')),
  scheduled_at     timestamptz not null,
  status           text not null default 'scheduled'
                   check (status in ('pending_approval','scheduled','publishing','published','failed','cancelled')),
  attempts         integer not null default 0,
  locked_at        timestamptz,
  external_post_id text,
  error            text,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (schedule_id, account_id, scheduled_at)
);

create index posts_due_idx  on public.posts (status, scheduled_at);
create index posts_user_idx on public.posts (user_id, scheduled_at desc);

-- ---------------------------------------------------------------------
-- Sécurité : chaque utilisateur ne voit que ses données
-- ---------------------------------------------------------------------
alter table public.accounts        enable row level security;
alter table public.account_secrets enable row level security;  -- volontairement sans policy
alter table public.content_items   enable row level security;
alter table public.schedules       enable row level security;
alter table public.posts           enable row level security;

create policy accounts_own on public.accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy content_own on public.content_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy schedules_own on public.schedules for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy posts_own on public.posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Stockage des médias : lecture publique (les réseaux doivent pouvoir
-- télécharger l'image/la vidéo), écriture dans son propre dossier.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy media_read on storage.objects for select
  using (bucket_id = 'media');
create policy media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
