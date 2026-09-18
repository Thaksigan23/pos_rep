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
    PostgrestVersion: "13"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_performed_by_fkey"
            columns: ["performed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_devices: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string
          device_model_id: string | null
          device_type: Database["public"]["Enums"]["device_type"]
          id: string
          imei: string | null
          model_label: string | null
          notes: string | null
          organization_id: string
          serial_number: string | null
          storage_capacity: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id: string
          device_model_id?: string | null
          device_type?: Database["public"]["Enums"]["device_type"]
          id?: string
          imei?: string | null
          model_label?: string | null
          notes?: string | null
          organization_id: string
          serial_number?: string | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string
          device_model_id?: string | null
          device_type?: Database["public"]["Enums"]["device_type"]
          id?: string
          imei?: string | null
          model_label?: string | null
          notes?: string | null
          organization_id?: string
          serial_number?: string | null
          storage_capacity?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_devices_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_devices_device_model_id_fkey"
            columns: ["device_model_id"]
            referencedRelation: "device_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_devices_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          alternate_phone: string | null
          created_at: string
          customer_number: string
          email: string | null
          first_name: string
          id: string
          is_walk_in: boolean
          last_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          shop_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          created_at?: string
          customer_number: string
          email?: string | null
          first_name?: string
          id?: string
          is_walk_in?: boolean
          last_name?: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          shop_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          created_at?: string
          customer_number?: string
          email?: string | null
          first_name?: string
          id?: string
          is_walk_in?: boolean
          last_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          shop_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "customers_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      device_brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_brands_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_intake_checks: {
        Row: {
          check_definition_id: string
          id: string
          notes: string | null
          organization_id: string
          repair_job_id: string
          result: Database["public"]["Enums"]["intake_check_result"]
        }
        Insert: {
          check_definition_id: string
          id?: string
          notes?: string | null
          organization_id: string
          repair_job_id: string
          result?: Database["public"]["Enums"]["intake_check_result"]
        }
        Update: {
          check_definition_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          repair_job_id?: string
          result?: Database["public"]["Enums"]["intake_check_result"]
        }
        Relationships: [
          {
            foreignKeyName: "device_intake_checks_check_definition_id_fkey"
            columns: ["check_definition_id"]
            referencedRelation: "intake_check_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_intake_checks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_intake_checks_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      device_models: {
        Row: {
          created_at: string
          device_brand_id: string
          device_type: Database["public"]["Enums"]["device_type"]
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_brand_id: string
          device_type?: Database["public"]["Enums"]["device_type"]
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_brand_id?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_models_device_brand_id_fkey"
            columns: ["device_brand_id"]
            referencedRelation: "device_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_models_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          doc_type: Database["public"]["Enums"]["document_type"]
          last_value: number
          organization_id: string
          year: number
        }
        Insert: {
          doc_type: Database["public"]["Enums"]["document_type"]
          last_value?: number
          organization_id: string
          year: number
        }
        Update: {
          doc_type?: Database["public"]["Enums"]["document_type"]
          last_value?: number
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          shop_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          organization_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shop_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shop_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "expenses_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_check_definitions: {
        Row: {
          code: string
          id: string
          is_active: boolean
          label: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          label: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          label?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "intake_check_definitions_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movement_costs: {
        Row: {
          movement_id: string
          organization_id: string
          unit_cost: number
        }
        Insert: {
          movement_id: string
          organization_id: string
          unit_cost?: number
        }
        Update: {
          movement_id?: string
          organization_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_costs_movement_id_fkey"
            columns: ["movement_id"]
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_costs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          notes: string | null
          organization_id: string
          product_id: string
          quantity_change: number
          reference_id: string | null
          reference_type: string | null
          shop_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          notes?: string | null
          organization_id: string
          product_id: string
          quantity_change: number
          reference_id?: string | null
          reference_type?: string | null
          shop_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity_change?: number
          reference_id?: string | null
          reference_type?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "inventory_movements_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "inventory_movements_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["outbox_channel"]
          created_at: string
          destination: string | null
          id: string
          last_error: string | null
          notification_id: string | null
          organization_id: string
          payload: NonNullable<Json>
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["outbox_channel"]
          created_at?: string
          destination?: string | null
          id?: string
          last_error?: string | null
          notification_id?: string | null
          organization_id: string
          payload?: NonNullable<Json>
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["outbox_channel"]
          created_at?: string
          destination?: string | null
          id?: string
          last_error?: string | null
          notification_id?: string | null
          organization_id?: string
          payload?: NonNullable<Json>
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_notification_id_fkey"
            columns: ["notification_id"]
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          metadata: NonNullable<Json>
          organization_id: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          metadata?: NonNullable<Json>
          organization_id: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          metadata?: NonNullable<Json>
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          change_amount: number
          created_at: string
          entry_type: Database["public"]["Enums"]["payment_entry_type"]
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          organization_id: string
          received_by: string | null
          reference_id: string
          reference_type: Database["public"]["Enums"]["payment_reference_type"]
          shop_id: string
          tendered_amount: number | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          change_amount?: number
          created_at?: string
          entry_type?: Database["public"]["Enums"]["payment_entry_type"]
          id?: string
          idempotency_key?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id: string
          received_by?: string | null
          reference_id: string
          reference_type: Database["public"]["Enums"]["payment_reference_type"]
          shop_id: string
          tendered_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          change_amount?: number
          created_at?: string
          entry_type?: Database["public"]["Enums"]["payment_entry_type"]
          id?: string
          idempotency_key?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string
          received_by?: string | null
          reference_id?: string
          reference_type?: Database["public"]["Enums"]["payment_reference_type"]
          shop_id?: string
          tendered_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost_price: number
          organization_id: string
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_price?: number
          organization_id: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_price?: number
          organization_id?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_costs_updated_by_fkey"
            columns: ["updated_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_device_compatibility: {
        Row: {
          created_at: string
          device_model_id: string
          organization_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          device_model_id: string
          organization_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          device_model_id?: string
          organization_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_device_compatibility_device_model_id_fkey"
            columns: ["device_model_id"]
            referencedRelation: "device_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_device_compatibility_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_device_compatibility_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_device_compatibility_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          product_id: string
          shop_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          product_id: string
          shop_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          product_id?: string
          shop_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "product_images_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stocks: {
        Row: {
          id: string
          organization_id: string
          product_id: string
          quantity: number
          shop_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          product_id: string
          quantity?: number
          shop_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stocks_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stocks_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stocks_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_stocks_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "product_stocks_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_taxable: boolean
          location_bin: string | null
          min_stock: number
          name: string
          organization_id: string
          product_type: Database["public"]["Enums"]["product_type"]
          reorder_level: number
          selling_price: number
          sku: string
          supplier_id: string | null
          tax_rate_override: number | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          location_bin?: string | null
          min_stock?: number
          name: string
          organization_id: string
          product_type?: Database["public"]["Enums"]["product_type"]
          reorder_level?: number
          selling_price?: number
          sku: string
          supplier_id?: string | null
          tax_rate_override?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          location_bin?: string | null
          min_stock?: number
          name?: string
          organization_id?: string
          product_type?: Database["public"]["Enums"]["product_type"]
          reorder_level?: number
          selling_price?: number
          sku?: string
          supplier_id?: string | null
          tax_rate_override?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          default_shop_id: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          default_shop_id?: string | null
          first_name?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          default_shop_id?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_shop_id_fkey"
            columns: ["default_shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "profiles_default_shop_id_fkey"
            columns: ["default_shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          organization_id: string
          product_id: string
          purchase_id: string
          quantity_ordered: number
          quantity_received: number
          tax_amount: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          organization_id: string
          product_id: string
          purchase_id: string
          quantity_ordered: number
          quantity_received?: number
          tax_amount?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          organization_id?: string
          product_id?: string
          purchase_id?: string
          quantity_ordered?: number
          quantity_received?: number
          tax_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          discount_amount: number
          id: string
          notes: string | null
          order_date: string
          organization_id: string
          purchase_number: string
          received_at: string | null
          shop_id: string
          status: Database["public"]["Enums"]["purchase_status"]
          subtotal: number
          supplier_id: string
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          order_date?: string
          organization_id: string
          purchase_number: string
          received_at?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          order_date?: string
          organization_id?: string
          purchase_number?: string
          received_at?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "purchases_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          organization_id: string
          product_id: string
          quantity: number
          refund_id: string
          restock_disposition: string
          sale_item_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          quantity: number
          refund_id: string
          restock_disposition?: string
          sale_item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          refund_id?: string
          restock_disposition?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          organization_id: string
          reason: string
          sale_id: string
          shop_id: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id: string
          reason: string
          sale_id: string
          shop_id: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id?: string
          reason?: string
          sale_id?: string
          shop_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_sale_id_fkey"
            columns: ["sale_id"]
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "refunds_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_accessories: {
        Row: {
          accessory_type: Database["public"]["Enums"]["accessory_type"]
          id: string
          notes: string | null
          organization_id: string
          present: boolean
          repair_job_id: string
        }
        Insert: {
          accessory_type: Database["public"]["Enums"]["accessory_type"]
          id?: string
          notes?: string | null
          organization_id: string
          present?: boolean
          repair_job_id: string
        }
        Update: {
          accessory_type?: Database["public"]["Enums"]["accessory_type"]
          id?: string
          notes?: string | null
          organization_id?: string
          present?: boolean
          repair_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_accessories_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_accessories_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_estimate_items: {
        Row: {
          created_at: string
          description_snapshot: string
          discount_amount: number
          estimate_id: string
          id: string
          line_total: number
          line_type: Database["public"]["Enums"]["estimate_line_type"]
          organization_id: string
          product_id: string | null
          quantity: number
          repair_service_id: string | null
          sort_order: number
          tax_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description_snapshot: string
          discount_amount?: number
          estimate_id: string
          id?: string
          line_total?: number
          line_type: Database["public"]["Enums"]["estimate_line_type"]
          organization_id: string
          product_id?: string | null
          quantity: number
          repair_service_id?: string | null
          sort_order?: number
          tax_amount?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description_snapshot?: string
          discount_amount?: number
          estimate_id?: string
          id?: string
          line_total?: number
          line_type?: Database["public"]["Enums"]["estimate_line_type"]
          organization_id?: string
          product_id?: string | null
          quantity?: number
          repair_service_id?: string | null
          sort_order?: number
          tax_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            referencedRelation: "repair_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimate_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimate_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimate_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "repair_estimate_items_repair_service_id_fkey"
            columns: ["repair_service_id"]
            referencedRelation: "repair_services"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_estimates: {
        Row: {
          approval_method: Database["public"]["Enums"]["approval_method"] | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          customer_approved_at: string | null
          discount_amount: number
          estimate_number: string
          id: string
          notes: string | null
          organization_id: string
          rejected_at: string | null
          rejection_reason: string | null
          repair_job_id: string
          sent_at: string | null
          sent_by: string | null
          shop_id: string
          status: Database["public"]["Enums"]["estimate_status"]
          subtotal: number
          superseded_at: string | null
          superseded_by_estimate_id: string | null
          tax_amount: number
          total: number
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          approval_method?:
            | Database["public"]["Enums"]["approval_method"]
            | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_approved_at?: string | null
          discount_amount?: number
          estimate_number: string
          id?: string
          notes?: string | null
          organization_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          repair_job_id: string
          sent_at?: string | null
          sent_by?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["estimate_status"]
          subtotal?: number
          superseded_at?: string | null
          superseded_by_estimate_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          version: number
        }
        Update: {
          approval_method?:
            | Database["public"]["Enums"]["approval_method"]
            | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_approved_at?: string | null
          discount_amount?: number
          estimate_number?: string
          id?: string
          notes?: string | null
          organization_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          repair_job_id?: string
          sent_at?: string | null
          sent_by?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["estimate_status"]
          subtotal?: number
          superseded_at?: string | null
          superseded_by_estimate_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_estimates_approved_by_fkey"
            columns: ["approved_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_sent_by_fkey"
            columns: ["sent_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "repair_estimates_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_estimates_superseded_by_estimate_id_fkey"
            columns: ["superseded_by_estimate_id"]
            referencedRelation: "repair_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_job_services: {
        Row: {
          created_at: string
          id: string
          labor_charge: number
          name_snapshot: string
          organization_id: string
          quantity: number
          repair_job_id: string
          repair_service_id: string | null
          warranty_days: number
        }
        Insert: {
          created_at?: string
          id?: string
          labor_charge?: number
          name_snapshot: string
          organization_id: string
          quantity?: number
          repair_job_id: string
          repair_service_id?: string | null
          warranty_days?: number
        }
        Update: {
          created_at?: string
          id?: string
          labor_charge?: number
          name_snapshot?: string
          organization_id?: string
          quantity?: number
          repair_job_id?: string
          repair_service_id?: string | null
          warranty_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_job_services_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_job_services_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_job_services_repair_service_id_fkey"
            columns: ["repair_service_id"]
            referencedRelation: "repair_services"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_jobs: {
        Row: {
          assigned_technician_id: string | null
          cancellation_kind:
            | Database["public"]["Enums"]["cancellation_kind"]
            | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delivered_at: string | null
          device_condition: string | null
          device_id: string
          diagnosis: string | null
          discount_amount: number
          estimated_completion_date: string | null
          estimated_cost: number
          id: string
          internal_notes: string | null
          labor_total: number
          organization_id: string
          parts_total: number
          priority: Database["public"]["Enums"]["repair_priority"]
          received_at: string
          reported_issue: string
          shop_id: string
          status: Database["public"]["Enums"]["repair_status"]
          tax_amount: number
          technician_notes: string | null
          ticket_number: string
          total: number
          updated_at: string
          warranty_duration_days: number
          warranty_expires_at: string | null
        }
        Insert: {
          assigned_technician_id?: string | null
          cancellation_kind?:
            | Database["public"]["Enums"]["cancellation_kind"]
            | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivered_at?: string | null
          device_condition?: string | null
          device_id: string
          diagnosis?: string | null
          discount_amount?: number
          estimated_completion_date?: string | null
          estimated_cost?: number
          id?: string
          internal_notes?: string | null
          labor_total?: number
          organization_id: string
          parts_total?: number
          priority?: Database["public"]["Enums"]["repair_priority"]
          received_at?: string
          reported_issue: string
          shop_id: string
          status?: Database["public"]["Enums"]["repair_status"]
          tax_amount?: number
          technician_notes?: string | null
          ticket_number: string
          total?: number
          updated_at?: string
          warranty_duration_days?: number
          warranty_expires_at?: string | null
        }
        Update: {
          assigned_technician_id?: string | null
          cancellation_kind?:
            | Database["public"]["Enums"]["cancellation_kind"]
            | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivered_at?: string | null
          device_condition?: string | null
          device_id?: string
          diagnosis?: string | null
          discount_amount?: number
          estimated_completion_date?: string | null
          estimated_cost?: number
          id?: string
          internal_notes?: string | null
          labor_total?: number
          organization_id?: string
          parts_total?: number
          priority?: Database["public"]["Enums"]["repair_priority"]
          received_at?: string
          reported_issue?: string
          shop_id?: string
          status?: Database["public"]["Enums"]["repair_status"]
          tax_amount?: number
          technician_notes?: string | null
          ticket_number?: string
          total?: number
          updated_at?: string
          warranty_duration_days?: number
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_jobs_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_device_id_fkey"
            columns: ["device_id"]
            referencedRelation: "customer_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "repair_jobs_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_part_costs: {
        Row: {
          organization_id: string
          repair_part_id: string
          unit_cost: number
        }
        Insert: {
          organization_id: string
          repair_part_id: string
          unit_cost?: number
        }
        Update: {
          organization_id?: string
          repair_part_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_part_costs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_part_costs_repair_part_id_fkey"
            columns: ["repair_part_id"]
            referencedRelation: "repair_parts"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_parts: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          product_id: string
          quantity_consumed: number
          quantity_reserved: number
          repair_job_id: string
          shop_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          product_id: string
          quantity_consumed?: number
          quantity_reserved?: number
          repair_job_id: string
          shop_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          product_id?: string
          quantity_consumed?: number
          quantity_reserved?: number
          repair_job_id?: string
          shop_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "repair_parts_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_parts_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_parts_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "repair_parts_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_parts_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "repair_parts_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          organization_id: string
          repair_job_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          organization_id: string
          repair_job_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          repair_job_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_photos_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_photos_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_services: {
        Row: {
          created_at: string
          default_labor_charge: number
          default_warranty_days: number
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_labor_charge?: number
          default_warranty_days?: number
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_labor_charge?: number
          default_warranty_days?: number
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_services_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["repair_status"]
          note: string | null
          organization_id: string
          previous_status: Database["public"]["Enums"]["repair_status"] | null
          repair_job_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["repair_status"]
          note?: string | null
          organization_id: string
          previous_status?: Database["public"]["Enums"]["repair_status"] | null
          repair_job_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["repair_status"]
          note?: string | null
          organization_id?: string
          previous_status?: Database["public"]["Enums"]["repair_status"] | null
          repair_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_status_history_changed_by_fkey"
            columns: ["changed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_status_history_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_status_history_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_item_costs: {
        Row: {
          organization_id: string
          sale_item_id: string
          unit_cost: number
        }
        Insert: {
          organization_id: string
          sale_item_id: string
          unit_cost?: number
        }
        Update: {
          organization_id?: string
          sale_item_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_costs_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_costs_sale_item_id_fkey"
            columns: ["sale_item_id"]
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          description_snapshot: string
          discount_amount: number
          id: string
          line_total: number
          organization_id: string
          product_id: string
          quantity: number
          sale_id: string
          tax_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description_snapshot: string
          discount_amount?: number
          id?: string
          line_total?: number
          organization_id: string
          product_id: string
          quantity: number
          sale_id: string
          tax_amount?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description_snapshot?: string
          discount_amount?: number
          id?: string
          line_total?: number
          organization_id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          tax_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cancelled_at: string | null
          change_amount: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number
          held_at: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          organization_id: string
          sale_number: string | null
          shop_id: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          change_amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          held_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id: string
          sale_number?: string | null
          shop_id: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          change_amount?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          held_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id?: string
          sale_number?: string | null
          shop_id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "sales_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          shop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          shop_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          shop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_members_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          allow_negative_stock: boolean
          allow_partial_payments: boolean
          business_registration: string | null
          cashier_max_line_discount_percent: number
          created_at: string
          currency_code: string
          currency_locale: string
          customer_prefix: string
          default_warranty_days: number
          estimate_prefix: string
          invoice_prefix: string
          logo_path: string | null
          low_stock_threshold: number
          organization_id: string
          purchase_prefix: string
          receipt_footer: string | null
          repair_prefix: string
          shop_id: string
          tax_enabled: boolean
          tax_id: string | null
          tax_inclusive: boolean
          tax_label: string
          tax_rate: number
          timezone: string
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          allow_partial_payments?: boolean
          business_registration?: string | null
          cashier_max_line_discount_percent?: number
          created_at?: string
          currency_code?: string
          currency_locale?: string
          customer_prefix?: string
          default_warranty_days?: number
          estimate_prefix?: string
          invoice_prefix?: string
          logo_path?: string | null
          low_stock_threshold?: number
          organization_id: string
          purchase_prefix?: string
          receipt_footer?: string | null
          repair_prefix?: string
          shop_id: string
          tax_enabled?: boolean
          tax_id?: string | null
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          allow_partial_payments?: boolean
          business_registration?: string | null
          cashier_max_line_discount_percent?: number
          created_at?: string
          currency_code?: string
          currency_locale?: string
          customer_prefix?: string
          default_warranty_days?: number
          estimate_prefix?: string
          invoice_prefix?: string
          logo_path?: string | null
          low_stock_threshold?: number
          organization_id?: string
          purchase_prefix?: string
          receipt_footer?: string | null
          repair_prefix?: string
          shop_id?: string
          tax_enabled?: boolean
          tax_id?: string | null
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_settings_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shop_product_inventory"
            referencedColumns: ["shop_id"]
          },
          {
            foreignKeyName: "shop_settings_shop_id_fkey"
            columns: ["shop_id"]
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shops_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warranties: {
        Row: {
          created_at: string
          end_date: string
          id: string
          organization_id: string
          repair_job_id: string
          repair_job_service_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["warranty_status"]
          terms: string | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          organization_id: string
          repair_job_id: string
          repair_job_service_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["warranty_status"]
          terms?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          organization_id?: string
          repair_job_id?: string
          repair_job_service_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["warranty_status"]
          terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranties_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_repair_job_id_fkey"
            columns: ["repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_repair_job_service_id_fkey"
            columns: ["repair_job_service_id"]
            referencedRelation: "repair_job_services"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          claim_date: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          organization_id: string
          related_repair_job_id: string | null
          resolution: string | null
          status: string
          warranty_id: string
        }
        Insert: {
          claim_date?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          organization_id: string
          related_repair_job_id?: string | null
          resolution?: string | null
          status?: string
          warranty_id: string
        }
        Update: {
          claim_date?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          organization_id?: string
          related_repair_job_id?: string | null
          resolution?: string | null
          status?: string
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_related_repair_job_id_fkey"
            columns: ["related_repair_job_id"]
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_claims_warranty_id_fkey"
            columns: ["warranty_id"]
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      shop_product_inventory: {
        Row: {
          barcode: string | null
          brand_id: string | null
          category_id: string | null
          is_active: boolean | null
          location_bin: string | null
          min_stock: number | null
          name: string | null
          organization_id: string | null
          primary_image_path: string | null
          product_id: string | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          quantity: number | null
          reorder_level: number | null
          selling_price: number | null
          shop_id: string | null
          sku: string | null
          stock_status: string | null
          track_inventory: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_inventory: {
        Args: {
          p_movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          p_notes?: string
          p_product_id: string
          p_quantity_change: number
          p_shop_id: string
        }
        Returns: string
      }
      approve_repair_estimate: {
        Args: {
          p_estimate_id: string
          p_method?: Database["public"]["Enums"]["approval_method"]
        }
        Returns: undefined
      }
      assert_line_discount_allowed: {
        Args: {
          p_discount: number
          p_qty: number
          p_shop_id: string
          p_unit_price: number
        }
        Returns: undefined
      }
      assign_staff_profile: {
        Args: {
          p_first_name?: string
          p_last_name?: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_shop_id: string
          p_user_id: string
        }
        Returns: string
      }
      authorize_product_image_deletion: {
        Args: { p_image_id: string }
        Returns: {
          image_id: string
          organization_id: string
          product_id: string
          shop_id: string
          storage_path: string
        }[]
      }
      authorize_repair_photo_deletion: {
        Args: { p_photo_id: string }
        Returns: {
          organization_id: string
          photo_id: string
          repair_job_id: string
          shop_id: string
          storage_path: string
        }[]
      }
      bootstrap_organization: { Args: { p_name: string }; Returns: string }
      cancel_repair: {
        Args: { p_reason: string; p_repair_job_id: string }
        Returns: undefined
      }
      cancel_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: undefined
      }
      change_repair_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["repair_status"]
          p_note?: string
          p_repair_job_id: string
        }
        Returns: undefined
      }
      complete_held_sale: {
        Args: { p_payload: Json; p_sale_id: string }
        Returns: string
      }
      complete_sale: { Args: { p_payload: Json }; Returns: string }
      consume_repair_parts: { Args: { p_payload: Json }; Returns: undefined }
      create_customer: { Args: { p_payload: Json }; Returns: string }
      create_purchase: { Args: { p_payload: Json }; Returns: string }
      create_repair_estimate: { Args: { p_payload: Json }; Returns: string }
      create_repair_job: { Args: { p_payload: Json }; Returns: string }
      create_warranty_claim: { Args: { p_payload: Json }; Returns: string }
      current_organization_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_profile: {
        Args: Record<PropertyKey, never>
        Returns: {
          avatar_path: string | null
          created_at: string
          default_shop_id: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      customer_visible: { Args: { p_customer_id: string }; Returns: boolean }
      dashboard_summary: { Args: { p_shop_id?: string }; Returns: Json }
      delete_product_image: { Args: { p_image_id: string }; Returns: string }
      delete_repair_photo: { Args: { p_photo_id: string }; Returns: string }
      document_payable_total: {
        Args: {
          p_organization_id: string
          p_reference_id: string
          p_reference_type: Database["public"]["Enums"]["payment_reference_type"]
        }
        Returns: number
      }
      enqueue_notification: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_event: Database["public"]["Enums"]["notification_event_type"]
          p_organization_id: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      ensure_stock_row: {
        Args: {
          p_organization_id: string
          p_product_id: string
          p_shop_id: string
        }
        Returns: undefined
      }
      has_shop_access: { Args: { p_shop_id: string }; Returns: boolean }
      hold_sale: { Args: { p_payload: Json }; Returns: string }
      insert_estimate_items: {
        Args: {
          p_estimate_id: string
          p_items: Json
          p_organization_id: string
          p_shop_id: string
        }
        Returns: undefined
      }
      is_org_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      line_tax: {
        Args: {
          p_discount: number
          p_is_taxable: boolean
          p_qty: number
          p_shop_id: string
          p_tax_override: number
          p_unit_price: number
        }
        Returns: {
          line_total: number
          net_amount: number
          tax_amount: number
        }[]
      }
      money_round: { Args: { amount: number }; Returns: number }
      next_document_number: {
        Args: {
          p_doc_type: Database["public"]["Enums"]["document_type"]
          p_shop_id?: string
        }
        Returns: string
      }
      paid_total: {
        Args: {
          p_reference_id: string
          p_reference_type: Database["public"]["Enums"]["payment_reference_type"]
        }
        Returns: number
      }
      phase3_schema_snapshot: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      recalc_estimate_totals: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      receive_purchase: { Args: { p_payload: Json }; Returns: string }
      record_payment: { Args: { p_payload: Json }; Returns: string }
      refund_sale: { Args: { p_payload: Json }; Returns: string }
      reject_repair_estimate: {
        Args: { p_estimate_id: string; p_reason: string }
        Returns: undefined
      }
      repair_transition_allowed: {
        Args: {
          p_from: Database["public"]["Enums"]["repair_status"]
          p_to: Database["public"]["Enums"]["repair_status"]
        }
        Returns: boolean
      }
      report_summary: {
        Args: { p_from: string; p_shop_id: string; p_to: string }
        Returns: Json
      }
      require_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: {
          avatar_path: string | null
          created_at: string
          default_shop_id: string | null
          first_name: string | null
          id: string
          is_active: boolean
          last_name: string | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_warranty_claim: {
        Args: { p_claim_id: string; p_payload: Json }
        Returns: undefined
      }
      revise_repair_estimate: {
        Args: { p_estimate_id: string }
        Returns: string
      }
      seed_org_defaults: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      send_repair_estimate: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      set_primary_product_image: {
        Args: { p_image_id: string }
        Returns: undefined
      }
      set_shop_logo_path: {
        Args: { p_logo_path: string | null; p_shop_id: string }
        Returns: undefined
      }
      set_staff_shop_memberships: {
        Args: { p_shop_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      shop_local_day_bounds: {
        Args: { p_date?: string; p_shop_id: string }
        Returns: {
          end_at: string
          local_date: string
          start_at: string
          timezone: string
        }[]
      }
      storage_org_id: { Args: { p_name: string }; Returns: string }
      storage_shop_id: { Args: { p_name: string }; Returns: string }
      update_draft_estimate: { Args: { p_payload: Json }; Returns: string }
      update_repair_job_details: {
        Args: { p_payload: Json; p_repair_job_id: string }
        Returns: string
      }
      update_shop_settings: {
        Args: { p_payload: Json; p_shop_id: string }
        Returns: undefined
      }
      update_staff_profile: {
        Args: { p_payload: Json; p_user_id: string }
        Returns: undefined
      }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      accessory_type:
        | "sim"
        | "sim_tray"
        | "charger"
        | "cable"
        | "case"
        | "memory_card"
        | "box"
        | "other"
      app_role: "owner" | "admin" | "cashier" | "technician"
      approval_method: "in_person" | "phone" | "email" | "portal" | "other"
      cancellation_kind: "normal" | "exceptional"
      device_type: "phone" | "tablet" | "laptop" | "watch" | "other"
      document_type: "repair" | "invoice" | "purchase" | "customer" | "estimate"
      estimate_line_type: "labor" | "part"
      estimate_status:
        | "draft"
        | "sent"
        | "approved"
        | "rejected"
        | "expired"
        | "superseded"
      intake_check_result:
        | "working"
        | "not_working"
        | "not_tested"
        | "not_applicable"
      inventory_movement_type:
        | "purchase"
        | "sale"
        | "sale_return"
        | "customer_return"
        | "repair_usage"
        | "repair_return"
        | "return_to_supplier"
        | "adjustment"
        | "damaged"
        | "stock_count"
        | "stock_count_correction"
      notification_event_type:
        | "repair_ready_for_pickup"
        | "repair_completed"
        | "waiting_for_customer_approval"
        | "low_stock"
        | "warranty_expiring"
      outbox_channel: "in_app" | "sms" | "email" | "whatsapp"
      outbox_status: "pending" | "sent" | "failed"
      payment_entry_type: "receipt" | "refund"
      payment_method: "cash" | "card" | "bank_transfer" | "other"
      payment_reference_type: "sale" | "repair" | "purchase"
      product_type: "phone" | "accessory" | "spare_part" | "other" | "service"
      purchase_status:
        | "draft"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
      repair_priority: "low" | "normal" | "high" | "urgent"
      repair_status:
        | "received"
        | "diagnosing"
        | "waiting_for_customer_approval"
        | "approved"
        | "waiting_for_parts"
        | "in_repair"
        | "testing"
        | "ready_for_pickup"
        | "completed"
        | "delivered"
        | "cancelled"
      sale_status:
        | "held"
        | "completed"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
      warranty_status: "active" | "expired" | "voided" | "claimed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      accessory_type: [
        "sim",
        "sim_tray",
        "charger",
        "cable",
        "case",
        "memory_card",
        "box",
        "other",
      ],
      app_role: ["owner", "admin", "cashier", "technician"],
      approval_method: ["in_person", "phone", "email", "portal", "other"],
      cancellation_kind: ["normal", "exceptional"],
      device_type: ["phone", "tablet", "laptop", "watch", "other"],
      document_type: ["repair", "invoice", "purchase", "customer", "estimate"],
      estimate_line_type: ["labor", "part"],
      estimate_status: [
        "draft",
        "sent",
        "approved",
        "rejected",
        "expired",
        "superseded",
      ],
      intake_check_result: [
        "working",
        "not_working",
        "not_tested",
        "not_applicable",
      ],
      inventory_movement_type: [
        "purchase",
        "sale",
        "sale_return",
        "customer_return",
        "repair_usage",
        "repair_return",
        "return_to_supplier",
        "adjustment",
        "damaged",
        "stock_count",
        "stock_count_correction",
      ],
      notification_event_type: [
        "repair_ready_for_pickup",
        "repair_completed",
        "waiting_for_customer_approval",
        "low_stock",
        "warranty_expiring",
      ],
      outbox_channel: ["in_app", "sms", "email", "whatsapp"],
      outbox_status: ["pending", "sent", "failed"],
      payment_entry_type: ["receipt", "refund"],
      payment_method: ["cash", "card", "bank_transfer", "other"],
      payment_reference_type: ["sale", "repair", "purchase"],
      product_type: ["phone", "accessory", "spare_part", "other", "service"],
      purchase_status: [
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
      ],
      repair_priority: ["low", "normal", "high", "urgent"],
      repair_status: [
        "received",
        "diagnosing",
        "waiting_for_customer_approval",
        "approved",
        "waiting_for_parts",
        "in_repair",
        "testing",
        "ready_for_pickup",
        "completed",
        "delivered",
        "cancelled",
      ],
      sale_status: [
        "held",
        "completed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
      warranty_status: ["active", "expired", "voided", "claimed"],
    },
  },
} as const
