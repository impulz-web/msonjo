export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TimestampColumns = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: TimestampColumns & {
          id: string;
          name: string;
          slug: string;
          category: string | null;
        };
        Insert: never;
        Update: {
          name?: string;
          slug?: string;
          category?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_members: {
        Row: {
          id: string;
          business_id: string;
          user_id: string;
          role: 'owner' | 'manager' | 'attendant';
          created_at: string;
        };
        Insert: {
          business_id: string;
          user_id: string;
          role: 'owner' | 'manager' | 'attendant';
          id?: string;
          created_at?: string;
        };
        Update: {
          role?: 'owner' | 'manager' | 'attendant';
        };
        Relationships: [];
      };
      products: {
        Row: TimestampColumns & {
          id: string;
          business_id: string;
          name: string;
          sku: string | null;
          category: string | null;
          cost_price: number;
          selling_price: number;
          quantity: number;
          low_stock_threshold: number;
          is_archived: boolean;
        };
        Insert: {
          business_id: string;
          name: string;
          sku?: string | null;
          category?: string | null;
          cost_price: number;
          selling_price: number;
          low_stock_threshold?: number;
        };
        Update: {
          name?: string;
          sku?: string | null;
          category?: string | null;
          cost_price?: number;
          selling_price?: number;
          quantity?: never;
          low_stock_threshold?: number;
          is_archived?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          business_id: string;
          created_by: string;
          total_amount: number;
          idempotency_key: string;
          payment_method: 'cash' | 'mpesa' | 'other' | null;
          sale_status: 'completed';
          request_payload: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_items: {
        Row: {
          id: string;
          business_id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          subtotal: number;
          unit_cost_snapshot: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          business_id: string;
          product_id: string;
          movement_type: 'sale' | 'restock' | 'adjustment' | 'return' | 'correction' | 'damaged' | 'lost';
          quantity_change: number;
          reason: string | null;
          created_by: string;
          sale_id: string | null;
          operation_key: string | null;
          request_payload: Json | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: TimestampColumns & {
          business_id: string;
          plan: 'free' | 'standard' | 'premium';
          status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_accounts: {
        Row: {
          business_id: string;
          sale_id: string;
          initial_amount_paid: number;
          initial_request_key: string;
          customer_name: string | null;
          customer_phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_payments: {
        Row: {
          id: string;
          business_id: string;
          sale_id: string;
          amount: number;
          payment_method: 'cash' | 'mpesa' | 'other';
          idempotency_key: string;
          created_by: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_edits: {
        Row: {
          id: string;
          business_id: string;
          sale_id: string;
          idempotency_key: string;
          changed_by: string;
          before_total: number;
          after_total: number;
          request_payload: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sale_manual_items: {
        Row: {
          id: string;
          business_id: string;
          sale_id: string;
          line_number: number;
          name: string;
          quantity: number;
          unit_price: number;
          unit_cost_snapshot: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      create_product: {
        Args: {
          p_business_id: string;
          p_name: string;
          p_sku: string | null;
          p_category: string | null;
          p_cost_price: number;
          p_selling_price: number;
          p_low_stock_threshold: number;
          p_initial_quantity: number;
          p_operation_key: string | null;
        };
        Returns: string;
      };
      list_products: {
        Args: {
          p_business_id: string;
          p_search: string;
          p_category: string | null;
          p_stock_status: string;
          p_sort: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: Json;
      };
      get_product_detail: {
        Args: { p_business_id: string; p_product_id: string };
        Returns: Json;
      };
      get_sale_detail: {
        Args: { p_business_id: string; p_sale_id: string };
        Returns: Json;
      };
      create_sale: {
        Args: {
          p_business_id: string;
          p_idempotency_key: string;
          p_payment_method: string;
          p_items: Json;
        };
        Returns: string;
      };
      record_sale_with_payment: {
        Args: {
          p_business_id: string;
          p_idempotency_key: string;
          p_payment_method: string;
          p_payment_status: string;
          p_items: Json;
          p_amount_paid: number;
          p_customer_name: string | null;
          p_customer_phone: string | null;
        };
        Returns: string;
      };
      create_sale_with_lines: {
        Args: {
          p_business_id: string;
          p_idempotency_key: string;
          p_payment_method: string;
          p_items: Json;
        };
        Returns: string;
      };
      get_sale_detail_with_manual_items: {
        Args: { p_business_id: string; p_sale_id: string };
        Returns: Json;
      };
      edit_sale_with_lines: {
        Args: {
          p_business_id: string;
          p_sale_id: string;
          p_idempotency_key: string;
          p_payment_method: string;
          p_items: Json;
          p_amount_paid: number;
          p_customer_name: string | null;
          p_customer_phone: string | null;
        };
        Returns: string;
      };
      edit_sale_with_payment: {
        Args: {
          p_business_id: string;
          p_sale_id: string;
          p_idempotency_key: string;
          p_payment_method: string;
          p_items: Json;
          p_amount_paid: number;
          p_customer_name: string | null;
          p_customer_phone: string | null;
        };
        Returns: string;
      };
      get_daily_sales: {
        Args: {
          p_business_id: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: Json;
      };
      adjust_stock: {
        Args: {
          p_business_id: string;
          p_product_id: string;
          p_quantity_change: number;
          p_movement_type: string;
          p_reason: string | null;
          p_operation_key: string;
        };
        Returns: string;
      };
      get_business_dashboard: {
        Args: { p_business_id: string };
        Returns: Json;
      };
      get_business_reports: {
        Args: { p_business_id: string; p_start_date: string; p_end_date: string };
        Returns: Json;
      };
      has_business_role: {
        Args: { p_business_id: string; p_allowed_roles: string[] };
        Returns: boolean;
      };
      is_business_member: {
        Args: { p_business_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
