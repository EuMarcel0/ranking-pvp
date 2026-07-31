export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      badge_definitions: {
        Row: {
          code: string
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string
          emoji: string
          enabled: boolean
          id: string
          name: string
          rarity: string
        }
        Insert: {
          code: string
          created_at?: string
          criteria_type: string
          criteria_value: number
          description: string
          emoji?: string
          enabled?: boolean
          id?: string
          name: string
          rarity?: string
        }
        Update: {
          code?: string
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string
          emoji?: string
          enabled?: boolean
          id?: string
          name?: string
          rarity?: string
        }
        Relationships: []
      }
      characters: {
        Row: {
          banned: boolean
          class: string
          class_short: string
          created_at: string
          guild: string
          id: string
          is_main: boolean
          name: string
          pilot_name: string
        }
        Insert: {
          banned?: boolean
          class: string
          class_short?: string
          created_at?: string
          guild: string
          id?: string
          is_main?: boolean
          name: string
          pilot_name?: string
        }
        Update: {
          banned?: boolean
          class?: string
          class_short?: string
          created_at?: string
          guild?: string
          id?: string
          is_main?: boolean
          name?: string
          pilot_name?: string
        }
        Relationships: []
      }
      discord_highlight_phrases: {
        Row: {
          category: string
          created_at: string
          id: string
          last_used_at: string | null
          phrase_template: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          phrase_template: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          phrase_template?: string
        }
        Relationships: []
      }
      milestone_thresholds: {
        Row: {
          created_at: string
          emoji: string
          enabled: boolean
          id: string
          label: string
          metric: string
          threshold: number
        }
        Insert: {
          created_at?: string
          emoji?: string
          enabled?: boolean
          id?: string
          label: string
          metric: string
          threshold: number
        }
        Update: {
          created_at?: string
          emoji?: string
          enabled?: boolean
          id?: string
          label?: string
          metric?: string
          threshold?: number
        }
        Relationships: []
      }
      player_badges: {
        Row: {
          achieved_at: string
          badge_code: string
          id: string
          match_id: string | null
          notified: boolean
          player_name: string
        }
        Insert: {
          achieved_at?: string
          badge_code: string
          id?: string
          match_id?: string | null
          notified?: boolean
          player_name: string
        }
        Update: {
          achieved_at?: string
          badge_code?: string
          id?: string
          match_id?: string | null
          notified?: boolean
          player_name?: string
        }
        Relationships: []
      }
      player_milestones: {
        Row: {
          achieved_at: string
          emoji: string
          id: string
          label: string
          metric: string
          notified: boolean
          player_name: string
          threshold: number
        }
        Insert: {
          achieved_at?: string
          emoji?: string
          id?: string
          label: string
          metric: string
          notified?: boolean
          player_name: string
          threshold: number
        }
        Update: {
          achieved_at?: string
          emoji?: string
          id?: string
          label?: string
          metric?: string
          notified?: boolean
          player_name?: string
          threshold?: number
        }
        Relationships: []
      }
      pvp_kill_logs: {
        Row: {
          created_at: string
          id: string
          killer_name: string
          match_id: string
          victim_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          killer_name: string
          match_id: string
          victim_name: string
        }
        Update: {
          created_at?: string
          id?: string
          killer_name?: string
          match_id?: string
          victim_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvp_kill_logs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "pvp_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      pvp_match_players: {
        Row: {
          created_at: string
          deaths: number
          id: string
          kda: number
          kills: number
          match_id: string
          player_name: string
        }
        Insert: {
          created_at?: string
          deaths?: number
          id?: string
          kda?: number
          kills?: number
          match_id: string
          player_name: string
        }
        Update: {
          created_at?: string
          deaths?: number
          id?: string
          kda?: number
          kills?: number
          match_id?: string
          player_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pvp_match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "pvp_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      pvp_matches: {
        Row: {
          boss_label: string
          boss_killer: string | null
          boss_npc_id: number | null
          created_at: string
          event_type: string
          id: string
          match_date: string
          match_hour: number
          match_minute: number
          winner_guild: string | null
        }
        Insert: {
          boss_label: string
          boss_killer?: string | null
          boss_npc_id?: number | null
          created_at?: string
          event_type?: string
          id?: string
          match_date: string
          match_hour: number
          match_minute?: number
          winner_guild?: string | null
        }
        Update: {
          boss_label?: string
          boss_killer?: string | null
          boss_npc_id?: number | null
          created_at?: string
          event_type?: string
          id?: string
          match_date?: string
          match_hour?: number
          match_minute?: number
          winner_guild?: string | null
        }
        Relationships: []
      }
      monster_kill_baselines: {
        Row: {
          npc_id: number
          character_name: string
          kill_count: number
          updated_at: string
        }
        Insert: {
          npc_id: number
          character_name: string
          kill_count?: number
          updated_at?: string
        }
        Update: {
          npc_id?: number
          character_name?: string
          kill_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      boss_kill_triggers: {
        Row: {
          id: string
          match_date: string
          match_hour: number
          match_minute: number
          event_type: string
          npc_id: number
          killer_name: string
          triggered_at: string
        }
        Insert: {
          id?: string
          match_date: string
          match_hour: number
          match_minute?: number
          event_type?: string
          npc_id: number
          killer_name: string
          triggered_at?: string
        }
        Update: {
          id?: string
          match_date?: string
          match_hour?: number
          match_minute?: number
          event_type?: string
          npc_id?: number
          killer_name?: string
          triggered_at?: string
        }
        Relationships: []
      }
      season_snapshots: {
        Row: {
          created_at: string
          extra_data: Json | null
          id: string
          player_class: string | null
          player_guild: string | null
          player_name: string
          position: number
          ranking_type: string
          score: number
          season_id: string
        }
        Insert: {
          created_at?: string
          extra_data?: Json | null
          id?: string
          player_class?: string | null
          player_guild?: string | null
          player_name: string
          position: number
          ranking_type: string
          score?: number
          season_id: string
        }
        Update: {
          created_at?: string
          extra_data?: Json | null
          id?: string
          player_class?: string | null
          player_guild?: string | null
          player_name?: string
          position?: number
          ranking_type?: string
          score?: number
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_snapshots_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          closed_at: string | null
          created_at: string
          ended_at: string | null
          id: string
          month: number
          name: string
          started_at: string
          status: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          month: number
          name: string
          started_at: string
          status?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          month?: number
          name?: string
          started_at?: string
          status?: string
          year?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_friendly_fire_per_match: {
        Row: {
          ff_deaths: number | null
          ff_kills: number | null
          match_id: string | null
          player_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      check_player_badges: {
        Args: never
        Returns: {
          p_badge_code: string
          p_emoji: string
          p_label: string
          p_name: string
          p_rarity: string
        }[]
      }
      check_player_milestones: {
        Args: never
        Returns: {
          p_emoji: string
          p_label: string
          p_metric: string
          p_name: string
          p_threshold: number
        }[]
      }
      close_current_season: {
        Args: never
        Returns: {
          closed_season_id: string
          new_season_id: string
          snapshots_created: number
        }[]
      }
      get_active_season: {
        Args: never
        Returns: {
          id: string
          month: number
          name: string
          started_at: string
          year: number
        }[]
      }
      get_analytics_kill_logs: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_guild?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          killer_name: string
          match_id: string
          victim_name: string
        }[]
      }
      get_class_guild_ranking: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          deaths: number
          kills: number
          player_class: string
          player_guild: string
          player_name: string
        }[]
      }
      get_class_matchup_matrix: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
        }
        Returns: {
          attacker_class: string
          kills: number
          victim_class: string
        }[]
      }
      get_cron_status: { Args: { p_job_name: string }; Returns: Json }
      get_ranking_best_per_class: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
        }
        Returns: {
          class_name: string
          event_score: number
          is_best: boolean
          match_count: number
          player_name: string
          total_deaths: number
          total_kda: number
          total_kills: number
        }[]
      }
      get_ranking_fogo_amigo: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          event_score: number
          friendly_deaths: number
          friendly_kills: number
          kda: number
          player_class: string
          player_class_short: string
          player_guild: string
          player_name: string
        }[]
      }
      get_ranking_geral: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          event_score: number
          kda: number
          matches_played: number
          player_class: string
          player_class_short: string
          player_guild: string
          player_name: string
          single_match_max_kills: number
          total_deaths: number
          total_kills: number
          weighted_kda: number
        }[]
      }
      get_ranking_kill_streak: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          max_streak: number
          player_class: string
          player_class_short: string
          player_guild: string
          player_name: string
        }[]
      }
      get_ranking_mural_vergonha: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          avg_deaths_per_match: number
          matches_played: number
          player_class: string
          player_guild: string
          player_name: string
          total_deaths: number
          total_kills: number
        }[]
      }
      get_ranking_nunca_positivo: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          best_kda: number
          best_score: number
          matches_played: number
          negative_count: number
          player_class: string
          player_guild: string
          player_name: string
          total_deaths: number
          total_kills: number
        }[]
      }
      get_ranking_putinha: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
          p_hour_from?: number
          p_hour_to?: number
        }
        Returns: {
          deaths: number
          killer_guild: string
          killer_name: string
          victim_guild: string
          victim_name: string
        }[]
      }
      get_ranking_reis_pvp: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_event_type?: string
        }
        Returns: {
          extreme_match_date: string
          extreme_match_hour: number
          is_rei: boolean
          media_score: number
          melhor_score: number
          pior_score: number
          player_name: string
          vezes: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_users_with_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          role_id: string
          user_id: string
        }[]
      }
      reopen_season: { Args: { _season_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user" | "moderator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "moderator"],
    },
  },
} as const
