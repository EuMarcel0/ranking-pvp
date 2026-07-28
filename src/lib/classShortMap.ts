// Centralized mapping of full class names to their 3-char abbreviation (class_short).
// Keep in sync with the database `characters.class_short` field.
export const CLASS_SHORT_MAP: Record<string, string> = {
  'Arcane Lancer': 'GL',
  'Battle Mage': 'LEM',
  'Bloody Fighter': 'RF',
  'Creator': 'ALQ',
  'Dark Knight': 'BK',
  'Dark Wizard': 'SM',
  'Darkness Wizard': 'SM',
  'Douple Knight': 'MG',
  'Endless Summoner': 'SUM',
  'Fist Blazer': 'RF',
  'Force Emperor': 'DL',
  'Glory Wizard': 'KD',
  'Grand Master': 'SM',
  'Ignition Knight': 'BK',
  'Infinity Rune Wizard': 'RW',
  'Light Wizard': 'KD',
  'Magnus Gun Crusher': 'GUN',
  'Majestic Rune Wizard': 'RW',
  'Master Paladim': 'CRZ',
  'Noble Elves': 'ELF',
  'Phantom Pain Knight': 'IK',
  'Rage Fighter': 'RF',
  'Rogue Slayer': 'SLA',
  'Royal Elf': 'ELF',
  'Shining Lancer': 'GL',
  'Slaughterer': 'SLA',
  'Soul Wizard': 'SM',
  'Templar Commander': 'CRZ',
};

export const getClassShort = (className: string | null | undefined): string => {
  if (!className) return '';
  return CLASS_SHORT_MAP[className.trim()] || '';
};
