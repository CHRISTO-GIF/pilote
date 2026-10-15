-- Ajout de YouTube comme plateforme de publication
alter table public.accounts drop constraint if exists accounts_platform_check;
alter table public.accounts add constraint accounts_platform_check
  check (platform in ('facebook','instagram','linkedin','tiktok','youtube'));
