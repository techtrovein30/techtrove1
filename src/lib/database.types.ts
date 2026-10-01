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
      admin_allowlist: {
        Row: {
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          created_at?: string;
        };
      };
      internal_participants: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type: "internal" | "external";
          reg_number: string | null;
          college: string | null;
          phone: string | null;
          id_card_path: string | null;
          role: "user" | "admin";
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type?: "internal" | "external";
          reg_number?: string | null;
          college?: string | null;
          phone?: string | null;
          id_card_path?: string | null;
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
          id_card_path?: string | null;
          role?: "user" | "admin";
        };
      };
      external_participants: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type: "internal" | "external";
          reg_number: string | null;
          college: string | null;
          phone: string | null;
          id_card_path: string | null;
          role: "user" | "admin";
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          email: string;
          participant_type?: "internal" | "external";
          reg_number?: string | null;
          college?: string | null;
          phone?: string | null;
          id_card_path?: string | null;
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
          id_card_path?: string | null;
          role?: "user" | "admin";
        };
      };
      registrations_internal: {
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
      registrations_external: {
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
          utr_number?: string | null;
          payment_screenshot_path?: string | null;
          payment_screenshot_url?: string | null;
          payment_review_note?: string | null;
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
          utr_number?: string | null;
          payment_screenshot_path?: string | null;
          payment_screenshot_url?: string | null;
          payment_review_note?: string | null;
        };
        Update: {
          team_name?: string;
          captain_name?: string;
          fee?: number;
          payment_status?: "pending" | "recorded";
          terms_accepted?: boolean;
          members?: RegistrationMember[];
          utr_number?: string | null;
          payment_screenshot_path?: string | null;
          payment_screenshot_url?: string | null;
          payment_review_note?: string | null;
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
          registration_type: string | null;
          eligibility: string | null;
          required_players: number;
          max_substitutes: number;
          registration_open: boolean;
          rules: string[] | null;
          prizes: string[] | null;
          /**
           * 32 lowercase hex, or null on an event created before the column
           * existed. The database backfills and enforces the format, and also
           * provides the default, so a client never has to generate one.
           */
          attendance_token: string | null;
          /**
           * Closes attendance independently of registration_open. Defaults to
           * true for every pre-existing event, which preserves current
           * behaviour; the RPC also refuses when registration_open is false.
           */
          attendance_open: boolean;
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
          registration_type?: string | null;
          eligibility?: string | null;
          required_players?: number;
          max_substitutes?: number;
          registration_open?: boolean;
          rules?: string[] | null;
          prizes?: string[] | null;
          attendance_token?: string | null;
          attendance_open?: boolean;
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
          registration_type?: string | null;
          eligibility?: string | null;
          required_players?: number;
          max_substitutes?: number;
          registration_open?: boolean;
          rules?: string[] | null;
          prizes?: string[] | null;
          /** Must be 32 lowercase hex if set; the check constraint enforces it. */
          attendance_token?: string | null;
          /** Prefer admin_set_event_attendance_open(text, boolean) over writing this. */
          attendance_open?: boolean;
        };
      };
      event_coordinators: {
        Row: {
          id: string;
          event_id: string;
          /**
           * NULL for a coordinator appointed by email who has not signed in yet.
           * Matching in RLS is by user_id OR email, so they are recognised
           * immediately; claim_coordinator_links() fills this in on first login.
           */
          user_id: string | null;
          name: string;
          email: string;
          mobile: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id?: string | null;
          name: string;
          email: string;
          mobile: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          user_id?: string | null;
          name?: string;
          email?: string;
          mobile?: string;
          updated_at?: string;
        };
        /**
         * RLS exposes SELECT only. Every write goes through
         * admin_assign_event_coordinator / admin_remove_event_coordinator, which
         * is where the one-coordinator-per-event rule and the validation live.
         */
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          event_id: string;
          /**
           * text, not uuid: a participant is matched on the email they signed up
           * with, so this may hold either an account id or that participant id.
           */
          participant_id: string;
          participant_email: string;
          participant_name: string | null;
          registration_id: string | null;
          registration_code: string | null;
          status: string;
          /** "qr" for a self-service scan, "manual" for a coordinator override. */
          source: string | null;
          marked_at: string;
          marked_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          participant_id: string;
          participant_email: string;
          participant_name?: string | null;
          registration_id?: string | null;
          registration_code?: string | null;
          status?: string;
          source?: string | null;
          marked_at?: string;
          marked_by?: string | null;
          created_at?: string;
        };
        Update: {
          event_id?: string;
          participant_id?: string;
          participant_email?: string;
          participant_name?: string | null;
          registration_id?: string | null;
          registration_code?: string | null;
          status?: string;
          source?: string | null;
          marked_at?: string;
          marked_by?: string | null;
        };
        /**
         * SELECT-only for clients: a student reads their own rows, a coordinator
         * reads their event, an admin reads everything. Inserts, updates and
         * deletes are refused outright and must go through the RPCs.
         */
        Relationships: [];
      };
      registration_members: {
        Row: {
          id: string;
          registration_id: string;
          registration_code: string;
          user_id: string;
          event_id: string;
          event_name: string | null;
          team_name: string;
          captain_name: string;
          participant_type: "internal" | "external";
          payment_status: string;
          member_name: string;
          member_role: string;
          position: number;
          email: string;
          reg_number: string | null;
          phone: string | null;
          college: string | null;
          attended: boolean;
          certificate_id: string | null;
          certificate_url: string | null;
          certificate_issued_at: string | null;
          attended_at: string | null;
          attended_source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          registration_code: string;
          user_id: string;
          event_id: string;
          event_name?: string | null;
          team_name: string;
          captain_name: string;
          participant_type: "internal" | "external";
          payment_status?: string;
          member_name: string;
          member_role?: string;
          position?: number;
          email: string;
          reg_number?: string | null;
          phone?: string | null;
          college?: string | null;
          attended?: boolean;
          certificate_id?: string | null;
          certificate_url?: string | null;
          certificate_issued_at?: string | null;
          attended_at?: string | null;
          attended_source?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          member_name?: string;
          member_role?: string;
          email?: string;
          reg_number?: string | null;
          phone?: string | null;
          college?: string | null;
          attended?: boolean;
          certificate_id?: string | null;
          certificate_url?: string | null;
          certificate_issued_at?: string | null;
          attended_at?: string | null;
          attended_source?: string | null;
        };
      };
      checkin_tokens: {
        Row: {
          email: string;
          token: string;
          display_name: string | null;
          participant_type: string | null;
          created_at: string;
          updated_at: string;
          revoked_at: string | null;
        };
        Insert: {
          email: string;
          token?: string;
          display_name?: string | null;
          participant_type?: string | null;
          created_at?: string;
          updated_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          email?: string;
          token?: string;
          display_name?: string | null;
          participant_type?: string | null;
          updated_at?: string;
          revoked_at?: string | null;
        };
      };
      checkin_log: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          participant_type: string | null;
          source: string;
          members_checked: number;
          members_total: number;
          already_attended: number;
          admin_id: string | null;
          admin_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          display_name?: string | null;
          participant_type?: string | null;
          source?: string;
          members_checked?: number;
          members_total?: number;
          already_attended?: number;
          admin_id?: string | null;
          admin_email?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      email_outbox: {
        Row: {
          id: number;
          registration_code: string;
          kind: string;
          status: "pending" | "sending" | "sent" | "failed";
          recipient_email: string | null;
          recipient_name: string | null;
          team_name: string | null;
          captain_name: string | null;
          event_refs: string[] | null;
          event_names: string[] | null;
          total_fee: number;
          attempts: number;
          last_error: string | null;
          claimed_at: string | null;
          sent_at: string | null;
          provider_message_id: string | null;
          next_attempt_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          registration_code: string;
          kind?: string;
          status?: "pending" | "sending" | "sent" | "failed";
          recipient_email?: string | null;
          recipient_name?: string | null;
          team_name?: string | null;
          captain_name?: string | null;
          event_refs?: string[] | null;
          event_names?: string[] | null;
          total_fee?: number;
          attempts?: number;
          last_error?: string | null;
          claimed_at?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          next_attempt_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: "pending" | "sending" | "sent" | "failed";
          recipient_email?: string | null;
          recipient_name?: string | null;
          team_name?: string | null;
          captain_name?: string | null;
          event_refs?: string[] | null;
          event_names?: string[] | null;
          total_fee?: number;
          attempts?: number;
          last_error?: string | null;
          claimed_at?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          next_attempt_at?: string | null;
        };
      };
      email_queue_control: {
        Row: {
          id: boolean;
          paused: boolean;
          updated_at: string;
        };
        Insert: {
          id: boolean;
          paused?: boolean;
          updated_at?: string;
        };
        Update: {
          paused?: boolean;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_admin_access: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_event_attendance_token: {
        Args: {
          p_event_id: string;
        };
        Returns: string;
      };
      check_utr_exists: {
        Args: {
          p_utr: string;
          p_exclude_code?: string;
        };
        Returns: boolean;
      };
      username_is_taken: {
        Args: {
          p_username: string;
        };
        Returns: boolean;
      };
      update_own_full_name: {
        Args: {
          p_full_name: string;
        };
        Returns: void;
      };
      update_own_college: {
        Args: {
          p_college: string;
        };
        Returns: void;
      };
      email_queue_claim: {
        Args: {
          p_limit: number;
        };
        Returns: {
          id: number;
          registration_code: string;
          recipient_email: string | null;
          recipient_name: string | null;
          team_name: string | null;
          captain_name: string | null;
          event_names: string[] | null;
          total_fee: number;
          attempts: number;
        }[];
      };
      email_queue_retry: {
        Args: {
          p_id: number;
        };
        Returns: boolean;
      };
      email_queue_set_paused: {
        Args: {
          p_paused: boolean;
        };
        Returns: boolean;
      };
      my_checkin_token: {
        Args: Record<string, never>;
        Returns: {
          token: string;
          email: string;
          display_name: string | null;
          participant_type: string | null;
        }[];
      };
      my_checkin_tokens: {
        Args: Record<string, never>;
        Returns: {
          token: string;
          email: string;
          display_name: string | null;
          participant_type: string | null;
          is_self: boolean;
        }[];
      };
      admin_scan_checkin: {
        Args: {
          p_token: string;
          p_source?: string;
        };
        Returns: {
          ok: boolean;
          reason: string;
          email: string | null;
          display_name: string | null;
          participant_type: string | null;
          members_checked: number;
          members_total: number;
          already_attended: number;
        }[];
      };

      // ── Coordinator / event attendance ────────────────────────────────────
      //
      // Every write in this group returns jsonb with an `ok` field plus a
      // `reason` string, rather than raising. That is deliberate: the scanner
      // needs a definite, displayable verdict for each case, and a raised error
      // would collapse "you have not paid" into "something went wrong".

      /**
       * Student scans the event QR. The ONLY argument is the token: the event
       * comes from the token and the participant from auth.uid(), so the client
       * has no way to name somebody else.
       *
       * `reason` is one of: success, already_attended, not_registered, not_paid,
       * no_profile, invalid_qr, event_disabled, not_logged_in, error.
       *
       * already_attended comes back with ok:false ON PURPOSE. It is a refusal,
       * not a fresh success, and the duplicate screen renders the ORIGINAL
       * `marked_at` - do not "fix" this to ok:true.
       */
      mark_event_attendance: {
        Args: {
          p_token: string;
        };
        Returns: {
          ok: boolean;
          reason: string;
          message: string;
          event_id?: string;
          event_name?: string;
          marked_at?: string;
        };
      };
      /** Assign or replace the ONE main coordinator for an event. */
      admin_assign_event_coordinator: {
        Args: {
          p_event_id: string;
          p_name: string;
          p_email: string;
          p_mobile: string;
        };
        Returns: {
          ok: boolean;
          reason: string;
          message: string;
          coordinator?: {
            id: string;
            user_id: string | null;
            name: string;
            email: string;
            mobile: string;
          };
        };
      };
      admin_remove_event_coordinator: {
        Args: {
          p_event_id: string;
        };
        Returns: {
          ok: boolean;
          reason: string;
          message: string;
        };
      };
      /** Admin-only. A coordinator calling this is refused. */
      admin_set_event_attendance_open: {
        Args: {
          p_event_id: string;
          p_open: boolean;
        };
        Returns: {
          ok: boolean;
          reason: string;
          message: string;
          open?: boolean;
        };
      };
      /**
       * Manual mark or undo by a coordinator/admin, scoped to their own event.
       * Also the undo path: p_present false deletes the attendance row and
       * re-syncs the legacy roster.
       */
      admin_mark_event_attendance: {
        Args: {
          p_event_id: string;
          p_participant_id: string;
          p_present: boolean;
        };
        Returns: {
          ok: boolean;
          reason: string;
          message: string;
        };
      };
      /**
       * Pins user_id onto any email-matched coordinator row for the current user.
       * Safe to call on every sign-in; returns the number of rows linked.
       */
      claim_coordinator_links: {
        Args: Record<string, never>;
        Returns: number;
      };
      is_event_coordinator: {
        Args: {
          p_event_id: string;
        };
        Returns: boolean;
      };
      is_event_admin: {
        Args: {
          p_event_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}

/** Used by the registrations.members JSON column */
export interface RegistrationMember {
  name: string;
  role: "player" | "substitute";
  position: number;
  participantType: "internal" | "external";
  email: string;
  regNumber?: string;
  phone?: string;
}
