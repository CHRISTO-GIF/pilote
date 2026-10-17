#!/usr/bin/env bash
# « Boîte d'envoi » : programme dans Pilote les publications décrites dans outbox/<lot>/posts.json.
# Chaque publication : { page, image, title, caption, at (ISO avec fuseau), tags[] }.
# Idempotent : une publication déjà présente (même compte + même heure) n'est pas recréée.
set -euo pipefail

API=https://api.supabase.com/v1
: "${SUPABASE_ACCESS_TOKEN:?jeton Supabase manquant}"
H=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json")

REF=$(curl -sS "${H[@]}" "$API/projects" | jq -r '[.[] | select(.name == "pilote")][0].id // empty')
[ -n "$REF" ] || { echo "::error::Projet Supabase « pilote » introuvable"; exit 1; }
SERVICE=$(curl -sS "${H[@]}" "$API/projects/$REF/api-keys?reveal=true" \
  | jq -r '([.[] | select(.name == "service_role")][0].api_key) // ([.[] | select(.type == "secret")][0].api_key) // empty')
[ -n "$SERVICE" ] || { echo "::error::Clé de service introuvable"; exit 1; }
echo "::add-mask::$SERVICE"

sql() { # renvoie le JSON des lignes
  curl -sS --fail-with-body -X POST "${H[@]}" "$API/projects/$REF/database/query" \
    --data "$(jq -Rs '{query: .}' <<<"$1")"
}

for dir in outbox/*/; do
  [ -f "$dir/posts.json" ] || continue
  echo "== Lot ${dir}"
  n=$(jq length "$dir/posts.json")
  for i in $(seq 0 $((n - 1))); do
    p=$(jq ".[$i]" "$dir/posts.json")
    page=$(jq -r .page <<<"$p")
    at=$(jq -r .at <<<"$p")
    key=$(tr -cd 'a-z' <<<"$(tr 'A-Z' 'a-z' <<<"$page")")

    acc=$(sql "select id, user_id, name from public.accounts
               where platform = 'facebook' and active
                 and lower(regexp_replace(name, '[^a-zA-Z]', '', 'g')) like '%${key}%'
               order by created_at limit 1")
    if [ "$(jq length <<<"$acc")" = "0" ]; then
      names=$(sql "select string_agg(name, ' | ') as n from public.accounts where platform = 'facebook'" | jq -r '.[0].n // "aucune"')
      echo "::error::Page « $page » introuvable dans Pilote. Pages Facebook connectées : $names"
      exit 1
    fi
    acc_id=$(jq -r '.[0].id' <<<"$acc"); uid=$(jq -r '.[0].user_id' <<<"$acc"); acc_name=$(jq -r '.[0].name' <<<"$acc")

    # Image → stockage « media » (remplacée si elle existe déjà)
    img=$(jq -r .image <<<"$p")
    path="$uid/$(basename "$dir")-$(basename "$img")"
    case "$img" in
      *.mp4) ctype="video/mp4"; mtype="video" ;;
      *.jpg|*.jpeg) ctype="image/jpeg"; mtype="image" ;;
      *) ctype="image/png"; mtype="image" ;;
    esac
    curl -sS --fail-with-body -X POST "https://$REF.supabase.co/storage/v1/object/media/$path" \
      -H "Authorization: Bearer $SERVICE" -H "apikey: $SERVICE" -H "x-upsert: true" -H "Content-Type: $ctype" \
      --data-binary "@$dir/$img" >/dev/null

    title=$(jq -r .title <<<"$p"); caption=$(jq -r .caption <<<"$p")

    exists=$(sql "select count(*)::int as c from public.posts where account_id = '$acc_id' and scheduled_at = '$at'::timestamptz" | jq -r '.[0].c')
    if [ "$exists" != "0" ]; then
      # Mise à jour du texte et de l'image tant que la publication n'est pas partie
      sql "update public.posts set caption = \$c\$${caption}\$c\$, media_path = '$path', media_type = '$mtype'
           where account_id = '$acc_id' and scheduled_at = '$at'::timestamptz and status in ('scheduled','pending_approval','failed');
           update public.content_items set body = \$c\$${caption}\$c\$ where user_id = '$uid' and media_path = '$path';" >/dev/null
      echo "Mise à jour sur « $acc_name » pour $at : $title"
      continue
    fi
    tags=$(jq -r '[.tags[] | "\"" + . + "\""] | join(",")' <<<"$p")
    sql "with item as (
           insert into public.content_items (user_id, title, body, media_path, media_type, tags, use_count, last_used_at)
           values ('$uid', \$t\$${title}\$t\$, \$c\$${caption}\$c\$, '$path', '$mtype', '{${tags}}', 1, now())
           returning id)
         insert into public.posts (user_id, account_id, content_item_id, caption, media_path, media_type, scheduled_at, status)
         select '$uid', '$acc_id', item.id, \$c\$${caption}\$c\$, '$path', '$mtype', '$at'::timestamptz, 'scheduled' from item" >/dev/null
    echo "Programmée sur « $acc_name » pour $at : $title"
  done
done

# --- Nettoyage : anciennes versions remplacées (lot illustré du 17/10) encore en attente ---
sql "delete from public.posts where media_path like '%2026-10-motivation-enseignants%' and status in ('scheduled','pending_approval');" >/dev/null || true

# --- Bilan : une seule ligne lisible dans le résumé GitHub ---
summary=$(sql "select count(*) filter (where status = 'scheduled') as prog,
                      count(*) filter (where status = 'published') as pub,
                      count(*) filter (where status = 'failed') as ko,
                      count(*) filter (where media_type = 'video') as vid,
                      (select count(*) from (select scheduled_at from public.posts p2
                         join public.accounts a2 on a2.id = p2.account_id
                         where a2.platform = 'facebook' and p2.status <> 'cancelled'
                         group by p2.account_id, scheduled_at having count(*) > 1) d) as doublons,
                      min(scheduled_at) as debut, max(scheduled_at) as fin
               from public.posts p join public.accounts a on a.id = p.account_id
               where a.platform = 'facebook' and p.status <> 'cancelled'")
echo "::notice::BILAN $(jq -c '.[0]' <<<"$summary")"
