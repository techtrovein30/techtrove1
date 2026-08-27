/**
 * database.types.ts
 * ------------------
 * Manually maintained TypeScript types that mirror the Supabase
 * Postgres schema. If you add/change columns, update this file too.
 *
 * You can also auto-generate this with the Supabase CLI:
 *   npx supabase gen types typescript --project-id odozwlmavgrazgpnjmze > src/lib/database.types.ts
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type: "internal" | "external";
          reg_number: string | null;
          college: string | null;
          phone: string | null;
          role: "user" | "admin";
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type: "internal" | "external";
          reg_number?: string | null;
          college?: string | null;
          phone?: string | null;
          role?: "user" | "admin";
          created_at?: string;
        };
        Update: {
          username?: string;
          full_name?: string;
          email?: string;
          participant_type?: "internal" | "external";
          reg_number?: string | null;
          college?: string | null;
          phone?: string | null;
          role?: "user" | "admin";
        };
      };
      events: {
        Row: {
          id: string;
          day_id: string;
          name: string;
          category: string | null;
          description: string | null;
          venue: string | null;
          time: string | null;
          duration: string | null;
          coordinator: string | null;
          registration_fee: number;
          required_players: number;
          max_substitutes: number;
          registration_open: boolean;
          rules: string[] | null;
          prizes: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          day_id: string;
          name: string;
          category?: string | null;
          description?: string | null;
          venue?: string | null;
          time?: string | null;
          duration?: string | null;
          coordinator?: string | null;
          registration_fee?: number;
          required_players?: number;
          max_substitutes?: number;
          registration_open?: boolean;
          rules?: string[] | null;
          prizes?: string[] | null;
          created_at?: string;
        };
        Update: {
          day_id?: string;
          name?: string;
          category?: string | null;
          description?: string | null;
          venue?: string | null;
          time?: string | null;
          duration?: string | null;
          coordinator?: string | null;
          registration_fee?: number;
          required_players?: number;
          max_substitutes?: number;
          registration_open?: boolean;
          rules?: string[] | null;
          prizes?: string[] | null;
        };
      };
      registrations: {
        Row: {
          id: string;
          registration_code: string;
          user_id: string;
          event_id: string;
          team_name: string;
          captain_name: string;
          fee: number;
          payment_status: "pending" | "recorded";
          terms_accepted: boolean;
          members: RegistrationMember[];
          created_at: string;
        };
        Insert: {
          id?: string;
          registration_code: string;
          user_id: string;
          event_id: string;
          team_name: string;
          captain_name: string;
          fee?: number;
          payment_status?: "pending" | "recorded";
          terms_accepted?: boolean;
          members?: RegistrationMember[];
          created_at?: string;
        };
        Update: {
          team_name?: string;
          captain_name?: string;
          fee?: number;
          payment_status?: "pending" | "recorded";
          terms_accepted?: boolean;
          members?: RegistrationMember[];
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export interface RegistrationMember {
  name: string;
  role: "player" | "substitute";
  position: number;
  participantType: "internal" | "external";
  email: string;
  regNumber?: string;
  phone?: string;
}
