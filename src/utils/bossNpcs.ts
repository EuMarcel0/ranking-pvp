export const BOSS_NPC_NAMES: Record<number, string> = {
  966: '(Elite) Devil Sword',
  968: '(Elite) Devil Sorcerer',
};

export const BOSS_NPC_OPTIONS = [
  { id: 968, label: '(Elite) Devil Sorcerer' },
  { id: 966, label: '(Elite) Devil Sword' },
] as const;

export function bossNpcLabel(npcId: number | null | undefined): string | null {
  if (npcId == null) return null;
  return BOSS_NPC_NAMES[npcId] ?? `NPC ${npcId}`;
}
