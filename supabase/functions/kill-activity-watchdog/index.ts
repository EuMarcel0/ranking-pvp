/**
 * DESATIVADO — postagem automática agora é exclusiva do detect-boss-kill.
 * Mantido apenas para não quebrar invocações residuais de cron antigo.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      success: false,
      status: 'disabled',
      message:
        'kill-activity-watchdog is disabled. Automatic Boss Event posting is handled by detect-boss-kill only.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
