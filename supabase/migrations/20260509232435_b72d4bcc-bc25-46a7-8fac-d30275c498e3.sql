UPDATE public.characters
SET class_short = CASE TRIM(class)
  WHEN 'Arcane Lancer' THEN 'GL'
  WHEN 'Battle Mage' THEN 'LEM'
  WHEN 'Bloody Fighter' THEN 'RF'
  WHEN 'Creator' THEN 'ALQ'
  WHEN 'Dark Knight' THEN 'BK'
  WHEN 'Dark Wizard' THEN 'SM'
  WHEN 'Darkness Wizard' THEN 'SM'
  WHEN 'Douple Knight' THEN 'MG'
  WHEN 'Endless Summoner' THEN 'SUM'
  WHEN 'Fist Blazer' THEN 'RF'
  WHEN 'Force Emperor' THEN 'DL'
  WHEN 'Glory Wizard' THEN 'KD'
  WHEN 'Grand Master' THEN 'SM'
  WHEN 'Ignition Knight' THEN 'BK'
  WHEN 'Infinity Rune Wizard' THEN 'RW'
  WHEN 'Light Wizard' THEN 'KD'
  WHEN 'Magnus Gun Crusher' THEN 'GUN'
  WHEN 'Majestic Rune Wizard' THEN 'RW'
  WHEN 'Master Paladim' THEN 'CRZ'
  WHEN 'Noble Elves' THEN 'ELF'
  WHEN 'Phantom Pain Knight' THEN 'IK'
  WHEN 'Rage Fighter' THEN 'RF'
  WHEN 'Rogue Slayer' THEN 'SLA'
  WHEN 'Royal Elf' THEN 'ELF'
  WHEN 'Shining Lancer' THEN 'GL'
  WHEN 'Slaughterer' THEN 'SLA'
  WHEN 'Soul Wizard' THEN 'SM'
  WHEN 'Templar Commander' THEN 'CRZ'
  ELSE class_short
END
WHERE (class_short IS NULL OR TRIM(class_short) = '')
  AND class IS NOT NULL AND TRIM(class) <> '';