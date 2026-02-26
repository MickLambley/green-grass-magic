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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          admin_notes: string | null
          city: string
          country: string
          created_at: string
          fixed_price: number | null
          id: string
          lawn_image_url: string | null
          postal_code: string
          price_per_sqm: number | null
          slope: Database["public"]["Enums"]["slope_type"]
          square_meters: number | null
          state: string
          status: Database["public"]["Enums"]["address_status"]
          street_address: string
          tier_count: number
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          city: string
          country?: string
          created_at?: string
          fixed_price?: number | null
          id?: string
          lawn_image_url?: string | null
          postal_code: string
          price_per_sqm?: number | null
          slope?: Database["public"]["Enums"]["slope_type"]
          square_meters?: number | null
          state: string
          status?: Database["public"]["Enums"]["address_status"]
          street_address: string
          tier_count?: number
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          city?: string
          country?: string
          created_at?: string
          fixed_price?: number | null
          id?: string
          lawn_image_url?: string | null
          postal_code?: string
          price_per_sqm?: number | null
          slope?: Database["public"]["Enums"]["slope_type"]
          square_meters?: number | null
          state?: string
          status?: Database["public"]["Enums"]["address_status"]
          street_address?: string
          tier_count?: number
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      alternative_suggestions: {
        Row: {
          booking_id: string | null
          contractor_id: string
          created_at: string
          id: string
          job_id: string | null
          responded_at: string | null
          status: string
          suggested_date: string
          suggested_time_slot: string
        }
        Insert: {
          booking_id?: string | null
          contractor_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          responded_at?: string | null
          status?: string
          suggested_date: string
          suggested_time_slot: string
        }
        Update: {
          booking_id?: string | null
          contractor_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          responded_at?: string | null
          status?: string
          suggested_date?: string
          suggested_time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "alternative_suggestions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alternative_suggestions_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alternative_suggestions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address_id: string
          admin_notes: string | null
          alternative_date: string | null
          alternative_suggested_at: string | null
          alternative_suggested_by: string | null
          alternative_time_slot: string | null
          charged_at: string | null
          clippings_removal: boolean
          completed_at: string | null
          contractor_accepted_at: string | null
          contractor_id: string | null
          contractor_rating_response: string | null
          created_at: string
          customer_rating: number | null
          grass_length: string
          id: string
          is_public_holiday: boolean
          is_weekend: boolean
          notes: string | null
          payment_intent_id: string | null
          payment_method_id: string | null
          payment_status: string
          payout_released_at: string | null
          payout_status: string
          rating_comment: string | null
          rating_submitted_at: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: Database["public"]["Enums"]["booking_status"]
          stripe_payout_id: string | null
          time_slot: string
          total_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_id: string
          admin_notes?: string | null
          alternative_date?: string | null
          alternative_suggested_at?: string | null
          alternative_suggested_by?: string | null
          alternative_time_slot?: string | null
          charged_at?: string | null
          clippings_removal?: boolean
          completed_at?: string | null
          contractor_accepted_at?: string | null
          contractor_id?: string | null
          contractor_rating_response?: string | null
          created_at?: string
          customer_rating?: number | null
          grass_length?: string
          id?: string
          is_public_holiday?: boolean
          is_weekend?: boolean
          notes?: string | null
          payment_intent_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          payout_released_at?: string | null
          payout_status?: string
          rating_comment?: string | null
          rating_submitted_at?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payout_id?: string | null
          time_slot?: string
          total_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_id?: string
          admin_notes?: string | null
          alternative_date?: string | null
          alternative_suggested_at?: string | null
          alternative_suggested_by?: string | null
          alternative_time_slot?: string | null
          charged_at?: string | null
          clippings_removal?: boolean
          completed_at?: string | null
          contractor_accepted_at?: string | null
          contractor_id?: string | null
          contractor_rating_response?: string | null
          created_at?: string
          customer_rating?: number | null
          grass_length?: string
          id?: string
          is_public_holiday?: boolean
          is_weekend?: boolean
          notes?: string | null
          payment_intent_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          payout_released_at?: string | null
          payout_status?: string
          rating_comment?: string | null
          rating_submitted_at?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payout_id?: string | null
          time_slot?: string
          total_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: Json | null
          contractor_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          property_notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: Json | null
          contractor_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          property_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: Json | null
          contractor_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          property_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          abn: string | null
          accent_color: string | null
          average_rating: number | null
          average_response_time_hours: number | null
          bank_account_number: string | null
          bank_bsb: string | null
          business_address: string | null
          business_logo_url: string | null
          business_name: string | null
          cancelled_jobs_count: number
          completed_jobs_count: number
          created_at: string
          disputed_jobs_count: number
          gst_registered: boolean
          id: string
          insurance_certificate_url: string | null
          insurance_expiry_date: string | null
          insurance_uploaded_at: string | null
          insurance_verified: boolean
          is_active: boolean
          last_active_at: string | null
          phone: string | null
          primary_color: string | null
          questionnaire_responses: Json | null
          secondary_color: string | null
          service_areas: string[]
          service_center_lat: number | null
          service_center_lng: number | null
          service_radius_km: number | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean
          stripe_payouts_enabled: boolean
          subdomain: string | null
          subscription_tier: string
          suspended_at: string | null
          suspension_reason: string | null
          suspension_status: string
          total_ratings_count: number | null
          total_revenue: number
          updated_at: string
          user_id: string
          website_copy: Json | null
          website_published: boolean
          working_hours: Json
        }
        Insert: {
          abn?: string | null
          accent_color?: string | null
          average_rating?: number | null
          average_response_time_hours?: number | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          business_address?: string | null
          business_logo_url?: string | null
          business_name?: string | null
          cancelled_jobs_count?: number
          completed_jobs_count?: number
          created_at?: string
          disputed_jobs_count?: number
          gst_registered?: boolean
          id?: string
          insurance_certificate_url?: string | null
          insurance_expiry_date?: string | null
          insurance_uploaded_at?: string | null
          insurance_verified?: boolean
          is_active?: boolean
          last_active_at?: string | null
          phone?: string | null
          primary_color?: string | null
          questionnaire_responses?: Json | null
          secondary_color?: string | null
          service_areas?: string[]
          service_center_lat?: number | null
          service_center_lng?: number | null
          service_radius_km?: number | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          subdomain?: string | null
          subscription_tier?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          suspension_status?: string
          total_ratings_count?: number | null
          total_revenue?: number
          updated_at?: string
          user_id: string
          website_copy?: Json | null
          website_published?: boolean
          working_hours?: Json
        }
        Update: {
          abn?: string | null
          accent_color?: string | null
          average_rating?: number | null
          average_response_time_hours?: number | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          business_address?: string | null
          business_logo_url?: string | null
          business_name?: string | null
          cancelled_jobs_count?: number
          completed_jobs_count?: number
          created_at?: string
          disputed_jobs_count?: number
          gst_registered?: boolean
          id?: string
          insurance_certificate_url?: string | null
          insurance_expiry_date?: string | null
          insurance_uploaded_at?: string | null
          insurance_verified?: boolean
          is_active?: boolean
          last_active_at?: string | null
          phone?: string | null
          primary_color?: string | null
          questionnaire_responses?: Json | null
          secondary_color?: string | null
          service_areas?: string[]
          service_center_lat?: number | null
          service_center_lng?: number | null
          service_radius_km?: number | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          stripe_payouts_enabled?: boolean
          subdomain?: string | null
          subscription_tier?: string
          suspended_at?: string | null
          suspension_reason?: string | null
          suspension_status?: string
          total_ratings_count?: number | null
          total_revenue?: number
          updated_at?: string
          user_id?: string
          website_copy?: Json | null
          website_published?: boolean
          working_hours?: Json
        }
        Relationships: []
      }
      disputes: {
        Row: {
          booking_id: string | null
          contractor_id: string | null
          contractor_response: string | null
          contractor_response_photos: string[] | null
          created_at: string
          customer_photos: string[] | null
          description: string
          dispute_reason: string | null
          id: string
          job_id: string | null
          raised_by: string
          refund_percentage: number | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_refund_amount: number | null
        }
        Insert: {
          booking_id?: string | null
          contractor_id?: string | null
          contractor_response?: string | null
          contractor_response_photos?: string[] | null
          created_at?: string
          customer_photos?: string[] | null
          description: string
          dispute_reason?: string | null
          id?: string
          job_id?: string | null
          raised_by: string
          refund_percentage?: number | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_refund_amount?: number | null
        }
        Update: {
          booking_id?: string | null
          contractor_id?: string | null
          contractor_response?: string | null
          contractor_response_photos?: string[] | null
          created_at?: string
          customer_photos?: string[] | null
          description?: string
          dispute_reason?: string | null
          id?: string
          job_id?: string | null
          raised_by?: string
          refund_percentage?: number | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_refund_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          contractor_id: string
          created_at: string
          due_date: string | null
          gst_amount: number
          id: string
          invoice_number: string | null
          job_id: string | null
          line_items: Json
          notes: string | null
          paid_at: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          client_id: string
          contractor_id: string
          created_at?: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number?: string | null
          job_id?: string | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          contractor_id?: string
          created_at?: string
          due_date?: string | null
          gst_amount?: number
          id?: string
          invoice_number?: string | null
          job_id?: string | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          booking_id: string | null
          contractor_id: string
          exif_timestamp: string | null
          id: string
          job_id: string | null
          photo_type: string
          photo_url: string
          uploaded_at: string
        }
        Insert: {
          booking_id?: string | null
          contractor_id: string
          exif_timestamp?: string | null
          id?: string
          job_id?: string | null
          photo_type: string
          photo_url: string
          uploaded_at?: string
        }
        Update: {
          booking_id?: string | null
          contractor_id?: string
          exif_timestamp?: string | null
          id?: string
          job_id?: string | null
          photo_type?: string
          photo_url?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address_id: string | null
          client_id: string
          completed_at: string | null
          contractor_id: string
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          customer_user_id: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          original_scheduled_date: string | null
          original_scheduled_time: string | null
          original_time_slot: string | null
          payment_intent_id: string | null
          payment_method_id: string | null
          payment_status: string
          quote_breakdown: Json | null
          recurrence_rule: Json | null
          route_optimization_locked: boolean
          scheduled_date: string
          scheduled_time: string | null
          source: string
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_link_id: string | null
          stripe_payment_link_url: string | null
          time_flexibility: string
          title: string
          total_price: number | null
          updated_at: string
        }
        Insert: {
          address_id?: string | null
          client_id: string
          completed_at?: string | null
          contractor_id: string
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          original_scheduled_date?: string | null
          original_scheduled_time?: string | null
          original_time_slot?: string | null
          payment_intent_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          quote_breakdown?: Json | null
          recurrence_rule?: Json | null
          route_optimization_locked?: boolean
          scheduled_date: string
          scheduled_time?: string | null
          source?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          time_flexibility?: string
          title?: string
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          address_id?: string | null
          client_id?: string
          completed_at?: string | null
          contractor_id?: string
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          original_scheduled_date?: string | null
          original_scheduled_time?: string | null
          original_time_slot?: string | null
          payment_intent_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          quote_breakdown?: Json | null
          recurrence_rule?: Json | null
          route_optimization_locked?: boolean
          scheduled_date?: string
          scheduled_time?: string | null
          source?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          time_flexibility?: string
          title?: string
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          client_id: string
          contractor_id: string
          created_at: string
          id: string
          line_items: Json
          notes: string | null
          status: string
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          contractor_id: string
          created_at?: string
          id?: string
          line_items?: Json
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          contractor_id?: string
          created_at?: string
          id?: string
          line_items?: Json
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      route_optimization_suggestions: {
        Row: {
          current_date_val: string
          current_time_slot: string
          customer_approval_status: string
          id: string
          job_id: string
          requires_customer_approval: boolean
          route_optimization_id: string
          suggested_date: string
          suggested_time_slot: string
        }
        Insert: {
          current_date_val: string
          current_time_slot: string
          customer_approval_status?: string
          id?: string
          job_id: string
          requires_customer_approval?: boolean
          route_optimization_id: string
          suggested_date: string
          suggested_time_slot: string
        }
        Update: {
          current_date_val?: string
          current_time_slot?: string
          customer_approval_status?: string
          id?: string
          job_id?: string
          requires_customer_approval?: boolean
          route_optimization_id?: string
          suggested_date?: string
          suggested_time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_optimization_suggestions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_optimization_suggestions_route_optimization_id_fkey"
            columns: ["route_optimization_id"]
            isOneToOne: false
            referencedRelation: "route_optimizations"
            referencedColumns: ["id"]
          },
        ]
      }
      route_optimizations: {
        Row: {
          contractor_id: string
          created_at: string
          id: string
          level: number
          optimization_date: string
          status: string
          time_saved_minutes: number
        }
        Insert: {
          contractor_id: string
          created_at?: string
          id?: string
          level: number
          optimization_date: string
          status?: string
          time_saved_minutes: number
        }
        Update: {
          contractor_id?: string
          created_at?: string
          id?: string
          level?: number
          optimization_date?: string
          status?: string
          time_saved_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_optimizations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_fees: {
        Row: {
          contractor_id: string
          contractor_payout: number
          created_at: string
          id: string
          job_id: string | null
          payment_amount: number
          stripe_fee: number
          yardly_fee: number
          yardly_fee_percentage: number
        }
        Insert: {
          contractor_id: string
          contractor_payout?: number
          created_at?: string
          id?: string
          job_id?: string | null
          payment_amount: number
          stripe_fee?: number
          yardly_fee?: number
          yardly_fee_percentage?: number
        }
        Update: {
          contractor_id?: string
          contractor_payout?: number
          created_at?: string
          id?: string
          job_id?: string | null
          payment_amount?: number
          stripe_fee?: number
          yardly_fee?: number
          yardly_fee_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_fees_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fees_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_status_audit: {
        Row: {
          changed_by: string
          changed_by_email: string | null
          created_at: string
          id: string
          new_status: string
          previous_status: string
          reason: string | null
          user_id: string
          user_type: string
        }
        Insert: {
          changed_by: string
          changed_by_email?: string | null
          created_at?: string
          id?: string
          new_status: string
          previous_status: string
          reason?: string | null
          user_id: string
          user_type: string
        }
        Update: {
          changed_by?: string
          changed_by_email?: string | null
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string
          reason?: string | null
          user_id?: string
          user_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      address_status: "pending" | "verified" | "rejected"
      app_role: "admin" | "user" | "contractor"
      booking_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "disputed"
        | "post_payment_dispute"
        | "completed_with_issues"
      slope_type: "flat" | "mild" | "steep"
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
      address_status: ["pending", "verified", "rejected"],
      app_role: ["admin", "user", "contractor"],
      booking_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "disputed",
        "post_payment_dispute",
        "completed_with_issues",
      ],
      slope_type: ["flat", "mild", "steep"],
    },
  },
} as const
