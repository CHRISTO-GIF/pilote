#!/usr/bin/env bash
# Installe ou met à jour tout le côté serveur de Pilote avec UN SEUL jeton Supabase :
# crée le projet "pilote" s'il n'existe pas, applique les tables, déploie les fonctions,
# active la publication automatique, et renvoie l'URL + la clé publique pour les sites.
set -euo pipefail

API=https://api.supabase.com/v1
: "${SUPABASE_ACCESS_TOKEN:?jeton Supabase manquant}"
H=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json")

api() { # api METHOD PATH [JSON]
  local out code
  out=$(mktemp)
  code=$(curl -sS -o "$out" -w '%{http_code}' -X "$1" "${H[@]}" "$API$2" ${3:+--data "$3"})
  if [ "$code" -ge 300 ]; then
    echo "::error::Supabase $1 $2 → $code : $(head -c 400 "$out")" >&2
    return 1
  fi
  cat "$out"
}

sql() { # exécute du SQL sur la base du projet
  api POST "/projects/$REF/database/query" "$(jq -Rs '{query: .}' <<<"$1")" >/dev/null
}

# 1) Projet : SUPABASE_PROJECT_REF s'il est fourni, sinon le projet nommé "pilote", sinon on le crée
REF="${SUPABASE_PROJECT_REF:-}"
if [ -z "$REF" ]; then
  REF=$(api GET /projects | jq -r '[.[] | select(.name == "pilote")][0].id // empty')
fi
if [ -z "$REF" ]; then
  ORG=$(api GET /organizations | jq -r '.[0].id // empty')
  [ -n "$ORG" ] || { echo "::error::Aucune organisation Supabase : ouvrez supabase.com/dashboard une fois pour la créer." >&2; exit 1; }
  echo "Création du projet Supabase « pilote » (Paris)…"
  REF=$(api POST /projects "$(jq -n --arg org "$ORG" --arg pw "$(openssl rand -base64 30 | tr -d '/+=')" \
    '{name:"pilote", organization_id:$org, region:"eu-west-3", db_pass:$pw}')" | jq -r .id)
fi
echo "Projet : $REF"

# 2) Attendre que le projet soit prêt (2 à 4 minutes à la création)
for i in $(seq 1 60); do
  STATUS=$(api GET "/projects/$REF" | jq -r .status)
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  echo "Projet en préparation ($STATUS)…"; sleep 10
done
[ "$STATUS" = "ACTIVE_HEALTHY" ] || { echo "::error::Le projet n'est pas prêt ($STATUS). Relancez dans quelques minutes." >&2; exit 1; }

# 3) Connexion par e-mail sans confirmation (plus simple pour démarrer)
api PATCH "/projects/$REF/config/auth" '{"mailer_autoconfirm": true}' >/dev/null || true

# 4) Tables : chaque fichier de migration n'est appliqué qu'une fois
sql "create table if not exists public.pilote_migrations (name text primary key, applied_at timestamptz default now());
     alter table public.pilote_migrations enable row level security;"
DONE=$(api POST "/projects/$REF/database/query" '{"query":"select name from public.pilote_migrations"}' | jq -r '.[].name')
for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if grep -qx "$name" <<<"$DONE"; then echo "✓ $name (déjà appliquée)"; continue; fi
  echo "→ $name"
  sql "$(cat "$f")
insert into public.pilote_migrations(name) values ('$name');"
done

# 5) Secrets des fonctions (le secret du cron est renouvelé à chaque déploiement)
CRON_SECRET=$(openssl rand -hex 32)
echo "::add-mask::$CRON_SECRET"
args=("CRON_SECRET=$CRON_SECRET")
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then args+=("ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"); else
  echo "::notice::Pas de clé ANTHROPIC_API_KEY : Pilote fonctionne, mais sans rédaction par l'IA."; fi
[ -n "${GOOGLE_CLIENT_ID:-}" ] && args+=("GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID")
[ -n "${GOOGLE_CLIENT_SECRET:-}" ] && args+=("GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET")
[ -n "${PUBLIC_SITE_URL:-}" ] && args+=("PUBLIC_SITE_URL=$PUBLIC_SITE_URL")
[ -n "${META_APP_ID:-}" ] && args+=("META_APP_ID=$META_APP_ID")
[ -n "${META_APP_SECRET:-}" ] && args+=("META_APP_SECRET=$META_APP_SECRET")
[ -n "${META_CONFIG_ID:-}" ] && args+=("META_CONFIG_ID=$META_CONFIG_ID")
[ -z "${META_APP_ID:-}" ] && echo "::notice::Facebook/Instagram pas encore configurés (META_APP_ID / META_APP_SECRET)."
[ -z "${GOOGLE_CLIENT_ID:-}" ] && echo "::notice::YouTube pas encore configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)."
supabase secrets set --project-ref "$REF" "${args[@]}"

# 6) Fonctions serveur
supabase functions deploy --project-ref "$REF"

# 7) Publication automatique (toutes les heures : préparation ; toutes les 5 min : envoi)
URL="https://$REF.supabase.co"
sql "do \$\$ declare i uuid; begin
  select id into i from vault.secrets where name = 'pilote_project_url';
  if i is null then perform vault.create_secret('$URL', 'pilote_project_url'); else perform vault.update_secret(i, '$URL'); end if;
  select id into i from vault.secrets where name = 'pilote_cron_secret';
  if i is null then perform vault.create_secret('$CRON_SECRET', 'pilote_cron_secret'); else perform vault.update_secret(i, '$CRON_SECRET'); end if;
end \$\$;"
for job in "pilote-planner|7 * * * *|planner|{\"days\": 7}|120000" "pilote-publisher|*/5 * * * *|publisher|{}|140000"; do
  IFS='|' read -r name cronexp fn body timeout <<<"$job"
  sql "select cron.schedule('$name', '$cronexp', \$cmd\$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_project_url') || '/functions/v1/$fn',
      headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_cron_secret')),
      body    := '$body'::jsonb,
      timeout_milliseconds := $timeout);
  \$cmd\$);"
done
echo "✓ Publication automatique active"

# 8) Informations pour construire les sites
ANON=$(api GET "/projects/$REF/api-keys" | jq -r '[.[] | select(.name == "anon")][0].api_key // empty')
[ -n "$ANON" ] || ANON=$(api GET "/projects/$REF/api-keys?reveal=true" | jq -r '[.[] | select(.type == "publishable")][0].api_key // empty')
{
  echo "url=$URL"
  echo "anon=$ANON"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
echo "✓ Serveur prêt : $URL"
