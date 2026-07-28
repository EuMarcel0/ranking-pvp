CREATE OR REPLACE FUNCTION public.reopen_season(_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_month int;
  v_next_year int;
  v_next_month int;
  v_removed_next boolean := false;
  v_snaps_deleted int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin role required';
  END IF;

  SELECT year, month INTO v_year, v_month
  FROM seasons WHERE id = _season_id AND status = 'closed';

  IF v_year IS NULL THEN
    RAISE EXCEPTION 'Season not found or not closed';
  END IF;

  -- Calcula próxima
  v_next_month := v_month + 1;
  v_next_year := v_year;
  IF v_next_month > 12 THEN
    v_next_month := 1;
    v_next_year := v_next_year + 1;
  END IF;

  -- Remove temporada seguinte se foi auto-criada e está vazia (sem snapshots)
  DELETE FROM seasons s
  WHERE s.year = v_next_year AND s.month = v_next_month
    AND s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM season_snapshots ss WHERE ss.season_id = s.id);
  GET DIAGNOSTICS v_removed_next = ROW_COUNT;

  -- Limpa snapshots da temporada para regerar quando fechar de novo
  DELETE FROM season_snapshots WHERE season_id = _season_id;
  GET DIAGNOSTICS v_snaps_deleted = ROW_COUNT;

  -- Reabre
  UPDATE seasons
     SET status = 'active', ended_at = NULL, closed_at = NULL
   WHERE id = _season_id;

  -- Garante que não haja outra ativa: fecha qualquer outra ativa que sobrou
  UPDATE seasons
     SET status = 'closed'
   WHERE status = 'active' AND id <> _season_id;

  RETURN jsonb_build_object(
    'reopened_id', _season_id,
    'next_season_removed', v_removed_next,
    'snapshots_deleted', v_snaps_deleted
  );
END;
$$;