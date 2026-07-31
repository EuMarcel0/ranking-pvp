-- Atraso de 4 min entre detecção da morte do boss e postagem do ranking
ALTER TABLE public.boss_kill_triggers
  ADD COLUMN IF NOT EXISTS post_after timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Registros antigos: tratar como já postados / prontos
UPDATE public.boss_kill_triggers
SET
  post_after = COALESCE(post_after, triggered_at),
  posted_at = COALESCE(posted_at, triggered_at)
WHERE post_after IS NULL OR posted_at IS NULL;

ALTER TABLE public.boss_kill_triggers
  ALTER COLUMN post_after SET DEFAULT now();

COMMENT ON COLUMN public.boss_kill_triggers.post_after IS 'Horário em que o ranking pode ser postado (detecção + 4 min de loot/clear)';
COMMENT ON COLUMN public.boss_kill_triggers.posted_at IS 'Quando o auto-process-ranking foi disparado com sucesso';
