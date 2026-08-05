import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated and has admin/moderator role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client for our internal Supabase to verify user role
    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const internalSupabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const internalClient = createClient(internalSupabaseUrl, internalSupabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await internalClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin or moderator role
    const { data: roles } = await internalClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasPermission = roles?.some(r => r.role === 'admin' || r.role === 'moderator');
    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Permission denied. Admin or moderator role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get filter parameters
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const mapFilter = searchParams.get('map'); // 'devias' | 'pvp_square' | 'world_boss'

    console.log(`Fetching external logs with filters: startDate=${startDate}, endDate=${endDate}, map=${mapFilter}`);

    // Connect to external Supabase
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');

    if (!externalUrl || !externalKey) {
      return new Response(
        JSON.stringify({ error: 'External database credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const externalClient = createClient(externalUrl, externalKey);

    // Paginate to fetch ALL logs (Supabase default limit is 1000 per request)
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10; // Safety limit: max 10000 records
    let allLogs: any[] = [];
    let page = 0;

    while (page < MAX_PAGES) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = externalClient
        .from('logs_pvp')
        .select('id, content, timestamp, created_at')
        .order('timestamp', { ascending: false })
        .range(from, to);

      // Apply date filters if provided
      if (startDate) {
        query = query.gte('timestamp', startDate);
      }
      if (endDate) {
        query = query.lte('timestamp', endDate);
      }

      // Apply map filter if provided
      if (mapFilter === 'devias') {
        query = query.ilike('content', '%Devias%[Server: Boss Event PvP]%');
      } else if (mapFilter === 'pvp_square') {
        query = query.or('content.ilike.%PvP Square%[Server: Boss Event PvP]%,content.ilike.%PvP Square%[Server: Platinum PvP]%');
      } else if (mapFilter === 'world_boss') {
        // Selupan World Boss PvP: kills em Raklion
        query = query.ilike('content', '%Raklion%');
      }

      const { data: logs, error: logsError } = await query;

      if (logsError) {
        console.error('Error fetching logs:', logsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch logs from external database', details: logsError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!logs || logs.length === 0) {
        break; // No more data
      }

      allLogs = allLogs.concat(logs);
      console.log(`Page ${page + 1}: fetched ${logs.length} logs (total: ${allLogs.length})`);

      if (logs.length < PAGE_SIZE) {
        break; // Last page
      }

      page++;
    }

    console.log(`Successfully fetched ${allLogs.length} total logs from external database`);

    return new Response(
      JSON.stringify({ logs: allLogs, count: allLogs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
