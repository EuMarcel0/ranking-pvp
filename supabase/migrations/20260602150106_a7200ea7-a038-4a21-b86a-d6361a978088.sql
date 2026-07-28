-- Remover temporadas futuras vazias (7, 8, 9/2026) e reabrir 06/2026 como ativa
DELETE FROM public.season_snapshots WHERE season_id IN (
  SELECT id FROM public.seasons WHERE (year, month) IN ((2026,7),(2026,8),(2026,9))
);
DELETE FROM public.seasons WHERE (year, month) IN ((2026,7),(2026,8),(2026,9));

UPDATE public.seasons
   SET status = 'active', ended_at = NULL, closed_at = NULL
 WHERE year = 2026 AND month = 6;