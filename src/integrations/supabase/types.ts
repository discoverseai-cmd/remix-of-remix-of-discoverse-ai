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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_memory_session: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          meta: Json | null
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          meta?: Json | null
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          meta?: Json | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_session_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory_user: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          created_at: string
          credits_spent: number
          error: string | null
          final_output: string | null
          finished_at: string | null
          id: string
          input: string
          message_id: string | null
          model: string
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_spent?: number
          error?: string | null
          final_output?: string | null
          finished_at?: string | null
          id?: string
          input?: string
          message_id?: string | null
          model?: string
          session_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_spent?: number
          error?: string | null
          final_output?: string | null
          finished_at?: string | null
          id?: string
          input?: string
          message_id?: string | null
          model?: string
          session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_steps: {
        Row: {
          content: string | null
          created_at: string
          credits: number
          data: Json | null
          id: string
          idx: number
          kind: string
          run_id: string
          title: string | null
          tool: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          credits?: number
          data?: Json | null
          id?: string
          idx: number
          kind: string
          run_id: string
          title?: string | null
          tool?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          credits?: number
          data?: Json | null
          id?: string
          idx?: number
          kind?: string
          run_id?: string
          title?: string | null
          tool?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          interrupted: boolean
          role: string
          session_id: string
          steps: Json | null
          stop_reason: string | null
          timeline: Json | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          interrupted?: boolean
          role: string
          session_id: string
          steps?: Json | null
          stop_reason?: string | null
          timeline?: Json | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          interrupted?: boolean
          role?: string
          session_id?: string
          steps?: Json | null
          stop_reason?: string | null
          timeline?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_session_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          session_id: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          session_id: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          model: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          message_id: string | null
          meta: Json | null
          reason: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          message_id?: string | null
          meta?: Json | null
          reason: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          message_id?: string | null
          meta?: Json | null
          reason?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          max_redemptions: number | null
          redemption_count: number
          tier: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          max_redemptions?: number | null
          redemption_count?: number
          tier?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          max_redemptions?: number | null
          redemption_count?: number
          tier?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          daily_limit: number
          last_daily_reset: string
          last_monthly_reset: string
          monthly_limit: number
          signup_anniversary_day: number
          tier: string
          updated_at: string
          upgraded_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          daily_limit?: number
          last_daily_reset?: string
          last_monthly_reset?: string
          monthly_limit?: number
          signup_anniversary_day?: number
          tier?: string
          updated_at?: string
          upgraded_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          daily_limit?: number
          last_daily_reset?: string
          last_monthly_reset?: string
          monthly_limit?: number
          signup_anniversary_day?: number
          tier?: string
          updated_at?: string
          upgraded_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_credits: {
        Args: {
          _amount: number
          _message_id?: string
          _meta?: Json
          _reason: string
          _session_id?: string
          _user_id: string
        }
        Returns: number
      }
      match_session_memory: {
        Args: {
          _k?: number
          _query: string
          _session_id: string
          _user_id: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
      match_user_memory: {
        Args: { _k?: number; _query: string; _user_id: string }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
      record_agent_step: {
        Args: {
          _content: string
          _credits: number
          _data: Json
          _idx: number
          _kind: string
          _run_id: string
          _title: string
          _tool: string
          _user_id: string
        }
        Returns: number
      }
      redeem_promo_code: { Args: { _code: string }; Returns: Json }
      reset_credits_if_due: {
        Args: { _user_id: string }
        Returns: {
          balance: number
          created_at: string
          daily_limit: number
          last_daily_reset: string
          last_monthly_reset: string
          monthly_limit: number
          signup_anniversary_day: number
          tier: string
          updated_at: string
          upgraded_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_credits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
