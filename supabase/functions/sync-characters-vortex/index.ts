import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncCharactersFromVortex } from "../_shared/vortexSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "moderator"])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { mode, names } = body as {
      mode: "unregistered" | "all" | "selected";
      names?: string[];
    };

    console.log(`[Sync] Mode: ${mode}, Names count: ${names?.length || 0}`);

    const fetchAllRows = async <T>(table: string, column: string): Promise<T[]> => {
      const PAGE_SIZE = 1000;
      let allData: T[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select(column)
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        const batch = data || [];
        allData = allData.concat(batch as T[]);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return allData;
    };

    let charactersToSync: string[] = [];

    if (mode === "selected" && names && names.length > 0) {
      charactersToSync = names;
    } else if (mode === "unregistered") {
      const players = await fetchAllRows<{ player_name: string }>("pvp_match_players", "player_name");
      const registered = await fetchAllRows<{ name: string }>("characters", "name");

      const registeredNames = new Set(registered.map((c) => c.name.toLowerCase()));
      const allPlayers = new Set(players.map((p) => p.player_name));

      charactersToSync = [...allPlayers].filter((name) => !registeredNames.has(name.toLowerCase()));
    } else if (mode === "all") {
      const players = await fetchAllRows<{ player_name: string }>("pvp_match_players", "player_name");
      charactersToSync = [...new Set(players.map((p) => p.player_name))];
    }

    console.log(`[Sync] Characters to sync: ${charactersToSync.length}`);

    const results = await syncCharactersFromVortex(supabase, charactersToSync);

    return new Response(
      JSON.stringify({ success: true, summary: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[Sync] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
