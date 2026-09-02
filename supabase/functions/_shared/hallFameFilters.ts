/** Classes excluídas do Hall da Fama / Ganhadores (ex.: buff de poison no boss, sem PvP real). */
export const HALL_FAME_EXCLUDED_CLASSES = ['Soul Wizard'] as const;

export function isExcludedHallFameClass(className: string | null | undefined): boolean {
  if (!className) return false;
  const normalized = className.trim().toLowerCase();
  return HALL_FAME_EXCLUDED_CLASSES.some((c) => c.toLowerCase() === normalized);
}

export function filterHallFameGrouped<T extends { player_class?: string | null }>(
  grouped: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const [key, list] of Object.entries(grouped)) {
    const filtered = list.filter((row) => !isExcludedHallFameClass(row.player_class));
    if (filtered.length > 0) {
      out[key] = filtered.map((row, i) => ({ ...row, position: i + 1 }));
    }
  }
  return out;
}

export function filterHallFameTop5<T extends { player_class?: string | null }>(rows: T[]): T[] {
  return rows
    .filter((r) => !isExcludedHallFameClass(r.player_class))
    .slice(0, 5)
    .map((r, i) => ({ ...r, position: i + 1 }));
}

export function filterHallFameBestPerClass<T extends { class_name?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isExcludedHallFameClass(r.class_name));
}
