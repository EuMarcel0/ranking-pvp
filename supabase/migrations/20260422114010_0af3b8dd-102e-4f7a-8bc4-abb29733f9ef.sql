-- Backfill class_short for active characters where it's empty/null,
-- using the canonical class -> abbreviation map.
UPDATE public.characters
SET class_short = CASE class
  WHEN 'Ignition Knight' THEN 'DrK'
  WHEN 'Force Emperor' THEN 'ER'
  WHEN 'Infinity Rune Wizard' THEN 'RW4'
  WHEN 'Royal Elf' THEN 'NE'
  WHEN 'Creator' THEN 'ACL'
  WHEN 'Darkness Wizard' THEN 'SW'
  WHEN 'Bloody Fighter' THEN 'FB'
  WHEN 'Arcane Lancer' THEN 'SL'
  WHEN 'Endless Summoner' THEN 'DS'
  WHEN 'Glory Wizard' THEN 'LW'
  WHEN 'Magnus Gun Crusher' THEN 'HGC'
  WHEN 'Battle Mage' THEN 'MM'
  WHEN 'Rogue Slayer' THEN 'SLT'
  WHEN 'Douple Knight' THEN 'MK'
  WHEN 'Phantom Pain Knight' THEN 'MYK'
  WHEN 'Templar Commander' THEN 'TMC'
  WHEN 'Dark Knight' THEN 'DrK'
  WHEN 'Dark Wizard' THEN 'SW'
  WHEN 'Soul Wizard' THEN 'SW'
  WHEN 'Light Wizard' THEN 'LW'
  WHEN 'Noble Elves' THEN 'NE'
  WHEN 'Fist Blazer' THEN 'FB'
  WHEN 'Grand Master' THEN 'SW'
  WHEN 'Majestic Rune Wizard' THEN 'RW4'
  WHEN 'Master Paladim' THEN 'TMC'
  WHEN 'Shining Lancer' THEN 'SL'
  WHEN 'Slaughterer' THEN 'SLT'
  ELSE class_short
END
WHERE (class_short IS NULL OR class_short = '')
  AND class IN (
    'Ignition Knight','Force Emperor','Infinity Rune Wizard','Royal Elf','Creator',
    'Darkness Wizard','Bloody Fighter','Arcane Lancer','Endless Summoner','Glory Wizard',
    'Magnus Gun Crusher','Battle Mage','Rogue Slayer','Douple Knight','Phantom Pain Knight',
    'Templar Commander','Dark Knight','Dark Wizard','Soul Wizard','Light Wizard',
    'Noble Elves','Fist Blazer','Grand Master','Majestic Rune Wizard','Master Paladim',
    'Shining Lancer','Slaughterer'
  );