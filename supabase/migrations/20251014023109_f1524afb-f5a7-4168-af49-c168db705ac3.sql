-- Create characters table
CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  guild TEXT NOT NULL,
  class TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view characters"
ON public.characters
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert characters"
ON public.characters
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update characters"
ON public.characters
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete characters"
ON public.characters
FOR DELETE
TO authenticated
USING (true);

-- Insert the character data
INSERT INTO public.characters (name, guild, class) VALUES
('PunhoBrabo', 'MARVEL', 'Magnus Gun Crusher'),
('Thomas', 'BADBOYS', 'Bloody Fighter'),
('Tooff', 'MARVEL', 'Royal Elf'),
('TryNotCry', 'OsGoDs', 'Creator'),
('ImLord', 'BADBOYS', 'Force Emperor'),
('Scotty', 'BADBOYS', 'Infinity Rune Wizard'),
('Melisandre', 'BADBOYS', 'Endless Summoner'),
('AtreyuS', 'BADBOYS', 'Ignition Knight'),
('KOMBAT', 'BADBOYS', 'Force Emperor'),
('SOMBRA', 'IBADBOYS', 'Battle Mage'),
('MuyMalin', 'BADBOYS', 'Infinity Rune Wizard'),
('RuneQueen', 'BADBOYS', 'Infinity Rune Wizard'),
('IncaCola', 'BADBOYS', 'Glory Wizard'),
('Aphoras', 'BADBOYS', 'Glory Wizard'),
('xBAMZ', 'BADBOYS', 'Ignition Knight'),
('ooGoo', 'BADBOYS', 'Force Emperor'),
('Gardenal', 'OsGoDs', 'Bloody Fighter'),
('HolyWitch', 'OsGoDs', 'Endless Summoner'),
('crowdCTRL', 'BADBOYS', 'Bloody Fighter'),
('ViidaBoa', 'BADBOYS', 'Glory Wizard'),
('BADBOYS', 'BADBOYS', 'Force Emperor'),
('JohnWick', 'BADBOYS', 'Ignition Knight'),
('xFactor', 'BADBOYS', 'Bloody Fighter'),
('Vergosito', 'OsGoDs', 'Force Emperor'),
('Euthanasia', 'OsGoDs', 'Ignition Knight'),
('Youko', 'IBADBOYS', 'Endless Summoner'),
('MorrePaMim', 'OsGoDs', 'Ignition Knight'),
('HammerIy', 'BADBOYS', 'Bloody Fighter'),
('Morroida', 'OsGoDs', 'Force Emperor'),
('HITLER', 'BADBOYS', 'Glory Wizard'),
('MagicMG', 'BADBOYS', 'Duple Knight'),
('Leidror', 'OsGoDs', 'Force Emperor'),
('DeLaRose', 'BADBOYS', 'Royal Elf'),
('Cassian', 'BADBOYS', 'Darkness Wizard'),
('Elowyn', 'OsGoDs', 'Endless Summoner'),
('bHancock', 'BADBOYS', 'Royal Elf'),
('Percy', 'OsGoDs', 'Royal Elf'),
('PsycopathG', 'BADBOYS', 'Bloody Fighter'),
('BkSuper', 'OsGoDs', 'Ignition Knight'),
('SpadeBoi', 'MARVEL', 'Arcane Lancer'),
('KINGOD', 'BADBOYS', 'Glory Wizard'),
('CrazyRW', 'IBADBOYS', 'Infinity Rune Wizard'),
('GENOCIDE', 'BADBOYS', 'Ignition Knight'),
('AquinoNVT', 'BADBOYS', 'Force Emperor'),
('explosiva', 'BADBOYS', 'Arcane Lancer'),
('RobinHood', 'OsGoDs', 'Ignition Knight'),
('VeNoN', 'OsGoDs', 'Darkness Wizard'),
('lamByebye', 'OsGoDs', 'Force Emperor'),
('PatreoN', 'BADBOYS', 'Force Emperor'),
('KhronMG', 'Gods', 'Duple Knight'),
('Kyria', 'NOGUILD', 'Infinity Rune Wizard'),
('Londer', 'IBADBOYS', 'Force Emperor'),
('DarkWIZ', 'OsGoDs', 'Darkness Wizard'),
('lBADBOYSI', 'BADBOYS', 'Darkness Wizard'),
('ooBoo', 'BADBOYS', 'Force Emperor'),
('ShaoKhan', 'BADBOYS', 'Ignition Knight'),
('BaaMZ', 'BADBOYS', 'Darkness Wizard'),
('Baam027', 'OsGoDs', 'Darkness Wizard'),
('NeOrd3r', 'OsGoDs', 'Force Emperor'),
('Nihilus', 'OsGoDs', 'Force Emperor'),
('TONHAO', 'OsGoDs', 'Bloody Fighter'),
('Xupet4', 'OsGoDs', 'Ignition Knight'),
('Nitoryu', 'OsGoDs', 'Ignition Knight'),
('BuffaNeWba', 'OsGoDs', 'Royal Elf'),
('Diame', 'OsGod', 'Royal Elf'),
('XIBICAO', 'OsGoDs', 'Bloody Fighter'),
('AIchemist', 'OsGoDs', 'Creator'),
('Toretto', 'BADBOYS', 'Bloody Fighter'),
('BolaGato', 'OsGoDs', 'Infinity Rune Wizard'),
('ABSOLUTz', 'OsGoDs', 'Force Emperor'),
('RageZZ', 'OsGoDs', 'Bloody Fighter'),
('PauloMnozo', 'OsGoDs', 'Darkness Wizard'),
('Loirao', 'OsGoDs', 'Glory Wizard'),
('SoulMaster', 'OsGoDs', 'Darkness Wizard'),
('Dreiko', 'BADBOYS', 'Force Emperor'),
('Coque', 'BADBOYS', 'Glory Wizard'),
('CobraKai', 'BADBOYS', 'Bloody Fighter'),
('Ezreal', 'BADBOYS', 'Glory Wizard'),
('Mistery', 'OsGoDs', 'Rogue Slayer'),
('TeuKu', 'OsGoDs', 'Glory Wizard'),
('Soc4FoFo', 'OsGoDs', 'Bloody Fighter'),
('SocoNoToBa', 'OsGoDs', 'Bloody Fighter'),
('ZeldrisS', 'OsGoDs', 'Darkness Wizard'),
('Fr3ia', 'OsGoDs', 'Infinity Rune Wizard'),
('RasgaPrega', 'OsGoDs', 'Glory Wizard'),
('Cusco', 'BADBOYS', 'Glory Wizard'),
('GAPARDO', 'BADBOYS', 'Bloody Fighter'),
('Lokii', 'BADBOYS', 'Darkness Wizard'),
('TIRUS', 'BADBOYS', 'Darkness Wizard'),
('Oscuro', 'BADBOYS', 'Darkness Wizard'),
('ZestPearl', 'OsGoDs', 'Ignition Knight'),
('ABSOLUTy', 'OsGoDs', 'Infinity Rune Wizard'),
('XVIII', 'BADBOYS', 'Bloody Fighter'),
('EmpireLord', 'OsGoDs', 'Force Emperor'),
('PotoRoto', 'BADBOYS', 'Ignition Knight'),
('FiNATO', 'OsGoDs', 'Darkness Wizard'),
('GordaoXJ', 'OsGoDs', 'Royal Elf'),
('ZIashKun', 'BADBOYS', 'Ignition Knight');