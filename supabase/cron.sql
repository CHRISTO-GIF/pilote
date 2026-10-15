-- =====================================================================
-- Pilote — automatisation (à exécuter UNE FOIS dans l'éditeur SQL Supabase
-- après le déploiement des fonctions). Remplace les deux valeurs ci-dessous.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Secrets (stockés chiffrés dans Supabase Vault)
select vault.create_secret('https://VOTRE-PROJET.supabase.co', 'pilote_project_url');
select vault.create_secret('VOTRE_CRON_SECRET', 'pilote_cron_secret');   -- même valeur que le secret CRON_SECRET des fonctions

-- 2) Planificateur : toutes les heures, prépare les publications des 7 prochains jours
select cron.schedule('pilote-planner', '7 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_project_url') || '/functions/v1/planner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_cron_secret')),
    body    := '{"days": 7}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

-- 3) Publication : toutes les 5 minutes, publie ce qui est arrivé à échéance
select cron.schedule('pilote-publisher', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_project_url') || '/functions/v1/publisher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pilote_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
$$);

-- Pour vérifier : select * from cron.job;  /  select * from cron.job_run_details order by start_time desc limit 20;
-- Pour arrêter : select cron.unschedule('pilote-publisher');
