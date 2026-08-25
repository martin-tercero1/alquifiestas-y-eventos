/**
 * Database types.
 *
 * GENERATED — do not hand-edit. Regenerate after every migration with:
 *   pnpm dlx supabase gen types typescript --project-id gxjrbxtafkshgsimhzek > src/lib/supabase/types.ts
 *
 * The verbose generic helpers Supabase emits are replaced at the bottom with
 * short equivalents; the schema itself is verbatim, because that is the part
 * that drifts.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AvailabilityRow = {
  variant_id: string;
  total_quantity: number | null;
  peak_occupied: number;
  available: number | null;
  is_unknown: boolean;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          parent_id: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          parent_id?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          name: string;
          source_name: string | null;
          description: string | null;
          category_id: string;
          odoo_id: number | null;
          internal_note: string | null;
          photo_status: string;
          needs_review: boolean;
          needs_review_reason: string | null;
          option_name: string | null;
          option_values: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          source_name?: string | null;
          description?: string | null;
          category_id: string;
          odoo_id?: number | null;
          internal_note?: string | null;
          photo_status?: string;
          needs_review?: boolean;
          needs_review_reason?: string | null;
          option_name?: string | null;
          option_values?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      variants: {
        Row: {
          id: string;
          product_id: string;
          label: string | null;
          source_label: string | null;
          source_key: string | null;
          price_per_day: number | null;
          price_source: string | null;
          total_quantity: number | null;
          quantity_source: string | null;
          published: boolean;
          label_overridden: boolean;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          label?: string | null;
          source_label?: string | null;
          source_key?: string | null;
          price_per_day?: number | null;
          price_source?: string | null;
          total_quantity?: number | null;
          quantity_source?: string | null;
          published?: boolean;
          label_overridden?: boolean;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["variants"]["Insert"]>;
        Relationships: [];
      };
      product_photos: {
        Row: {
          id: string;
          product_id: string;
          crop: string;
          storage_path: string;
          width: number;
          height: number;
          focal_x: number;
          focal_y: number;
          source_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          crop: string;
          storage_path: string;
          width: number;
          height: number;
          focal_x?: number;
          focal_y?: number;
          source_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_photos"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          phone_alt: string | null;
          /** Generated from phone (last-8 split). Read-only — never write. */
          phone_cc: string | null;
          /** Generated from phone (last 8 digits). Read-only — never write. */
          phone_national: string | null;
          cedula: string | null;
          email: string | null;
          city: string | null;
          address: string | null;
          ruc: string | null;
          notes: string | null;
          odoo_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          phone_alt?: string | null;
          cedula?: string | null;
          email?: string | null;
          city?: string | null;
          address?: string | null;
          ruc?: string | null;
          notes?: string | null;
          odoo_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          number: number;
          customer_id: string;
          status: Database["public"]["Enums"]["order_status"];
          pickup_date: string;
          agreed_return_date: string;
          pickup_time: string | null;
          agreed_return_time: string | null;
          actual_return_date: string | null;
          billed_days: number;
          fulfilment: Database["public"]["Enums"]["fulfilment_method"];
          delivery_address: string | null;
          delivery_cost: number | null;
          payment_method: Database["public"]["Enums"]["payment_method"];
          security_deposit: number | null;
          deposit_returned_at: string | null;
          discount_type: Database["public"]["Enums"]["discount_type"] | null;
          discount_value: number | null;
          physical_invoice_number: string | null;
          availability_overridden: boolean;
          override_reason: string | null;
          notes: string | null;
          source: string;
          cedula_retained: boolean;
          review_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          number?: number;
          customer_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          pickup_date: string;
          agreed_return_date: string;
          actual_return_date?: string | null;
          billed_days?: number;
          fulfilment?: Database["public"]["Enums"]["fulfilment_method"];
          delivery_address?: string | null;
          delivery_cost?: number | null;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          security_deposit?: number | null;
          deposit_returned_at?: string | null;
          discount_type?: Database["public"]["Enums"]["discount_type"] | null;
          discount_value?: number | null;
          physical_invoice_number?: string | null;
          availability_overridden?: boolean;
          override_reason?: string | null;
          notes?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_lines: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          unit_price: number;
          discount_type: Database["public"]["Enums"]["discount_type"] | null;
          discount_value: number | null;
          option_choice: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          unit_price: number;
          discount_type?: Database["public"]["Enums"]["discount_type"] | null;
          discount_value?: number | null;
          option_choice?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_lines"]["Insert"]>;
        Relationships: [];
      };
      return_events: {
        Row: {
          id: string;
          order_line_id: string;
          returned_on: string;
          quantity_returned: number;
          quantity_missing: number;
          quantity_damaged: number;
          quantity_written_off: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_line_id: string;
          returned_on: string;
          quantity_returned: number;
          quantity_missing?: number;
          quantity_damaged?: number;
          quantity_written_off?: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["return_events"]["Insert"]>;
        Relationships: [];
      };
      stock_adjustments: {
        Row: {
          id: string;
          variant_id: string;
          delta: number;
          reason: string;
          return_event_id: string | null;
          previous_total: number | null;
          new_total: number | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          variant_id: string;
          delta: number;
          reason: string;
          return_event_id?: string | null;
          previous_total?: number | null;
          new_total?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["stock_adjustments"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          paid_on: string;
          method: Database["public"]["Enums"]["payment_method"];
          kind: Database["public"]["Enums"]["payment_kind"];
          reference: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          amount: number;
          paid_on?: string;
          method: Database["public"]["Enums"]["payment_method"];
          kind?: Database["public"]["Enums"]["payment_kind"];
          reference?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      charges: {
        Row: {
          id: string;
          order_id: string;
          kind: Database["public"]["Enums"]["charge_kind"];
          amount: number;
          description: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          kind: Database["public"]["Enums"]["charge_kind"];
          amount: number;
          description?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["charges"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          order_id: string;
          type: Database["public"]["Enums"]["document_type"];
          number: number;
          issued_at: string;
          voided_at: string | null;
          void_reason: string | null;
          business_ruc: string | null;
          customer_ruc: string | null;
          subtotal: number | null;
          tax_total: number | null;
          tax_breakdown: Json | null;
          total: number | null;
          snapshot: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          type: Database["public"]["Enums"]["document_type"];
          number?: number;
          issued_at?: string;
          voided_at?: string | null;
          void_reason?: string | null;
          business_ruc?: string | null;
          customer_ruc?: string | null;
          subtotal?: number | null;
          tax_total?: number | null;
          tax_breakdown?: Json | null;
          total?: number | null;
          snapshot: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: Database["public"]["Enums"]["order_status"] | null;
          to_status: Database["public"]["Enums"]["order_status"];
          changed_at: string;
          changed_by: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: Database["public"]["Enums"]["order_status"] | null;
          to_status: Database["public"]["Enums"]["order_status"];
          changed_at?: string;
          changed_by?: string | null;
          note?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["order_status_history"]["Insert"]
        >;
        Relationships: [];
      };
      staff: {
        Row: {
          user_id: string;
          display_name: string;
          active: boolean;
          is_tech_admin: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          active?: boolean;
          is_tech_admin?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["staff"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["push_subscriptions"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      order_totals: {
        Row: {
          order_id: string | null;
          number: number | null;
          lines_total: number | null;
          lines_after_discount: number | null;
          charges_total: number | null;
          total_charged: number | null;
          total_paid: number | null;
          balance: number | null;
          deposit_held: number | null;
        };
        Relationships: [];
      };
      public_catalog: {
        Row: {
          variant_id: string | null;
          product_id: string | null;
          product_slug: string | null;
          product_name: string | null;
          description: string | null;
          variant_label: string | null;
          price_per_day: number | null;
          total_quantity: number | null;
          category_slug: string | null;
          category_name: string | null;
          parent_category_slug: string | null;
          parent_category_name: string | null;
          category_display_order: number | null;
          photo_square: string | null;
          photo_portrait: string | null;
        };
        Relationships: [];
      };
      staff_catalog: {
        Row: {
          variant_id: string | null;
          product_id: string | null;
          product_slug: string | null;
          product_name: string | null;
          variant_label: string | null;
          price_per_day: number | null;
          price_source: string | null;
          total_quantity: number | null;
          quantity_source: string | null;
          published: boolean | null;
          category_id: string | null;
          category_name: string | null;
          category_display_order: number | null;
          top_category_name: string | null;
          photo_square: string | null;
          internal_note: string | null;
        };
        Relationships: [];
      };
      estimated_values: {
        Row: {
          variant_id: string | null;
          product_name: string | null;
          variant_label: string | null;
          source_key: string | null;
          price_per_day: number | null;
          price_source: string | null;
          total_quantity: number | null;
          quantity_source: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      availability_for_variants: {
        Args: { p_variant_ids: string[]; p_start: string; p_end: string };
        Returns: AvailabilityRow[];
      };
      availability_for_variant: {
        Args: { p_variant_id: string; p_start: string; p_end: string };
        Returns: AvailabilityRow[];
      };
      availability_conflicts: {
        Args: { p_variant_id: string; p_start: string; p_end: string };
        Returns: {
          order_id: string;
          order_number: number;
          customer_name: string;
          status: Database["public"]["Enums"]["order_status"];
          pickup_date: string;
          occupancy_ends: string;
          quantity: number;
          is_overdue: boolean;
        }[];
      };
      order_occupancy_end: {
        Args: { p_actual_return: string; p_agreed_return: string };
        Returns: string;
      };
      search_normalize: {
        Args: { input: string };
        Returns: string;
      };
      search_variants: {
        Args: { q?: string; limit_n?: number };
        Returns: {
          variant_id: string;
          product_id: string;
          product_name: string;
          variant_label: string | null;
          category_name: string;
          price_per_day: number | null;
          price_source: string | null;
          total_quantity: number | null;
          published: boolean;
          photo_square: string | null;
          option_name: string | null;
          option_values: string[] | null;
          score: number;
        }[];
      };
      search_customers: {
        Args: { q?: string; limit_n?: number };
        Returns: {
          id: string;
          name: string;
          phone: string | null;
          phone_alt: string | null;
          orders_count: number;
          last_order_at: string | null;
          score: number;
        }[];
      };
      create_staff_order: {
        Args: { p: Json };
        Returns: Json;
      };
      issue_comprobante: {
        Args: { p_order_id: string; p_business_ruc?: string | null };
        Returns: Json;
      };
      add_variant: {
        Args: { p_product_id: string; p: Json };
        Returns: Json;
      };
      set_product_option: {
        Args: { p_product_id: string; p: Json };
        Returns: Json;
      };
      revise_order_lines: {
        Args: { p_order_id: string; p_lines: Json };
        Returns: Json;
      };
      save_push_subscription: {
        Args: { p_subscription: Json };
        Returns: Json;
      };
      delete_push_subscription: {
        Args: { p_endpoint: string };
        Returns: Json;
      };
      apply_discount: {
        Args: {
          base: number;
          kind: Database["public"]["Enums"]["discount_type"];
          value: number;
        };
        Returns: number;
      };
      submit_reservation_request: {
        Args: {
          p_customer_name: string;
          p_customer_phone: string;
          p_pickup_date: string;
          p_days: number;
          p_fulfilment: Database["public"]["Enums"]["fulfilment_method"];
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_lines: Json;
          p_delivery_address?: string | null;
          p_notes?: string | null;
          p_cedula?: string | null;
          p_pickup_time?: string | null;
        };
        Returns: Json;
      };
      confirm_order: {
        Args: {
          p_order_id: string;
          p_delivery_cost?: number | null;
          p_security_deposit?: number | null;
          p_physical_invoice_number?: string | null;
        };
        Returns: Json;
      };
      record_payment: {
        Args: {
          p_order_id: string;
          p_amount: number;
          p_method?: Database["public"]["Enums"]["payment_method"];
          p_kind?: Database["public"]["Enums"]["payment_kind"];
          p_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      mark_picked_up: {
        Args: { p_order_id: string; p_cedula?: string | null };
        Returns: Json;
      };
      record_return: {
        Args: {
          p_order_id: string;
          p_lines: Json;
          p_returned_on?: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      add_order_charge: {
        Args: {
          p_order_id: string;
          p_kind: Database["public"]["Enums"]["charge_kind"];
          p_amount: number;
          p_description?: string | null;
        };
        Returns: Json;
      };
      cancel_order: { Args: { p_order_id: string; p_reason: string }; Returns: Json };
      close_order: { Args: { p_order_id: string }; Returns: Json };
      admin_delete_order: {
        Args: { p_order_id: string; p_force?: boolean };
        Returns: Json;
      };
      admin_delete_customer: { Args: { p_customer_id: string }; Returns: Json };
      admin_delete_product: { Args: { p_product_id: string }; Returns: Json };
      create_product: { Args: { p: Json }; Returns: Json };
      create_category: { Args: { p: Json }; Returns: Json };
    };
    Enums: {
      charge_kind: "late_fee" | "damage" | "missing_item" | "delivery" | "other";
      discount_type: "amount" | "percent";
      document_type: "proforma" | "comprobante";
      fulfilment_method: "pickup" | "delivery";
      order_status:
        | "pending_request"
        | "confirmed"
        | "picked_up"
        | "partially_returned"
        | "returned"
        | "closed"
        | "cancelled";
      payment_kind: "advance" | "balance" | "deposit" | "refund";
      payment_method: "cash" | "transfer";
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R }
    ? R
    : never;

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T] extends { Update: infer U } ? U : never;

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
