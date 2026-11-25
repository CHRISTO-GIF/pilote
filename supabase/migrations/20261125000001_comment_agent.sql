-- Agent de commentaires : réponses automatiques sur les Pages Facebook.
alter table public.accounts add column if not exists auto_reply boolean not null default false;

create table if not exists public.comment_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  post_id       uuid references public.posts(id) on delete set null,
  comment_id    text not null unique,
  author_name   text,
  message       text not null default '',
  permalink     text,
  commented_at  timestamptz,
  category      text not null,               -- quiz, merci, info, court, sensible, a_relire
  status        text not null check (status in ('replied','flagged','ignored','error')),
  reply_text    text,
  reply_id      text,
  error         text,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists comment_log_user_idx on public.comment_log (user_id, created_at desc);

alter table public.comment_log enable row level security;
drop policy if exists comment_log_own on public.comment_log;
create policy comment_log_own on public.comment_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activé d'office pour la Page de l'école
update public.accounts set auto_reply = true
 where platform = 'facebook' and lower(regexp_replace(name, '[^a-zA-Z]', '', 'g')) like '%holyflame%';
