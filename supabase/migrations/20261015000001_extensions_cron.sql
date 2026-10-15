-- Extensions nécessaires à l'automatisation (planification + appels HTTP)
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
