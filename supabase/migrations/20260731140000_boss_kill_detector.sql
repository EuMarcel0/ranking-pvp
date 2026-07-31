-- Boss kill detector: schema + desativa postagem automática antiga + agenda novo cron

-- Colunas no match
ALTER TABLE public.pvp_matches
  ADD COLUMN IF NOT EXISTS boss_killer text,
  ADD COLUMN IF NOT EXISTS boss_npc_id integer;

COMMENT ON COLUMN public.pvp_matches.boss_killer IS 'Personagem que matou o boss (NPC 968/966) detectado via ranking monster_kill';
COMMENT ON COLUMN public.pvp_matches.boss_npc_id IS 'NPC do boss morto (968 ou 966)';

-- Baseline acumulado do ranking VortexMU (por NPC)
CREATE TABLE IF NOT EXISTS public.monster_kill_baselines (
  npc_id integer NOT NULL,
  character_name text NOT NULL,
  kill_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (npc_id, character_name)
);

CREATE INDEX IF NOT EXISTS idx_monster_kill_baselines_npc
  ON public.monster_kill_baselines (npc_id);

ALTER TABLE public.monster_kill_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view monster_kill_baselines" ON public.monster_kill_baselines;
CREATE POLICY "Anyone can view monster_kill_baselines"
  ON public.monster_kill_baselines
  FOR SELECT
  USING (true);

-- Um disparo automático por janela de evento (anti-duplicata)
CREATE TABLE IF NOT EXISTS public.boss_kill_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_date date NOT NULL,
  match_hour integer NOT NULL,
  match_minute integer NOT NULL DEFAULT 0,
  event_type text NOT NULL DEFAULT 'boss_event',
  npc_id integer NOT NULL,
  killer_name text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_date, match_hour, match_minute, event_type)
);

ALTER TABLE public.boss_kill_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view boss_kill_triggers" ON public.boss_kill_triggers;
CREATE POLICY "Anyone can view boss_kill_triggers"
  ON public.boss_kill_triggers
  FOR SELECT
  USING (true);

-- Desativa postagem automática antiga (crons fixos + watchdog)
DO $$
DECLARE
  job_names text[] := ARRAY[
    'auto-ranking-mon-21-t1','auto-ranking-mon-21-t2','auto-ranking-mon-21-t3',
    'auto-ranking-mon-22-t1','auto-ranking-mon-22-t2','auto-ranking-mon-22-t3',
    'auto-ranking-tue-20-t1','auto-ranking-tue-20-t2','auto-ranking-tue-20-t3',
    'auto-ranking-tue-22-t1','auto-ranking-tue-22-t2','auto-ranking-tue-22-t3',
    'auto-ranking-wed-20-t1','auto-ranking-wed-20-t2','auto-ranking-wed-20-t3',
    'auto-ranking-wed-22-t1','auto-ranking-wed-22-t2','auto-ranking-wed-22-t3',
    'auto-ranking-thu-20-t1','auto-ranking-thu-20-t2','auto-ranking-thu-20-t3',
    'auto-ranking-thu-22-t1','auto-ranking-thu-22-t2','auto-ranking-thu-22-t3',
    'auto-ranking-fri-20-t1','auto-ranking-fri-20-t2','auto-ranking-fri-20-t3',
    'auto-ranking-fri-22-t1','auto-ranking-fri-22-t2','auto-ranking-fri-22-t3',
    'auto-ranking-sat-20-t1','auto-ranking-sat-20-t2','auto-ranking-sat-20-t3',
    'auto-ranking-sat-22-t1','auto-ranking-sat-22-t2','auto-ranking-sat-22-t3',
    'auto-ranking-sun-20-t1','auto-ranking-sun-20-t2','auto-ranking-sun-20-t3',
    'auto-ranking-sun-22-t1','auto-ranking-sun-22-t2','auto-ranking-sun-22-t3',
    'kill-activity-watchdog-every-minute'
  ];
  j text;
BEGIN
  FOREACH j IN ARRAY job_names LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Novo cron: detector de morte do boss (a cada minuto)
DO $$
BEGIN
  PERFORM cron.unschedule('boss-kill-detector-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'boss-kill-detector-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://egupwrwzcuqazlshhfoq.supabase.co/functions/v1/detect-boss-kill',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_fVUYQHFh7AZVM4TtGTZ_iQ_doLJzMqQ"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  ) AS request_id;
  $$
);
