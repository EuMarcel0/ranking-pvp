export const BOSS_NPC_NAMES: Record<number, string> = {
  922: 'Selupan',
  966: '(Elite) Devil Sword',
  968: '(Elite) Devil Sorcerer',
};

export const BOSS_NPC_OPTIONS = [
  { id: 922, label: 'Selupan (World Boss PvP)' },
  { id: 968, label: '(Elite) Devil Sorcerer' },
  { id: 966, label: '(Elite) Devil Sword' },
] as const;

/** Selupan — boss diário normal; World Boss PvP só em dias de evento */
export const WORLD_BOSS_NPC_ID = 922;

export function isWorldBossNpc(npcId: number | null | undefined): boolean {
  return npcId === WORLD_BOSS_NPC_ID;
}

export function bossNpcLabel(npcId: number | null | undefined): string | null {
  if (npcId == null) return null;
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}
