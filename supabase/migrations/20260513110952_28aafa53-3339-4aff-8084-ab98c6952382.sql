
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS characters_one_main_per_guild
  ON public.characters (guild)
  WHERE is_main = true;

UPDATE public.characters SET is_main = true WHERE name = 'oGoD' AND guild = 'OsGoDs';
UPDATE public.characters SET is_main = true WHERE name = 'ImLegends' AND guild = 'LEGENDS';
