import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CLASS_SHORT_MAP: Record<string, string> = {
  "Arcane Lancer": "GL",
  "Battle Mage": "LEM",
  "Bloody Fighter": "RF",
  Creator: "ALQ",
  "Dark Knight": "BK",
  "Dark Wizard": "SM",
  "Darkness Wizard": "SM",
  "Douple Knight": "MG",
  "Endless Summoner": "SUM",
  "Fist Blazer": "RF",
  "Force Emperor": "DL",
  "Glory Wizard": "KD",
  "Grand Master": "SM",
  "Ignition Knight": "BK",
  "Infinity Rune Wizard": "RW",
  "Light Wizard": "KD",
  "Magnus Gun Crusher": "GUN",
  "Majestic Rune Wizard": "RW",
  "Master Paladim": "CRZ",
  "Noble Elves": "ELF",
  "Phantom Pain Knight": "IK",
  "Rage Fighter": "RF",
  "Rogue Slayer": "SLA",
  "Royal Elf": "ELF",
  "Shining Lancer": "GL",
  Slaughterer: "SLA",
  "Soul Wizard": "SM",
  "Templar Commander": "CRZ",
};

export const getClassShort = (c: string | null | undefined) =>
  c ? CLASS_SHORT_MAP[c.trim()] || "" : "";

const nameToHex = (name: string): string =>
  Array.from(name)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");

const normalizeName = (name: string): string => name.replace(/\s+/g, " ").trim();

const parseClass = (html: string): string | null => {
  const classRegex =
    /<label[^>]*>\s*Class\s*<\/label>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/i;
  const match = html.match(classRegex);
  return match?.[1]?.trim() || null;
};

const parseGuild = (html: string): string | null => {
  const guildLinkRegex =
    /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i;
  const linkMatch = html.match(guildLinkRegex);
  if (linkMatch?.[1]) return linkMatch[1].trim();

  const guildNoneRegex =
    /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*None\s*<\/div>/i;
  if (guildNoneRegex.test(html)) return "Sem Guild";

  const guildTextRegex =
    /<label[^>]*>\s*Guild\s*<\/label>\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>/i;
  const textMatch = html.match(guildTextRegex);
  if (textMatch?.[1]) {
    const guild = textMatch[1].trim();
    return guild === "None" ? "Sem Guild" : guild;
  }

  return null;
};

export const fetchCharacterFromVortex = async (
  rawName: string,
): Promise<{ class: string; guild: string } | null> => {
  const name = normalizeName(rawName);
  const hexName = nameToHex(name);
  const url = `https://vortexmu.net/character/${hexName}/MUONLINE`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const hasCharacterInfo = /Character\s+Information/i.test(html);
    const hasNameBlock = new RegExp(
      `<label[^>]*>\\s*Name\\s*<\\/label>[\\s\\S]*?<div[^>]*>\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*<\\/div>`,
      "i",
    ).test(html);

    if (!hasCharacterInfo || !hasNameBlock) return null;

    const charClass = parseClass(html);
    if (!charClass) return null;

    return {
      class: charClass,
      guild: parseGuild(html) || "Sem Guild",
    };
  } catch (error) {
    console.error(`[VortexSync] Error fetching ${rawName}:`, error);
    return null;
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SyncCharactersOptions {
  concurrency?: number;
  delayMs?: number;
}

export interface SyncCharactersResult {
  total: number;
  updated: number;
  created: number;
  failed: number;
  notFound: number;
  errors: { name: string; error: string }[];
}

export async function syncCharactersFromVortex(
  supabase: SupabaseClient,
  names: string[],
  options: SyncCharactersOptions = {},
): Promise<SyncCharactersResult> {
  const concurrency = options.concurrency ?? 5;
  const delayMs = options.delayMs ?? 150;

  const uniqueNames = [...new Set(names.map((n) => normalizeName(n)).filter(Boolean))];
  const results: SyncCharactersResult = {
    total: uniqueNames.length,
    updated: 0,
    created: 0,
    failed: 0,
    notFound: 0,
    errors: [],
  };

  if (uniqueNames.length === 0) return results;

  let index = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= uniqueNames.length) return;

      const name = uniqueNames[i];
      try {
        const vortexData = await fetchCharacterFromVortex(name);

        if (!vortexData) {
          results.notFound++;
          results.errors.push({ name, error: "Character not found on VortexMU" });
          await delay(delayMs);
          continue;
        }

        const { data: existing } = await supabase
          .from("characters")
          .select("id")
          .ilike("name", name)
          .maybeSingle();

        const payload = {
          class: vortexData.class,
          class_short: getClassShort(vortexData.class),
          guild: vortexData.guild,
        };

        if (existing) {
          const { error: updateError } = await supabase
            .from("characters")
            .update(payload)
            .eq("id", existing.id);
          if (updateError) throw updateError;
          results.updated++;
        } else {
          const { error: insertError } = await supabase.from("characters").insert({
            name,
            ...payload,
          });
          if (insertError) throw insertError;
          results.created++;
        }

        await delay(delayMs);
      } catch (error: unknown) {
        results.failed++;
        results.errors.push({
          name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, uniqueNames.length) },
    () => worker(),
  );
  await Promise.all(workers);

  console.log(`[VortexSync] Complete:`, results);
  return results;
}
