# Yardly — Comprehensive Technical & Product Documentation

**Version:** 1.0  
**Date:** 2026-02-27  
**Audience:** External engineers (AI & human) for code review and contribution

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Database Schema and Data Model](#2-database-schema-and-data-model)
3. [Backend Services (Edge Functions)](#3-backend-services-edge-functions)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Key Workflows & Features](#5-key-workflows--features)
6. [Analysis and Recommendations](#6-analysis-and-recommendations)

---

## 1. High-Level Overview

### 1.1 Executive Summary

**Yardly** is a B2B SaaS platform for Australian lawn care contractors. It provides a unified business management system that handles:

- **Client & Job Management** — a CRM for managing clients, scheduling jobs, and tracking completion
- **Automated Payment Processing** — Stripe Connect integration for automatic charging, payouts, and invoicing
- **AI-Generated Contractor Websites** — each contractor gets a unique `/site/{slug}` website with online booking
- **Route Optimization** — Google Maps Distance Matrix-powered scheduling to reduce travel time
- **Dispute Resolution** — structured workflows for handling customer complaints with photo evidence
- **Tiered Subscriptions** — Free, Starter, and Pro plans with feature gating

The platform monetizes through tiered subscription fees and per-transaction application fees (5% Free, 2.5% Starter, 1% Pro) on website-originated bookings.

### 1.2 User Personas

| Persona | Role | Description |
|---------|------|-------------|
| **Contractor** | Primary tenant | Lawn care business owner. Manages clients, schedules jobs, sends invoices, handles disputes. Accesses via `/contractor` dashboard. |
| **Admin** | Platform operator | Yardly staff. Manages contractor approvals, resolves disputes, monitors platform health. Accesses via `/admin`. |
| **Client/Homeowner** | End customer | Books services via a contractor's website (`/site/{slug}`), pays via Stripe, can raise disputes. Has a customer portal (`/site/{slug}/portal`). |
| **Legacy Homeowner** | End customer (legacy) | Uses the old Yardly-direct booking flow via `/dashboard` (pre-multi-tenant model). |

### 1.3 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Vite)                 │
│  ┌─────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────┐  │
│  │ Landing  │ │ Contractor   │ │ Customer   │ │  Admin    │  │
│  │ Pages    │ │ Dashboard    │ │ Portal     │ │ Dashboard │  │
│  └─────────┘ └──────────────┘ └────────────┘ └───────────┘  │
│         │              │              │             │         │
│         └──────────────┴──────────────┴─────────────┘         │
│                           │                                   │
│              @tanstack/react-query + Supabase SDK             │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────┴──────────────────────────────────┐
│                    SUPABASE (Backend)                          │
│  ┌─────────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ Auth (JWT/RLS)   │  │ PostgREST   │  │ Edge Functions   │  │
│  │ Email confirm    │  │ (REST API)  │  │ (~20 functions)  │  │
│  └─────────────────┘  └─────────────┘  └──────────────────┘  │
│  ┌─────────────────┐  ┌─────────────┐                        │
│  │ Storage Buckets  │  │ Realtime    │                        │
│  │ (photos, docs)   │  │ (not used)  │                        │
│  └─────────────────┘  └─────────────┘                        │
│                           │                                   │
│              PostgreSQL (16 tables + functions + triggers)     │
└────────────────────────────┬──────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │                       │                       │
┌────┴─────┐          ┌─────┴──────┐          ┌─────┴──────┐
│  Stripe  │          │  Google    │          │  Resend    │
│ Connect  │          │  Maps API  │          │  (Email)   │
│ Webhooks │          │  Distance  │          │            │
│ Payments │          │  Matrix    │          │            │
└──────────┘          └────────────┘          └────────────┘
```

### 1.4 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React 18 + TypeScript |
| **Build Tool** | Vite |
| **Styling** | TailwindCSS + tailwindcss-animate |
| **Component Library** | shadcn/ui (Radix UI primitives) |
| **State Management** | @tanstack/react-query (server state), useState/useEffect (local state) |
| **Routing** | react-router-dom v6 |
| **Charts** | Recharts |
| **Maps** | Leaflet + leaflet-draw (lawn drawing), Google Maps API (geocoding/distance) |
| **Payments (Client)** | @stripe/react-stripe-js, @stripe/stripe-js |
| **Backend** | Supabase (PostgreSQL, Auth, Edge Functions, Storage) |
| **Edge Functions Runtime** | Deno (Supabase Edge Functions) |
| **Payments (Server)** | Stripe SDK (stripe@18.5.0) |
| **Email** | Resend API |
| **Geocoding/Routing** | Google Maps Distance Matrix API |
| **Forms** | react-hook-form + zod |

---

## 2. Database Schema and Data Model

### 2.1 Entity-Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  auth.users  │────<│  user_roles   │     │   profiles   │
│              │     │  (user_id,    │     │  (user_id,   │
│              │     │   role)       │     │   full_name) │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       │ 1:1
       ▼
┌──────────────┐     ┌──────────────┐
│ contractors  │────<│   clients    │
│ (tenant key) │     │ (per-tenant  │
│              │     │  CRM record) │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │ 1:N                │ 1:N
       ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    jobs      │────>│   invoices   │     │   quotes     │
│ (unified     │     │              │     │              │
│  work table) │     └──────────────┘     └──────────────┘
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐
│  job_photos  │     │  disputes    │     │ route_optimizations     │
│              │     │ (booking_id  │     │ route_optimization_     │
│              │     │  OR job_id)  │     │   suggestions           │
└──────────────┘     └──────────────┘     └─────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  bookings    │     │  addresses   │     │ transaction_fees     │
│ (LEGACY)     │     │ (user-owned) │     │ (fee audit trail)    │
└──────────────┘     └──────────────┘     └──────────────────────┘

┌──────────────────┐  ┌──────────────────────┐
│  notifications   │  │ processed_stripe_    │
│                  │  │   events             │
└──────────────────┘  └──────────────────────┘
```

### 2.2 Table-by-Table Breakdown

#### 2.2.1 `contractors`

**Purpose:** The primary tenant table. Each row represents one lawn care business.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NOT NULL | Links to `auth.users` |
| `business_name` | text | nullable | Trading name |
| `abn` | text | nullable | Australian Business Number |
| `gst_registered` | boolean | default `false` | Whether GST applies to invoices |
| `phone` | text | nullable | Contact phone |
| `business_address` | text | nullable | Physical address |
| `business_logo_url` | text | nullable | Logo in storage |
| `subdomain` | text | nullable, unique | Website slug for `/site/{slug}` |
| `website_published` | boolean | default `false` | Whether public site is live |
| `website_copy` | jsonb | nullable | AI-generated website content |
| `primary_color` | text | default `'#16a34a'` | Brand color |
| `secondary_color` | text | default `'#15803d'` | Secondary brand color |
| `accent_color` | text | default `'#22c55e'` | Accent color |
| `working_hours` | jsonb | NOT NULL, has default | Per-day `{enabled, start, end}` |
| `service_areas` | text[] | default `'{}'` | Geographic coverage |
| `service_radius_km` | numeric | nullable | Radius from center point |
| `service_center_lat` | numeric | nullable | Service center latitude |
| `service_center_lng` | numeric | nullable | Service center longitude |
| `stripe_account_id` | text | nullable | Stripe Connect account |
| `stripe_onboarding_complete` | boolean | default `false` | Stripe setup status |
| `stripe_payouts_enabled` | boolean | default `false` | Can receive payouts |
| `subscription_tier` | text | default `'free'` | `free`, `starter`, `pro` |
| `insurance_certificate_url` | text | nullable | Uploaded certificate |
| `insurance_expiry_date` | date | nullable | Expiry for compliance |
| `insurance_verified` | boolean | default `false` | Admin verified |
| `is_active` | boolean | default `true` | Active/suspended |
| `suspension_status` | text | default `'active'` | `active`, `warning`, `suspended` |
| `suspension_reason` | text | nullable | Why suspended |
| `suspended_at` | timestamptz | nullable | When suspended |
| `questionnaire_responses` | jsonb | nullable | Pricing config, service preferences |
| `completed_jobs_count` | int | default `0` | Denormalized metric |
| `cancelled_jobs_count` | int | default `0` | Denormalized metric |
| `disputed_jobs_count` | int | default `0` | Denormalized metric |
| `total_revenue` | numeric | default `0` | Denormalized metric |
| `average_rating` | numeric | nullable, default `0` | Avg customer rating |
| `total_ratings_count` | int | nullable, default `0` | Count of ratings |
| `average_response_time_hours` | numeric | nullable | Responsiveness metric |
| `last_active_at` | timestamptz | nullable | Last activity |

**RLS Policies:**
- `SELECT`: Own profile, or active contractors (authenticated), or admin
- `INSERT`: Own profile only (`auth.uid() = user_id`)
- `UPDATE`: Own profile, or admin
- `ALL`: Admin

---

#### 2.2.2 `clients`

**Purpose:** Per-contractor CRM records. A single person may appear as a client under multiple contractors.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Primary key |
| `contractor_id` | uuid | NOT NULL, FK → contractors | Tenant key |
| `user_id` | uuid | nullable | Links to `auth.users` if the client has an account |
| `name` | text | NOT NULL | Client display name |
| `email` | text | nullable | Contact email |
| `phone` | text | nullable | Contact phone |
| `address` | jsonb | nullable | `{street, city, state, postcode}` |
| `property_notes` | text | nullable | Notes about the property |

**RLS Policies:**
- Contractors: CRUD on own clients (`contractor_id` matches)
- Customers: `SELECT` on own records (`user_id` matches)
- Admin: full access

---

#### 2.2.3 `jobs`

**Purpose:** The primary work item table. Replaces the legacy `bookings` table for the multi-tenant model.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PK | Primary key |
| `contractor_id` | uuid | NOT NULL, FK → contractors | Tenant key |
| `client_id` | uuid | NOT NULL, FK → clients | Which client |
| `title` | text | default `'Lawn Mowing'` | Service name |
| `description` | text | nullable | Job details |
| `status` | text | default `'scheduled'` | `scheduled`, `in_progress`, `completed`, `cancelled`, `pending_confirmation` |
| `source` | text | default `'manual'` | `manual` or `website_booking` — determines payment workflow |
| `scheduled_date` | date | NOT NULL | When the job is scheduled |
| `scheduled_time` | text | nullable | `HH:MM` format |
| `duration_minutes` | int | nullable | Expected duration |
| `total_price` | numeric | nullable | Job price |
| `notes` | text | nullable | Contractor notes |
| `completed_at` | timestamptz | nullable | When marked complete |
| `payment_status` | text | default `'unpaid'` | `unpaid`, `invoiced`, `paid` |
| `payment_intent_id` | text | nullable | Stripe PaymentIntent ID |
| `payment_method_id` | text | nullable | Saved Stripe PaymentMethod |
| `stripe_customer_id` | text | nullable | Stripe Customer for auto-charge |
| `stripe_invoice_id` | text | nullable | Stripe Invoice PDF |
| `stripe_payment_link_id` | text | nullable | Payment Link ID |
| `stripe_payment_link_url` | text | nullable | Payment Link URL |
| `customer_email` | text | nullable | For email notifications |
| `customer_phone` | text | nullable | For SMS (future) |
| `customer_user_id` | uuid | nullable | If customer has an account |
| `time_flexibility` | text | default `'time_restricted'` | `flexible` or `time_restricted` — affects route optimization |
| `route_optimization_locked` | boolean | default `false` | Prevents optimization from moving this job |
| `recurrence_rule` | jsonb | nullable | `{frequency, interval, count}` for recurring jobs |
| `original_scheduled_date` | date | nullable | Pre-optimization date |
| `original_scheduled_time` | text | nullable | Pre-optimization time |
| `original_time_slot` | text | nullable | Pre-optimization slot |
| `quote_breakdown` | jsonb | nullable | Detailed quote components |
| `address_id` | uuid | nullable, FK → addresses | Customer address |

**RLS Policies:**
- Contractors: full CRUD on own jobs
- Customers: `SELECT` via client linkage (`clients.user_id = auth.uid()`)
- Admin: full access

**Trigger:** `auto_shift_job_time` — on INSERT/UPDATE, auto-shifts scheduled_time to avoid overlaps with same-day jobs.

---

#### 2.2.4 `bookings` (LEGACY)

**Purpose:** The original customer-facing booking table. Still used by the legacy `/dashboard` flow and some edge functions (`charge-customer`, `complete-job`, `dispute-job`, `approve-job`, `release-payout`, `auto-release-payouts`). Scheduled for deprecation.

Key differences from `jobs`:
- `user_id` directly references the homeowner (not via `clients`)
- `address_id` references `addresses` table
- Has complex status enum: `pending`, `confirmed`, `completed`, `cancelled`, `disputed`, `post_payment_dispute`, `completed_with_issues`
- Has `payout_status`: `pending`, `frozen`, `released`, `refunded`, `partial_refund`
- Photo verification workflow (min 4 before + 4 after photos)

---

#### 2.2.5 `invoices`

**Purpose:** Invoice records generated for manual jobs or auto-created for website bookings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `contractor_id` | uuid | FK → contractors |
| `client_id` | uuid | FK → clients |
| `job_id` | uuid | nullable, FK → jobs |
| `invoice_number` | text | e.g., `INV-XXXX` |
| `line_items` | jsonb | `[{description, quantity, unit_price}]` |
| `subtotal` | numeric | Pre-GST amount |
| `gst_amount` | numeric | 10% if GST registered |
| `total` | numeric | subtotal + GST |
| `status` | text | `unpaid`, `paid` |
| `paid_at` | timestamptz | nullable |
| `due_date` | date | nullable |
| `notes` | text | nullable |

---

#### 2.2.6 `quotes`

**Purpose:** Quotes sent to clients before a job is created.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `contractor_id` | uuid | FK → contractors |
| `client_id` | uuid | FK → clients |
| `line_items` | jsonb | `[{description, quantity, unit_price}]` |
| `total` | numeric | Quote total |
| `status` | text | `draft`, `sent`, `accepted`, `rejected` |
| `valid_until` | date | nullable |
| `notes` | text | nullable |

---

#### 2.2.7 `disputes`

**Purpose:** Customer complaints with photo evidence and structured resolution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `booking_id` | uuid | nullable, FK → bookings (legacy) |
| `job_id` | uuid | nullable, FK → jobs |
| `contractor_id` | uuid | nullable, FK → contractors |
| `raised_by` | text | `customer` or `contractor` |
| `description` | text | Issue description (min 20 chars) |
| `dispute_reason` | text | Categorized reason |
| `customer_photos` | text[] | Photo URLs |
| `contractor_response` | text | nullable |
| `contractor_response_photos` | text[] | nullable |
| `status` | text | `pending`, `resolved` |
| `resolution` | text | `full_refund`, `partial_refund`, `no_refund` |
| `refund_percentage` | int | nullable |
| `suggested_refund_amount` | numeric | nullable |
| `resolved_at` | timestamptz | nullable |
| `resolved_by` | text | Admin email |

---

#### 2.2.8 `job_photos`

**Purpose:** Before/after photos uploaded by contractors as proof of work.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `job_id` | uuid | nullable, FK → jobs |
| `booking_id` | uuid | nullable, FK → bookings (legacy) |
| `contractor_id` | uuid | FK → contractors |
| `photo_url` | text | Storage URL |
| `photo_type` | text | `before` or `after` |
| `exif_timestamp` | timestamptz | nullable, extracted from photo EXIF |

---

#### 2.2.9 `route_optimizations` & `route_optimization_suggestions`

**Purpose:** Records of optimization runs and individual job reschedule suggestions.

`route_optimizations`:
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `contractor_id` | uuid | FK → contractors |
| `optimization_date` | date | Target date |
| `level` | int | 1=within-day, 2=multi-day, 3=slot-swap |
| `time_saved_minutes` | int | Estimated savings |
| `status` | text | `pending_approval`, `applied`, `declined`, `awaiting_customer` |

`route_optimization_suggestions`:
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `route_optimization_id` | uuid | FK → route_optimizations |
| `job_id` | uuid | FK → jobs |
| `current_date_val` | date | Original date |
| `current_time_slot` | text | Original slot |
| `suggested_date` | date | Proposed date |
| `suggested_time_slot` | text | Proposed slot |
| `requires_customer_approval` | boolean | Whether customer must approve |
| `customer_approval_status` | text | `pending`, `approved`, `declined` |

---

#### 2.2.10 `addresses`

**Purpose:** Customer lawn addresses with area measurements for quoting.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | Owner |
| `street_address` | text | NOT NULL |
| `city`, `state`, `postal_code`, `country` | text | Location |
| `square_meters` | numeric | Lawn area |
| `slope` | enum | `flat`, `mild`, `steep` |
| `tier_count` | int | Number of lawn tiers |
| `status` | enum | `pending`, `verified`, `rejected` |
| `lawn_image_url` | text | nullable |
| `fixed_price` | numeric | nullable, admin override |
| `price_per_sqm` | numeric | nullable |

---

#### 2.2.11 `user_roles`

**Purpose:** Role-based access control. Separate from profiles to prevent privilege escalation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → auth.users |
| `role` | enum | `admin`, `user`, `contractor` |

**Security function:** `has_role(uuid, app_role)` — SECURITY DEFINER, used in all RLS policies.

---

#### 2.2.12 Other Tables

- **`notifications`** — In-app notifications with `is_read` flag
- **`transaction_fees`** — Audit trail for every payment: `payment_amount`, `stripe_fee`, `yardly_fee`, `contractor_payout`
- **`processed_stripe_events`** — Idempotency table for webhook deduplication
- **`user_status_audit`** — Audit log for admin actions on user accounts
- **`profiles`** — Basic user info (`full_name`, `phone`)
- **`alternative_suggestions`** — Time-change proposals from contractors

### 2.3 Multi-Tenancy Implementation

The platform uses **`contractor_id`** as the universal tenant key:

1. **Data isolation:** Every tenant-scoped table (`clients`, `jobs`, `invoices`, `quotes`, `job_photos`, `disputes`) has a `contractor_id` column
2. **RLS enforcement:** All policies filter by `contractor_id IN (SELECT id FROM contractors WHERE user_id = auth.uid())`
3. **Cross-tenant prevention:** The `has_role()` SECURITY DEFINER function prevents recursive RLS checks
4. **Customer access:** Customers access data via `clients.user_id = auth.uid()` → `jobs.client_id` chain
5. **Admin bypass:** Admins use `has_role(auth.uid(), 'admin')` which passes all policies

---

## 3. Backend Services (Edge Functions)

### 3.1 `public-booking`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Accept booking requests from contractor websites |
| **Trigger** | HTTP POST from public booking form |
| **Auth** | Public (`verify_jwt = false`). No user auth required. |
| **Input** | `{contractor_slug, customer_name, customer_email, customer_phone?, service_type, address?, preferred_date, preferred_time?, notes?, customer_user_id?}` |
| **Output** | `{success: true, job_id}` or error |
| **Logic** | 1. Rate limit (5/hour per IP) → 2. Validate inputs (email regex, AU phone regex, 90-day date limit, min name length) → 3. Find contractor by subdomain → 4. Verify website published → 5. Validate customer_user_id if provided → 6. Find or create client record → 7. Create job with status `pending_confirmation` → 8. Notify contractor |
| **Dependencies** | Supabase (contractors, clients, jobs, notifications) |
| **Security** | ✅ Rate limiting (5 req/hour/IP). ✅ Input validation. ✅ customer_user_id verified against auth. ⚠️ In-memory rate limiter resets on cold start. |

### 3.2 `stripe-connect`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Create/manage Stripe Connect Express accounts for contractors |
| **Auth** | JWT required, contractor role verified |
| **Input** | `{action: "create_account_link" | "status"}` |
| **Logic** | 1. Auth user → 2. Get contractor profile → 3. Verify approved → 4. Create Stripe Express account if none → 5. Set manual payout schedule → 6. Return onboarding link or status |
| **Dependencies** | Stripe (accounts, accountLinks), Supabase (contractors) |

### 3.3 `stripe-connect-webhook`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Handle Stripe Connect account update events |
| **Auth** | Public (`verify_jwt = false`). Stripe signature verification. |
| **Logic** | 1. Verify webhook signature → 2. Idempotency check via `processed_stripe_events` → 3. On `account.updated`: update `stripe_onboarding_complete` and `stripe_payouts_enabled` |
| **Security** | ✅ Signature verification. ✅ Idempotency. |

### 3.4 `subscription-webhook`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Handle subscription lifecycle events |
| **Auth** | Public (`verify_jwt = false`). Stripe signature verification. |
| **Logic** | Handles `checkout.session.completed` (activate tier), `customer.subscription.updated` (tier change), `customer.subscription.deleted` (revert to free) |
| **Security** | ✅ Signature verification. ✅ Idempotency. |

### 3.5 `stripe-payment-link-webhook`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Mark jobs/invoices as paid when Payment Link is completed |
| **Auth** | Public (`verify_jwt = false`). Stripe signature verification. |
| **Logic** | On `checkout.session.completed`: update job `payment_status = 'paid'`, update linked invoice, notify contractor |
| **Security** | ✅ Signature verification. ✅ Idempotency. |

### 3.6 `manage-subscription`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Create Stripe Checkout sessions for subscriptions or Billing Portal sessions |
| **Auth** | JWT required |
| **Input** | `{action: "create-checkout" | "create-portal" | "status", tier?: "starter" | "pro" | "team"}` |
| **Logic** | `create-checkout`: auto-creates Stripe Products/Prices if they don't exist, creates Checkout Session. `create-portal`: creates Billing Portal session. |
| **Pricing** | Starter: $29/mo, Pro: $59/mo, Team: $99/mo |

### 3.7 `charge-customer`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Charge a customer's saved payment method for a legacy booking |
| **Auth** | JWT required, contractor verified |
| **Logic** | 1. Verify contractor → 2. Fetch booking with payment method → 3. Clone payment method to connected account → 4. Create direct charge PaymentIntent with application fee → 5. Record transaction fee → 6. Update booking → 7. Notify both parties |
| **Fee Calculation** | Application fee based on tier (5%/2.5%/1%). Only applied to `website_booking` source. |
| **Security** | ✅ Generic error messages to client. |

### 3.8 `complete-job-v2`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Complete a job in the new multi-tenant model |
| **Auth** | JWT required, contractor verified |
| **Input** | `{jobId, action: "complete" | "generate_invoice" | "send_payment_link" | "mark_paid"}` |
| **Logic** | **Path A (website_booking):** Auto-charge saved payment method → generate invoice → record fees → send receipt. **Path B (manual):** Mark completed → return payment options. **generate_invoice:** Create invoice record. **send_payment_link:** Create Stripe Payment Link. **mark_paid:** Manual reconciliation. |
| **GST Handling** | Checks `contractor.gst_registered`. If true: subtotal × 1.1, Tax Invoice label, ABN shown. |

### 3.9 `complete-job`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Complete a legacy booking with photo verification |
| **Auth** | JWT required, contractor verified |
| **Logic** | 1. Verify min 4 before + 4 after photos → 2. Check for reported issues → 3. If issues: freeze payout, notify admins. If clean: set `completed_pending_verification`, customer has 48h to approve. |
| **Security** | ✅ Safe error allowlist. |

### 3.10 `approve-job`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Customer approves a completed booking and triggers payout |
| **Auth** | JWT required, must be booking owner |
| **Logic** | 1. Verify booking in `completed_pending_verification` → 2. Call `release-payout` → 3. Save review if provided → 4. Notify contractor with email |

### 3.11 `release-payout`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Trigger a Stripe payout from the connected account to the contractor's bank |
| **Auth** | JWT optional (can be called by cron or other functions with service key) |
| **Logic** | 1. Verify `payout_status = 'pending'` → 2. Look up `transaction_fees` for actual payout amount → 3. Create Stripe Payout on connected account → 4. Update booking status |
| **Security** | ✅ Generic error message. ⚠️ Authorization check allows service-role calls without user context. |

### 3.12 `auto-release-payouts`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Cron job to auto-release payouts after 48 hours if customer hasn't responded |
| **Trigger** | Scheduled (cron) |
| **Logic** | 1. Find bookings with `completed_pending_verification` + `payout_status = 'pending'` + `completed_at < 48h ago` → 2. Auto-rate 5 stars → 3. Call `release-payout` → 4. Email both parties |

### 3.13 `dispute-job`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Customer raises a dispute on a completed booking |
| **Auth** | JWT required, must be booking owner |
| **Logic** | 1. Validate (description ≥20 chars, dispute reason required) → 2. Check eligibility (pre-payment or within 7-day post-payment window) → 3. Create dispute record → 4. If pre-payment: freeze payout. If post-payment: mark `post_payment_dispute` → 5. Notify contractor + admin with emails |
| **Security** | ✅ Safe error allowlist. |

### 3.14 `resolve-dispute`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Admin resolves a dispute with refund decision |
| **Auth** | JWT required, **admin role verified** |
| **Input** | `{disputeId, resolution: "full_refund" | "partial_refund" | "no_refund", refundPercentage?}` |
| **Logic** | `full_refund`: Stripe refund → `no_refund`: release payout → `partial_refund`: Stripe partial refund + release remaining. All paths: update dispute + booking, notify + email both parties. |

### 3.15 `route-optimization`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Optimize job scheduling to reduce travel time using Google Maps Distance Matrix |
| **Auth** | Public (`verify_jwt = false`) — callable by cron or contractor dashboard |
| **Input** | `{contractor_id?, preview?: boolean}` |
| **Logic** | **On-demand (with contractor_id):** preview=true returns proposed changes, preview=false applies them. **Cron (no contractor_id):** dry-run for all eligible contractors, sends notification teasers. |
| **Optimization Levels:** | Level 1: Nearest-neighbor reorder within same-day flexible jobs. Level 2: Cross-day redistribution of flexible jobs. Level 3: Time-slot swapping (morning↔afternoon) requiring customer approval. |
| **Tier Gating** | Only `starter` and `pro` tiers eligible |
| **Dependencies** | Google Maps Distance Matrix API |
| **Security** | ⚠️ `verify_jwt = false` and no auth check. Anyone with the contractor_id could trigger optimization. |

### 3.16 `create-payment-intent`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Create a Stripe PaymentIntent for a legacy booking |
| **Auth** | JWT required, RLS-verified booking ownership |
| **Logic** | Find/create Stripe customer → create PaymentIntent → update booking |

### 3.17 `save-payment-method`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Create a Stripe SetupIntent to save a card for future charges |
| **Auth** | JWT required, RLS-verified booking ownership |

### 3.18 `send-invoice`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Email an invoice to a client |
| **Auth** | JWT required, contractor verified as invoice owner |
| **Logic** | Build HTML email with line items, GST breakdown if applicable (Tax Invoice label, ABN display, GST 10% row), send via Resend |

### 3.19 `send-booking-email`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Send transactional emails for booking lifecycle events |
| **Auth** | JWT required, authorization checked (owner, contractor, or admin) |
| **Templates** | `created`, `confirmed`, `updated`, `cancelled` |

### 3.20 `calculate-quote`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Calculate a price quote based on lawn area, slope, grass length, etc. |
| **Auth** | JWT required |
| **Logic** | Uses contractor-specific pricing from `questionnaire_responses.pricing` or falls back to global `pricing_settings` table |

### 3.21 `generate-website-copy`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Generate AI website copy for a contractor |
| **Auth** | JWT required, contractor role verified |
| **Security** | ✅ Auth added during security hardening. |

### 3.22 `auto-generate-recurring-jobs`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Cron job to create next occurrence of recurring jobs |
| **Auth** | Public (`verify_jwt = false`) — intended for cron |
| **Logic** | Find completed jobs with `recurrence_rule` → calculate next date → check for duplicates → check count limit → create next job → notify contractor |

### 3.23 `check-insurance-expiry`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Cron job to manage insurance compliance |
| **Logic** | ≤0 days: suspend + email. ≤7 days: restrict from new jobs. ≤30 days: reminder. |

### 3.24 `test-mode-login`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Create/login test personas for development |
| **Auth** | Public (`verify_jwt = false`). Protected by `TEST_MODE_ENABLED` flag + `TEST_SECRET_KEY` |
| **Personas** | `customer_new` (test customer with verified address), `contractor_active` (test contractor with full profile) |
| **Security** | ✅ Kill switch via env var. ✅ Secret key validation. ⚠️ If `VITE_ENABLE_TEST_MODE=true` in production, this endpoint is live. |

### 3.25 `admin-manage-users`, `admin-search-user`, `admin-get-user-emails`

| Attribute | Detail |
|-----------|--------|
| **Purpose** | Admin user management (suspend/ban, search, email lookup) |
| **Auth** | JWT required, **admin role verified** |
| **Security** | ✅ Admin check. ✅ SQL wildcard escaping in search. ✅ 100-char input limit. ✅ Generic errors. |

---

## 4. Frontend Architecture

### 4.1 Project Structure

```
src/
├── pages/                    # Route-level components (one per route)
│   ├── Index.tsx             # Landing page
│   ├── Auth.tsx              # Customer auth
│   ├── ContractorAuth.tsx    # Contractor auth
│   ├── ContractorOnboarding.tsx  # 5-step onboarding wizard
│   ├── ContractorDashboard.tsx   # Main contractor CRM
│   ├── Dashboard.tsx         # Legacy customer dashboard
│   ├── Admin.tsx             # Admin panel
│   ├── ContractorWebsite.tsx # Public contractor site
│   ├── ContractorSiteAuth.tsx    # Customer auth on contractor site
│   ├── ContractorSiteDashboard.tsx # Customer portal
│   └── ...
├── components/
│   ├── ui/                   # shadcn/ui primitives (50+ components)
│   ├── contractor-crm/       # Contractor dashboard tabs
│   │   ├── DashboardOverview.tsx
│   │   ├── ClientsTab.tsx
│   │   ├── JobsTab.tsx
│   │   ├── QuotesTab.tsx
│   │   ├── InvoicesTab.tsx
│   │   ├── ProfileSettingsTab.tsx
│   │   ├── WebsiteBuilderTab.tsx
│   │   ├── ContractorPricingTab.tsx
│   │   ├── DisputeManagementTab.tsx
│   │   ├── RouteOptimizationBanner.tsx
│   │   ├── RouteOptimizationModal.tsx
│   │   └── ...
│   ├── contractor-website/   # Public booking form
│   ├── customer-portal/      # Customer portal components
│   ├── dashboard/            # Legacy customer dashboard components
│   ├── landing/              # Landing page sections
│   ├── admin/                # Admin panel components
│   ├── auth/                 # ProtectedRoute
│   ├── layout/               # Navbar, Footer
│   └── test-mode/            # Test mode banner & dialog
├── hooks/                    # Custom hooks
├── lib/                      # Utility libraries
├── integrations/supabase/    # Auto-generated Supabase client & types
└── index.css                 # Design tokens & global styles
```

### 4.2 Routing

| Route | Component | Auth | Description |
|-------|-----------|------|-------------|
| `/` | `Index` | Public | Landing page |
| `/about` | `About` | Public | About page |
| `/auth` | `Auth` | Public | Customer signup/login |
| `/contractor-auth` | `ContractorAuth` | Public | Contractor signup/login |
| `/contractor-onboarding` | `ContractorOnboarding` | Public* | 5-step wizard (checks auth internally) |
| `/dashboard` | `Dashboard` | `ProtectedRoute` (any auth) | Legacy customer dashboard |
| `/admin` | `Admin` | `ProtectedRoute` (admin role) | Admin panel |
| `/contractor` | `ContractorDashboard` | `ProtectedRoute` (contractor role) | Main contractor CRM |
| `/contractor/jobs/:id/complete` | `ContractorJobComplete` | `ProtectedRoute` (contractor) | Job completion flow |
| `/settings` | `Settings` | `ProtectedRoute` (any auth) | User settings |
| `/customer/bookings/:id/verify` | `CustomerVerifyJob` | `ProtectedRoute` (any auth) | Approve completed work |
| `/site/:slug` | `ContractorWebsite` | Public | Contractor's public website |
| `/site/:slug/auth` | `ContractorSiteAuth` | Public | Customer auth on contractor site |
| `/site/:slug/portal` | `ContractorSiteDashboard` | Public* | Customer portal (checks auth internally) |
| `/payment-success` | `PaymentSuccess` | Public | Post-payment redirect |
| `/terms`, `/privacy` | `Terms`, `Privacy` | Public | Legal pages |

**ProtectedRoute** implementation (`src/components/auth/ProtectedRoute.tsx`):
1. Calls `supabase.auth.getUser()` to verify session
2. Fetches `user_roles` for the user
3. If admin role present → always authorized
4. If `requiredRole` specified → checks against user's roles
5. Renders loading spinner while checking, redirects on failure

### 4.3 State Management

- **Server state:** `@tanstack/react-query` (QueryClient) wraps the entire app. Each tab/component fetches its own data.
- **Local state:** `useState` for UI state (forms, modals, tab selection)
- **URL state:** `useSearchParams` for contractor dashboard tab persistence (`?tab=jobs`)
- **No global client-side store** — no Redux/Zustand. All data flows through Supabase queries.

### 4.4 Component Library

- **shadcn/ui** components installed in `src/components/ui/` (~50 components)
- **Design tokens** defined in `src/index.css` as CSS custom properties (HSL format)
- **TailwindCSS** with custom config in `tailwind.config.ts`
- All components use semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, etc.)

### 4.5 Key Component Breakdown

#### Contractor Dashboard (`ContractorDashboard.tsx`)
- Tab-based SPA with sidebar navigation (10 tabs)
- Mobile: bottom nav with 5 items, slide-out sidebar for full nav
- Route optimization integration: banner on Overview and Jobs tabs, modal for reviewing suggestions
- State: `contractor` object loaded once, passed to child tabs as props

#### Route Optimization UI
- `RouteOptimizationBanner` — shows on overview/jobs tabs, teaser for Free tier (blurred map + upgrade CTA), actionable for Starter/Pro
- `RouteOptimizationModal` — lists pending optimizations with accept/decline/ask-customers actions
- `OptimizationPreviewDialog` — shows proposed time changes before applying

#### Contractor Website & Booking (`ContractorWebsite.tsx`, `PublicBookingForm.tsx`)
- Public page at `/site/{slug}` — AI-generated content, hero, services, CTA
- Booking form wraps Stripe Elements for card capture (SetupIntent)
- Fallback form without Stripe if not configured
- Optional lawn area drawing via Leaflet

---

## 5. Key Workflows & Features

### 5.1 New Contractor Onboarding

```
1. Contractor visits /contractor-auth → signs up
2. Redirected to /contractor-onboarding (5 steps):
   Step 1: Business Profile (name, ABN, phone, address, working hours)
   Step 2: Stripe Connect (create Express account, external onboarding)
   Step 3: Website (AI generates copy, auto-publish with slug)
   Step 4: First Client (name, email, phone, address)
   Step 5: First Job (title, date, time, price → creates job record)
3. Each step can be skipped
4. On completion → redirect to /contractor dashboard
```

**Tables touched:** `user_roles` (add contractor), `contractors` (create/update), `profiles`, `clients`, `jobs`

### 5.2 Job Lifecycle

#### Website Booking Flow
```
Customer → /site/{slug} → Book Now
  → /site/{slug}/auth (login/signup)
  → /site/{slug}/portal → Booking form
  → PublicBookingForm: captures card via Stripe SetupIntent
  → public-booking edge fn: creates job (status: pending_confirmation)
  → Contractor reviews in dashboard → approves
  → On completion: complete-job-v2 auto-charges saved card
  → Invoice auto-generated, receipt emailed
```

#### Manual Job Flow
```
Contractor → Jobs tab → Create Job
  → Set client, date, time, price
  → Status: scheduled → in_progress → completed
  → On completion: complete-job-v2 returns payment options
    Option A: Generate Invoice → send via email
    Option B: Send Stripe Payment Link → webhook marks paid
    Option C: Mark as Paid (manual reconciliation)
```

### 5.3 Route Optimization

```
Nightly Cron (route-optimization, no contractor_id):
  1. For each Starter/Pro contractor:
     - Dry run optimization for next 3 days
     - If savings found → send notification
  2. For Starter contractors: teaser notifications

On-Demand (contractor clicks "Run Optimization"):
  1. preview=true: dry run, returns proposed changes
  2. Contractor reviews in OptimizationPreviewDialog
  3. Confirms → preview=false: applies time changes to jobs
  
Algorithm:
  - Level 1: Nearest-neighbor reorder within time groups
  - Level 2: Cross-day redistribution of flexible jobs  
  - Level 3: Morning↔afternoon slot swaps (requires customer approval)
```

### 5.4 Subscription & Payment

```
Contractor → Pricing tab → Select tier → Checkout
  → manage-subscription: create Stripe Checkout Session
  → Stripe hosted page → payment
  → subscription-webhook: update contractor.subscription_tier
  
Manage/Cancel:
  → manage-subscription: create Billing Portal Session
  → Stripe Billing Portal
  → On cancel: subscription-webhook reverts to 'free'
```

---

## 6. Analysis and Recommendations

### 6.1 Security Vulnerabilities

| Severity | Finding | Location |
|----------|---------|----------|
| **HIGH** | `route-optimization` has no authentication. Anyone with a contractor UUID can trigger optimization or view job schedules. | `supabase/functions/route-optimization/index.ts` — `verify_jwt = false` and no auth header check |
| **HIGH** | `resolve-dispute` exposes raw error messages (including Stripe errors) to the client, unlike other hardened functions. | `supabase/functions/resolve-dispute/index.ts` line 289-294 |
| **MEDIUM** | `auto-generate-recurring-jobs` has no auth. Could be invoked externally to trigger mass job creation. | `supabase/config.toml` — `verify_jwt = false`, no auth check in code |
| **MEDIUM** | `auto-release-payouts` has no auth protection — could be called externally to prematurely release payouts. | No auth header check |
| **MEDIUM** | `check-insurance-expiry` calls `auth.admin.listUsers()` which returns all users — inefficient and exposes data within the function. | `supabase/functions/check-insurance-expiry/index.ts` line 48 |
| **MEDIUM** | `complete-job-v2` exposes raw error messages to client (line 342). Inconsistent with hardened pattern used elsewhere. | `supabase/functions/complete-job-v2/index.ts` |
| **MEDIUM** | Test mode (`test-mode-login`) is controlled by `VITE_ENABLE_TEST_MODE` env var. If left as `true` in production, test users can be created. | `.env` line 1 |
| **LOW** | `create-payment-intent` exposes raw error messages. | `supabase/functions/create-payment-intent/index.ts` line 155-163 |
| **LOW** | `approve-job` inserts into a `reviews` table that doesn't exist in the current schema — will silently fail. | `supabase/functions/approve-job/index.ts` line 99 |
| **LOW** | Some email templates reference "Lawnly" (old brand name) instead of "Yardly". | `dispute-job`, `resolve-dispute`, `complete-job`, `auto-release-payouts`, `send-booking-email` |

### 6.2 Performance Bottlenecks

| Issue | Location | Impact |
|-------|----------|--------|
| **N+1 queries in cron jobs** | `auto-generate-recurring-jobs` fetches all completed recurring jobs, then queries each individually | Linear scaling with job count |
| **Distance Matrix API calls** | `route-optimization` makes O(n²) API calls for job batches >10 | Can hit Google Maps rate limits; expensive |
| **`auth.admin.listUsers()` full scan** | `check-insurance-expiry` loads ALL users to map emails | Won't scale beyond ~1000 users |
| **Denormalized counters** | `update_contractor_metrics` trigger recounts ALL bookings on every booking change | O(n) per update, will slow with booking growth |
| **No pagination** | Dashboard components fetch all records without limits | Will degrade with >100 jobs/clients |
| **Sequential payout loop** | `auto-release-payouts` processes bookings sequentially | Slow if many bookings qualify |

### 6.3 Code Quality & Technical Debt

| Issue | Impact |
|-------|--------|
| **Legacy `bookings` table still active** | ~8 edge functions still operate on `bookings`. Creates confusion about which table is canonical. Migration to `jobs`-only is incomplete. |
| **Duplicate booking form code** | `PublicBookingForm.tsx` has two nearly identical form components (with Stripe and fallback). ~200 lines of duplication. |
| **Brand inconsistency** | Mix of "Lawnly", "Lawn Care", and "Yardly" in email templates and UI. |
| **Large monolithic edge functions** | `route-optimization` (690 lines), `complete-job` (318 lines), `dispute-job` (227 lines) could be decomposed. |
| **Inconsistent error handling** | Some functions return generic errors (hardened), others return raw `error.message`. No consistent pattern. |
| **No TypeScript types in edge functions** | Edge functions use `any` liberally, reducing type safety. |
| **Missing database triggers** | The `db-triggers` section is empty, but `auto_shift_job_time` function exists and was presumably attached. Trigger configuration may be out of sync. |
| **No automated tests** | No test files found. All verification is manual. |

### 6.4 Architectural Improvements

| Recommendation | Priority | Rationale |
|----------------|----------|-----------|
| **Complete `bookings` → `jobs` migration** | High | Eliminate dual-table confusion. Migrate all edge functions to use `jobs` table exclusively. |
| **Add authentication to cron functions** | High | `route-optimization`, `auto-generate-recurring-jobs`, `auto-release-payouts`, `check-insurance-expiry` should validate a service-role key or use Supabase's native cron. |
| **Replace denormalized counters with a DB view** | Medium | Create `contractor_metrics_view` that aggregates from `transaction_fees` and `jobs` instead of trigger-maintained counters. |
| **Extract shared edge function utilities** | Medium | Create shared modules for auth validation, error handling, email sending, and Stripe initialization. |
| **Add database indexes** | Medium | Add indexes on `jobs(contractor_id, scheduled_date)`, `jobs(client_id)`, `clients(contractor_id, email)` for query performance. |
| **Implement proper cron scheduling** | Medium | Use Supabase's `pg_cron` or external scheduler instead of publicly-exposed HTTP endpoints for cron jobs. |
| **Add client-side pagination** | Low | Implement cursor-based pagination for jobs, clients, invoices lists. |
| **Consolidate email templates** | Low | Create a shared template system instead of inline HTML in each edge function. |
| **Add E2E tests** | Low | Add Playwright or Cypress tests for critical flows (onboarding, booking, payment). |

---

*End of documentation.*
