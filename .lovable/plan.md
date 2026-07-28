## Problema

O ranking do **Boss** postado no Discord ontem mostrou Penudo com **41K / 14D / KDA 2.93 / Score 107.86**, enquanto o site mostra **39K / 13D / KDA 3.00 / Score 103.50**.

A diferença vem do **fogo amigo** (kills entre membros da mesma guild):
- O **site** já desconta fogo amigo no ranking Boss (via `get_ranking_geral`, conforme regra documentada em `.lovable/plan.md`).
- A **edge function `auto-process-ranking`** (que monta o post automático do Discord) ainda conta cada linha de kill log bruta, incluindo fogo amigo.

Resultado: 2 kills + 1 death de fogo amigo do Penudo aparecem no Discord mas não no site → 41-2=39, 14-1=13. ✅ confere.

A regra (igual ao site) vale **somente para `boss_event`**. Throne e Arka continuam com a contagem bruta atual.

## Mudança

Editar **`supabase/functions/auto-process-ranking/index.ts`**, no trecho que monta o payload do Discord (após inserir match/players/kill_logs no banco):

1. **Manter intacto** o INSERT em `pvp_match_players` e `pvp_kill_logs` — o banco continua com os dados brutos (preserva o ranking de Fogo Amigo e analytics).
2. Quando `eventType === 'boss_event'`, calcular o conjunto de "fogo amigo" a partir de `parseResult.killLogs` cruzando com `characterMap` (mesma guild, ambos com guild não vazia, killer ≠ victim, ambos não banidos) — mesma regra usada nas linhas 802-811 do `agenteDuplo`.
3. **Recalcular em memória**, apenas para o post do Discord:
   - `nonBannedPlayers[i].kills` — subtrair fogo amigo do killer
   - `nonBannedPlayers[i].deaths` — subtrair fogo amigo do victim
   - `nonBannedPlayers[i].kda` — recalcular `kills/deaths` (ou `kills` se `deaths === 0`)
   - `playersWithEventScore`/`playersWithScore`/`sortedPlayers` derivam dos novos valores → automaticamente corretos para Rei do PvP, Brabíssimo, Cone Monodedo, ranking principal.
   - `guildSummary[guild].kills/deaths` — somar a partir dos players já ajustados.
   - `totals.kills/deaths` — idem.
4. Para `throne_conquest` (e qualquer outro eventType): **não aplicar** o desconto, manter comportamento atual.
5. Não tocar em `bestKillStreak`, `agenteDuplo`, `putinhaNoite` — esses já operam sobre `parseResult.killLogs` brutos e devem continuar assim.

## Validação

Após o deploy, próximo Boss processado deve postar no Discord os mesmos números do site (Ranking Geral filtrado por boss_event). Conferir com Penudo do dia 12/05 reprocessando manualmente (forceReprocess) — esperado 39/13/3.00/103.50.

Nada no front-end precisa mudar; nada no banco precisa mudar.
