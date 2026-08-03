/** Gera SVG do Hall da Fama / Ganhadores e rasteriza para PNG (Deno / Edge). */

export type HallFameEntry = {
  position: number;
  player_name: string;
  player_class?: string | null;
  player_guild?: string | null;
  score: number;
};

export type HallFameSection = {
  key: string;
  label: string;
  emoji: string;
  entries: HallFameEntry[];
};

export type WinnersTopEntry = {
  position: number;
  player_name: string;
  player_class?: string | null;
  player_guild?: string | null;
  kills: number;
  deaths: number;
  kda: number;
  score: number;
};

export type BestPerClassEntry = {
  class_name: string;
  player_name: string;
  kills: number;
  deaths: number;
  kda: number;
  score: number;
};

export type MonthlyImageInput = {
  seasonName: string;
  top5?: WinnersTopEntry[];
  bestPerClass?: BestPerClassEntry[];
  hallSections: HallFameSection[];
};

const SECTION_META: Record<string, { label: string; emoji: string }> = {
  geral: { label: 'Ranking Geral', emoji: '👑' },
  reis_pvp: { label: 'Reis do PVP', emoji: '🤴' },
  cones: { label: 'Cones Monodedo', emoji: '💩' },
  kill_streak: { label: 'Kill Streak', emoji: '🔥' },
  mural_vergonha: { label: 'Mural da Vergonha', emoji: '☠️' },
  fogo_amigo: { label: 'Fogo Amigo', emoji: '🤝' },
  putinha: { label: 'Minha Putinha', emoji: '🍑' },
};

const SECTION_ORDER = [
  'geral',
  'reis_pvp',
  'cones',
  'kill_streak',
  'mural_vergonha',
  'fogo_amigo',
  'putinha',
];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function medal(pos: number): string {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return `#${pos}`;
}

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

export function buildHallFameSections(
  grouped: Record<string, Array<Record<string, unknown>>>,
): HallFameSection[] {
  const sections: HallFameSection[] = [];
  for (const key of SECTION_ORDER) {
    const meta = SECTION_META[key];
    const list = grouped[key];
    if (!meta || !list?.length) continue;
    sections.push({
      key,
      label: meta.label,
      emoji: meta.emoji,
      entries: list.slice(0, 10).map((s, i) => ({
        position: Number(s.position ?? i + 1),
        player_name: String(s.player_name ?? ''),
        player_class: (s.player_class as string | null) ?? null,
        player_guild: (s.player_guild as string | null) ?? null,
        score: Number(s.score ?? 0),
      })),
    });
  }
  return sections;
}

