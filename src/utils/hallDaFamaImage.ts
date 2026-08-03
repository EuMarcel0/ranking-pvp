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
  /** Se true, omite o rodapé de preview local */
  forDiscord?: boolean;
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

function medal(pos: number): string {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return `#${pos}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let display = text;
  while (ctx.measureText(display).width > maxW && display.length > 3) {
    display = display.slice(0, -2) + '…';
  }
  return display;
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

/** Gera PNG: Ganhadores do Mês + Melhor por Classe + Hall da Fama. */
export function renderHallDaFamaImage(input: MonthlyImageInput): string {
  const { seasonName, top5 = [], bestPerClass = [], hallSections, forDiscord = false } = input;
  const width = 980;
  const padX = 32;
  const colGap = 18;
  const colWidth = (width - padX * 2 - colGap) / 2;

  const hasWinners = top5.length > 0 || bestPerClass.length > 0;
  const topRowH = 34;
  const classRowH = 24;
  const hallRowH = 26;
  const sectionTitleH = 34;

  // --- Measure heights ---
  let yCursor = 0;
  const winnersHeaderH = hasWinners ? 86 : 0;
  const top5H = top5.length > 0 ? 40 + top5.length * topRowH + 16 : 0;
  const classTableH =
    bestPerClass.length > 0
      ? 40 + 28 + bestPerClass.length * classRowH + 20
      : 0;

  yCursor += winnersHeaderH + top5H + classTableH;

  const hallHeaderH = hallSections.length > 0 ? 70 : 0;
  yCursor += hallHeaderH;

  const colHeights = [0, 0];
  const placements: Array<{ section: HallFameSection; col: number; y: number; h: number }> = [];
  for (const section of hallSections) {
    const h = sectionTitleH + section.entries.length * hallRowH + 14;
    const col = colHeights[0] <= colHeights[1] ? 0 : 1;
    placements.push({ section, col, y: colHeights[col], h });
    colHeights[col] += h + 14;
  }
  const hallBodyH = Math.max(colHeights[0], colHeights[1], hallSections.length ? 80 : 0);
  yCursor += hallBodyH;

  const height = Math.max(420, 24 + yCursor + 40);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D não disponível');

  // Fundo
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(0.45, '#111827');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.25, 40, 10, width * 0.25, 40, 420);
  glow.addColorStop(0, 'rgba(234, 179, 8, 0.16)');
  glow.addColorStop(1, 'rgba(234, 179, 8, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 360);

  let y = 28;

  // ========== GANHADORES DO MÊS ==========
  if (hasWinners) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 30px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 GANHADORES DO MÊS', width / 2, y + 28);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 18px Georgia, "Times New Roman", serif';
    ctx.fillText(seasonName, width / 2, y + 56);
    ctx.textAlign = 'left';
    y += winnersHeaderH;

    // Top 5
    if (top5.length > 0) {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
      roundRect(ctx, padX, y, width - padX * 2, top5H - 8, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.28)';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 15px Georgia, "Times New Roman", serif';
      ctx.fillText('🏅  Top 5 PvP — Ranking Geral', padX + 16, y + 26);

      top5.forEach((t, idx) => {
        const rowY = y + 48 + idx * topRowH;
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fillRect(padX + 10, rowY - 18, width - padX * 2 - 20, topRowH - 4);
        }

        ctx.fillStyle = t.position <= 3 ? '#fbbf24' : '#94a3b8';
        ctx.font = '700 14px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText(medal(t.position), padX + 18, rowY);

        const cls = t.player_class ? ` (${t.player_class})` : '';
        const guild = t.player_guild ? ` [${t.player_guild}]` : '';
        const left = `${t.player_name}${cls}${guild}`;
        const right = `${t.score.toFixed(2)} pts  •  ${t.kills}K/${t.deaths}D  •  KDA ${t.kda.toFixed(2)}`;

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '600 14px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText(truncate(ctx, left, 420), padX + 58, rowY);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 12px Consolas, "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(right, width - padX - 18, rowY);
        ctx.textAlign = 'left';
      });

      y += top5H;
    }

    // Melhor por Classe
    if (bestPerClass.length > 0) {
      const tableW = width - padX * 2;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
      roundRect(ctx, padX, y, tableW, classTableH - 8, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 15px Georgia, "Times New Roman", serif';
      ctx.fillText('⚔️  Melhor por Classe', padX + 16, y + 26);

      const cols = [
        { key: 'cls', label: 'Classe', x: padX + 16, w: 210 },
        { key: 'ply', label: 'Jogador', x: padX + 230, w: 180 },
        { key: 'k', label: 'K', x: padX + 430, w: 60, right: true },
        { key: 'd', label: 'D', x: padX + 500, w: 60, right: true },
        { key: 'kda', label: 'KDA', x: padX + 580, w: 80, right: true },
        { key: 'score', label: 'Score', x: padX + 680, w: 100, right: true },
      ] as const;

      const headerY = y + 52;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 12px Consolas, "Courier New", monospace';
      for (const c of cols) {
        if ('right' in c && c.right) {
          ctx.textAlign = 'right';
          ctx.fillText(c.label, c.x + c.w, headerY);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(c.label, c.x, headerY);
        }
      }
      ctx.textAlign = 'left';

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.beginPath();
      ctx.moveTo(padX + 12, headerY + 8);
      ctx.lineTo(width - padX - 12, headerY + 8);
      ctx.stroke();

      bestPerClass.forEach((b, idx) => {
        const rowY = headerY + 28 + idx * classRowH;
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fillRect(padX + 10, rowY - 14, tableW - 20, classRowH - 2);
        }

        ctx.font = '600 12px Consolas, "Courier New", monospace';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.fillText(truncate(ctx, b.class_name, cols[0].w - 8), cols[0].x, rowY);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(truncate(ctx, b.player_name, cols[1].w - 8), cols[1].x, rowY);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(String(b.kills), cols[2].x + cols[2].w, rowY);
        ctx.fillText(String(b.deaths), cols[3].x + cols[3].w, rowY);
        ctx.fillText(b.kda.toFixed(2), cols[4].x + cols[4].w, rowY);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(b.score.toFixed(2), cols[5].x + cols[5].w, rowY);
        ctx.textAlign = 'left';
      });

      y += classTableH;
    }
  }

  // ========== HALL DA FAMA ==========
  if (hallSections.length > 0) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 HALL DA FAMA', width / 2, y + 28);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 15px Georgia, "Times New Roman", serif';
    ctx.fillText(seasonName, width / 2, y + 52);
    ctx.textAlign = 'left';
    y += hallHeaderH;

    const hallStartY = y;
    for (const place of placements) {
      const x = padX + place.col * (colWidth + colGap);
      const sy = hallStartY + place.y;

      ctx.fillStyle = 'rgba(30, 41, 59, 0.72)';
      roundRect(ctx, x, sy, colWidth, place.h, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 14px Georgia, "Times New Roman", serif';
      ctx.fillText(`${place.section.emoji}  ${place.section.label}`, x + 12, sy + 22);

      place.section.entries.forEach((entry, idx) => {
        const rowY = sy + sectionTitleH + idx * hallRowH;
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fillRect(x + 8, rowY - 14, colWidth - 16, hallRowH - 2);
        }

        ctx.fillStyle = entry.position <= 3 ? '#fbbf24' : '#94a3b8';
        ctx.font = '600 12px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText(medal(entry.position), x + 12, rowY);

        let name = entry.player_name;
        if (entry.player_class) name += ` (${entry.player_class})`;
        const scoreText = Number(entry.score).toFixed(2);

        ctx.font = '600 11px Consolas, "Courier New", monospace';
        const scoreW = ctx.measureText(scoreText).width;

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '600 12px "Segoe UI", Tahoma, sans-serif';
        ctx.fillText(truncate(ctx, name, colWidth - 52 - scoreW - 24), x + 48, rowY);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '600 11px Consolas, "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(scoreText, x + colWidth - 12, rowY);
        ctx.textAlign = 'left';
      });
    }
  }

  if (!forDiscord) {
    ctx.fillStyle = '#64748b';
    ctx.font = '400 11px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Preview local — não postado no Discord', width / 2, height - 16);
  }

  return canvas.toDataURL('image/png');
}
