import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { summary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isTeamBuilding = summary.analysisType === 'team_building';

    const systemPrompt = isTeamBuilding
      ? `Você é um treinador/estrategista especializado em PvP de jogos MMORPG. Analise os dados de desempenho dos membros da guild e gere uma análise tática detalhada em português brasileiro.

Seu relatório deve cobrir:
1. **Escalação Ideal**: Quem deve ser escalado como titular e por quê (baseado em KDA, consistência e participação)
2. **Jogadores em Destaque**: Quem está performando acima da média
3. **Jogadores para Desenvolver**: Quem tem potencial mas precisa melhorar (tendência em alta, mas KDA ainda baixo)
4. **Pontos Fracos da Guild**: Onde a guild pode melhorar (falta de consistência, baixa participação, classes em falta)
5. **Composição Tática**: Sugestão de formação ideal por classe, considerando os dados
6. **Oscilantes**: Jogadores imprevisíveis que podem surpreender ou decepcionar — como lidar com eles
7. **Recomendações**: Ações práticas para melhorar o desempenho coletivo

Use emojis para destacar pontos importantes. Seja específico com números e percentuais.
Mantenha o tom de um treinador motivador mas realista. Máximo 1000 palavras.`
      : `Você é um analista especializado em PvP de jogos MMORPG. Analise os dados de PvP fornecidos e gere insights detalhados em português brasileiro. 

Seu relatório deve cobrir:
1. **Jogadores Dominantes**: Quem são os melhores jogadores e por quê
2. **Rivalidades Intensas**: Confrontos diretos mais disputados, com taxa de dominância
3. **Análise de Guilds**: Quais guilds dominam e quais estão em desvantagem
4. **META do Servidor**: Quais classes estão mais fortes baseado nos dados
5. **Tendências**: Padrões interessantes nos dados

Use emojis para destacar pontos importantes. Seja específico com números e percentuais.
Mantenha o tom analítico mas acessível. Máximo 800 palavras.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analise estes dados de PvP:\n\n${JSON.stringify(summary, null, 2)}` },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido", status: 429 }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes", status: 402 }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI error:", status, text);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const insights = result.choices?.[0]?.message?.content || "Nenhum insight gerado.";

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pvp-ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