export function buildMonthlyHallSvg(input: MonthlyImageInput): { svg: string; width: number; height: number } {
  const { seasonName, top5 = [], bestPerClass = [], hallSections } = input;
  const width = 980;
  const padX = 32;
  const colGap = 18;
  const colWidth = (width - padX * 2 - colGap) / 2;
  const hasWinners = top5.length > 0 || bestPerClass.length > 0;

  let y = 28;
  const parts: string[] = [];

  if (hasWinners) {
    parts.push(`
      <text x="${width / 2}" y="${y + 28}" text-anchor="middle" fill="#fbbf24" font-family="Georgia, serif" font-size="30" font-weight="700">🏆 GANHADORES DO MÊS</text>
      <text x="${width / 2}" y="${y + 56}" text-anchor="middle" fill="#e2e8f0" font-family="Georgia, serif" font-size="18" font-weight="600">${esc(seasonName)}</text>
    `);
    y += 86;

    if (top5.length > 0) {
      const boxH = 40 + top5.length * 34 + 8;
      parts.push(`<rect x="${padX}" y="${y}" width="${width - padX * 2}" height="${boxH}" rx="12" fill="rgba(30,41,59,0.85)" stroke="rgba(234,179,8,0.28)"/>`);
      parts.push(`<text x="${padX + 16}" y="${y + 26}" fill="#f8fafc" font-family="Georgia, serif" font-size="15" font-weight="700">🏅  Top 5 PvP — Ranking Geral</text>`);

      top5.forEach((t, idx) => {
        const rowY = y + 52 + idx * 34;
        if (idx % 2 === 0) {
          parts.push(`<rect x="${padX + 10}" y="${rowY - 18}" width="${width - padX * 2 - 20}" height="30" fill="rgba(15,23,42,0.35)"/>`);
        }
        const left = trunc(
          `${t.player_name}${t.player_class ? ` (${t.player_class})` : ''}${t.player_guild ? ` [${t.player_guild}]` : ''}`,
          48,
        );
        const right = `${t.score.toFixed(2)} pts  •  ${t.kills}K/${t.deaths}D  •  KDA ${t.kda.toFixed(2)}`;
        parts.push(`<text x="${padX + 18}" y="${rowY}" fill="${t.position <= 3 ? '#fbbf24' : '#94a3b8'}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="700">${medal(t.position)}</text>`);
        parts.push(`<text x="${padX + 58}" y="${rowY}" fill="#f1f5f9" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600">${esc(left)}</text>`);
        parts.push(`<text x="${width - padX - 18}" y="${rowY}" text-anchor="end" fill="#38bdf8" font-family="Consolas, monospace" font-size="12" font-weight="600">${esc(right)}</text>`);
      });
      y += boxH + 16;
    }

    if (bestPerClass.length > 0) {
      const boxH = 40 + 28 + bestPerClass.length * 24 + 16;
      parts.push(`<rect x="${padX}" y="${y}" width="${width - padX * 2}" height="${boxH}" rx="12" fill="rgba(30,41,59,0.85)" stroke="rgba(56,189,248,0.25)"/>`);
      parts.push(`<text x="${padX + 16}" y="${y + 26}" fill="#f8fafc" font-family="Georgia, serif" font-size="15" font-weight="700">⚔️  Melhor por Classe</text>`);

      const headerY = y + 52;
      const cols = [
        { label: 'Classe', x: padX + 16, anchor: 'start' },
        { label: 'Jogador', x: padX + 230, anchor: 'start' },
        { label: 'K', x: padX + 490, anchor: 'end' },
        { label: 'D', x: padX + 560, anchor: 'end' },
        { label: 'KDA', x: padX + 660, anchor: 'end' },
        { label: 'Score', x: padX + 780, anchor: 'end' },
      ];
      for (const c of cols) {
        parts.push(`<text x="${c.x}" y="${headerY}" text-anchor="${c.anchor}" fill="#94a3b8" font-family="Consolas, monospace" font-size="12" font-weight="700">${c.label}</text>`);
      }
      parts.push(`<line x1="${padX + 12}" y1="${headerY + 8}" x2="${width - padX - 12}" y2="${headerY + 8}" stroke="rgba(148,163,184,0.25)"/>`);

      bestPerClass.forEach((b, idx) => {
        const rowY = headerY + 28 + idx * 24;
        if (idx % 2 === 0) {
          parts.push(`<rect x="${padX + 10}" y="${rowY - 14}" width="${width - padX * 2 - 20}" height="22" fill="rgba(15,23,42,0.35)"/>`);
        }
        parts.push(`<text x="${padX + 16}" y="${rowY}" fill="#e2e8f0" font-family="Consolas, monospace" font-size="12">${esc(trunc(b.class_name, 22))}</text>`);
        parts.push(`<text x="${padX + 230}" y="${rowY}" fill="#f8fafc" font-family="Consolas, monospace" font-size="12">${esc(trunc(b.player_name, 18))}</text>`);
        parts.push(`<text x="${padX + 490}" y="${rowY}" text-anchor="end" fill="#cbd5e1" font-family="Consolas, monospace" font-size="12">${b.kills}</text>`);
        parts.push(`<text x="${padX + 560}" y="${rowY}" text-anchor="end" fill="#cbd5e1" font-family="Consolas, monospace" font-size="12">${b.deaths}</text>`);
        parts.push(`<text x="${padX + 660}" y="${rowY}" text-anchor="end" fill="#cbd5e1" font-family="Consolas, monospace" font-size="12">${b.kda.toFixed(2)}</text>`);
        parts.push(`<text x="${padX + 780}" y="${rowY}" text-anchor="end" fill="#38bdf8" font-family="Consolas, monospace" font-size="12">${b.score.toFixed(2)}</text>`);
      });
      y += boxH + 12;
    }
  }

  if (hallSections.length > 0) {
    parts.push(`
      <text x="${width / 2}" y="${y + 28}" text-anchor="middle" fill="#fbbf24" font-family="Georgia, serif" font-size="26" font-weight="700">🏆 HALL DA FAMA</text>
      <text x="${width / 2}" y="${y + 52}" text-anchor="middle" fill="#cbd5e1" font-family="Georgia, serif" font-size="15" font-weight="600">${esc(seasonName)}</text>
    `);
    y += 70;

    const colHeights = [0, 0];
    const placements: Array<{ section: HallFameSection; col: number; y: number; h: number }> = [];
    for (const section of hallSections) {
      const h = 34 + section.entries.length * 26 + 14;
      const col = colHeights[0] <= colHeights[1] ? 0 : 1;
      placements.push({ section, col, y: colHeights[col], h });
      colHeights[col] += h + 14;
    }

    const hallStart = y;
    for (const place of placements) {
      const x = padX + place.col * (colWidth + colGap);
      const sy = hallStart + place.y;
      parts.push(`<rect x="${x}" y="${sy}" width="${colWidth}" height="${place.h}" rx="12" fill="rgba(30,41,59,0.8)" stroke="rgba(148,163,184,0.22)"/>`);
      parts.push(`<text x="${x + 12}" y="${sy + 22}" fill="#f8fafc" font-family="Georgia, serif" font-size="14" font-weight="700">${place.section.emoji}  ${esc(place.section.label)}</text>`);

      place.section.entries.forEach((entry, idx) => {
        const rowY = sy + 42 + idx * 26;
        if (idx % 2 === 0) {
          parts.push(`<rect x="${x + 8}" y="${rowY - 14}" width="${colWidth - 16}" height="22" fill="rgba(15,23,42,0.35)"/>`);
        }
        let name = entry.player_name;
        if (entry.player_class) name += ` (${entry.player_class})`;
        parts.push(`<text x="${x + 12}" y="${rowY}" fill="${entry.position <= 3 ? '#fbbf24' : '#94a3b8'}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600">${medal(entry.position)}</text>`);
        parts.push(`<text x="${x + 48}" y="${rowY}" fill="#f1f5f9" font-family="Segoe UI, sans-serif" font-size="12" font-weight="600">${esc(trunc(name, 28))}</text>`);
        parts.push(`<text x="${x + colWidth - 12}" y="${rowY}" text-anchor="end" fill="#38bdf8" font-family="Consolas, monospace" font-size="11">${Number(entry.score).toFixed(2)}</text>`);
      });
    }
    y = hallStart + Math.max(colHeights[0], colHeights[1], 80);
  }

  const height = Math.max(420, y + 40);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="45%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="240" cy="40" r="280" fill="rgba(234,179,8,0.10)"/>
  ${parts.join('\n')}
</svg>`;

  return { svg, width, height };
}

let wasmReady: Promise<void> | null = null;

async function ensureResvg() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const mod = await import('https://esm.sh/@resvg/resvg-wasm@2.6.2');
      const wasmUrl = 'https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
      await mod.initWasm(fetch(wasmUrl));
      (globalThis as any).__Resvg = mod.Resvg;
    })();
  }
  await wasmReady;
}

export async function renderMonthlyHallPng(input: MonthlyImageInput): Promise<Uint8Array> {
  const { svg } = buildMonthlyHallSvg(input);
  await ensureResvg();
  const Resvg = (globalThis as any).__Resvg;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 980 },
    font: { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  return png;
}

export function pngToBase64(png: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < png.length; i++) binary += String.fromCharCode(png[i]);
  return btoa(binary);
}
