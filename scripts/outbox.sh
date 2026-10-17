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

    exists=$(sql "select count(*)::int as c from public.posts where account_id = '$acc_id' and scheduled_at = '$at'::timestamptz" | jq -r '.[0].c')
    if [ "$exists" != "0" ]; then echo "✓ Déjà programmée : « $acc_name » à $at"; continue; fi

    # Image → stockage « media »
    img=$(jq -r .image <<<"$p")
    path="$uid/$(basename "$dir")-$(basename "$img")"
    curl -sS --fail-with-body -X POST "https://$REF.supabase.co/storage/v1/object/media/$path" \
      -H "Authorization: Bearer $SERVICE" -H "apikey: $SERVICE" -H "x-upsert: true" -H "Content-Type: image/png" \
      --data-binary "@$dir/$img" >/dev/null

    title=$(jq -r .title <<<"$p"); caption=$(jq -r .caption <<<"$p")
    tags=$(jq -r '[.tags[] | "\"" + . + "\""] | join(",")' <<<"$p")
    sql "with item as (
           insert into public.content_items (user_id, title, body, media_path, media_type, tags, use_count, last_used_at)
           values ('$uid', \$t\$${title}\$t\$, \$c\$${caption}\$c\$, '$path', 'image', '{${tags}}', 1, now())
           returning id)
         insert into public.posts (user_id, account_id, content_item_id, caption, media_path, media_type, scheduled_at, status)
         select '$uid', '$acc_id', item.id, \$c\$${caption}\$c\$, '$path', 'image', '$at'::timestamptz, 'scheduled' from item" >/dev/null
    echo "::notice::Programmée sur « $acc_name » pour $at : $title"
  done
done
