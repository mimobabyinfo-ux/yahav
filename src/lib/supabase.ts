import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string
  email: string
  mother_name: string | null
  baby_name: string | null
  baby_dob: string | null
  baby_gender: 'boy' | 'girl' | 'other' | null
  is_pro: boolean
  is_admin: boolean
  display_name: string | null
  lead_status: 'new_lead' | 'active_workshop' | 'post_service' | null
  staff_notes: string | null
  last_active: string | null
  family_id: string | null
  area: string | null
  /** Optional neighbourhood inside `area`. Free text; suggestions come
   *  from what other mothers in the same city typed. */
  neighborhood: string | null
  phone_number: string | null
  community_consent: boolean
  community_bio: string | null
  // Phase 4 / C2: preset tags mom can pick to surface in the community
  // filter (coffee/park/workout/...). Empty array = no preference, mom
  // is hidden from any tag-scoped filter (filter intent = "actively
  // looking for X"). IDs enumerated in src/constants/communityTags.ts.
  community_tags: string[]
  // Phase 4 / C1: when this profile belongs to a guest who redeemed a
  // family invite, the role + custom display name picked by mom flow
  // through here so the journal can greet them by name.
  family_role: 'father' | 'grandma' | 'grandpa' | 'aunt' | 'nanny' | null
  family_display_name: string | null
  user_mode: 'pregnant' | 'mom' | null
  due_date: string | null
  reminder_water_enabled: boolean
  reminder_water_hours: number
  reminder_vitamins_enabled: boolean
  reminder_vitamins_time: string | null
  reminder_exercise_enabled: boolean
  reminder_exercise_time: string | null
  feeding_interval_hours: number
  hidden_pregnancy_items: string[]
  pregnancy_task_completions: string[] | null
  created_at: string
  updated_at: string
}

export type Family = {
  id: string
  created_by: string | null
  family_name: string | null
  invite_code: string
  created_at: string
}

// Phase 4 / C1: a row in family_invite_tokens. role + recipient_name +
// revoked_at + last_accessed_at added by migration 20260603000000.
export type FamilyInviteToken = {
  id: string
  family_id: string
  child_id: string | null
  token: string
  created_by: string | null
  expires_at: string
  created_at: string
  role: 'father' | 'grandma' | 'grandpa' | 'aunt' | 'nanny' | null
  recipient_name: string | null
  revoked_at: string | null
  last_accessed_at: string | null
}

export type PurchasedWorkshop = {
  id: string
  user_id: string
  workshop_id: string
  purchase_date: string
  amount_paid: number | null
  notes: string | null
  access_start_date: string | null
  access_end_date: string | null
  created_at: string
}

export type Child = {
  id: string
  user_id: string
  name: string
  dob: string | null
  gender: 'boy' | 'girl' | 'other' | null
  share_token: string | null
  created_at: string
}

export type DailyTip = {
  id: string
  tip_text: string
  is_active: boolean
  created_at: string
  // Phase 3 / C2 — age & pregnancy-week targeting (migration 20260601150000).
  // All additive + nullable; existing rows get tip_for='mom', 0–730 day window.
  title: string | null
  article_link: string | null
  age_range_start_days: number | null
  age_range_end_days: number | null
  tip_for: 'mom' | 'pregnancy' | null
  pregnancy_week_start: number | null
  pregnancy_week_end: number | null
}

export type ContentCategory = {
  id: string
  name: string
  slug: string
  description: string | null
  category_type: 'video' | 'workshop' | 'both'
  icon: string | null
  color: string | null
  display_order: number
  is_active: boolean
  created_at: string
}

export type Video = {
  id: string
  title: string
  description: string | null
  video_url: string | null
  thumbnail_url: string | null
  duration_minutes: number | null
  category_id: string | null
  tags: string[] | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type HomeworkTask = {
  id: string
  video_id: string
  task_description: string
  display_order: number
  created_at: string
}

export type UserVideoProgress = {
  id: string
  user_id: string
  video_id: string
  completed: boolean
  completed_at: string | null
}

export type Workshop = {
  id: string
  title: string
  description: string | null
  summary: string | null
  workshop_type: string | null
  image_url: string | null
  video_url: string | null
  category_id: string | null
  tags: string[] | null
  price: number | null
  currency: string | null
  payment_link: string | null
  next_workshop_id: string | null
  public_registration: boolean
  // Phase 5 / A2 Part 2: optional questionnaire linked to this workshop
  // (FK to forms). Powers the customer card's "did this mother fill
  // the questionnaire" indicator and the cohort-side gap report.
  // This is the OPENING / developmental form.
  linked_form_id: string | null
  // End-of-workshop feedback survey (FK to forms), DISTINCT from
  // linked_form_id. Emailed to a cohort's registrants after the cohort
  // ends. Optional.
  feedback_form_id: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Product max / stock. For cohort-based workshops this doubles as the
  // DEFAULT cohort capacity — cohorts with capacity=NULL inherit it.
  stock_quantity: number | null
  // Recommended baby age window in MONTHS (decimals allowed, e.g. 3.5).
  // Powers the age-matched recommendation card on the home dashboard.
  // Both NULL = no age targeting; end NULL = open-ended.
  // Which thank-you template this product shows after payment.
  // NULL = auto-detect (physical → product, has cohorts → group,
  // otherwise → private). Set explicitly for a cohort-based product
  // that has NO dedicated WhatsApp group (מפגש אבות, בוקר של מימו).
  thanks_template: 'group' | 'meetup' | 'private' | 'product' | null
  age_range_start_months: number | null
  age_range_end_months: number | null
}

// Admin-controlled home-page announcement (מבצע / הנחה / הודעה).
// Shown as a prominent banner on the dashboard for logged-in users.
// starts_at/ends_at (dates, Asia/Jerusalem semantics) bound visibility;
// NULL = unbounded on that side.
export type HomeAnnouncement = {
  id: string
  title: string
  body: string | null
  emoji: string | null
  link_type: 'workshops' | 'benefits' | 'community' | 'url' | null
  link_url: string | null
  starts_at: string | null // YYYY-MM-DD
  ends_at: string | null   // YYYY-MM-DD
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

// Row shape returned by the get_public_cohorts RPC (SECURITY DEFINER)
// used on the public registration page: upcoming, active cohorts only,
// with effective capacity (cohort override ?? workshop stock) and the
// current registration count for "spots left" display.
export type PublicCohort = {
  id: string
  workshop_id: string
  start_date: string        // YYYY-MM-DD
  start_time: string | null // HH:MM:SS
  label: string | null
  capacity: number | null
  registered_count: number
}

// Task B: scoped discount link for a workshop. Not shown on the
// public form — reachable only via ?offer=<token>. The token is the
// secret; RLS is admin-only at the table level, public access goes
// through the get_workshop_offer / claim_workshop_offer RPCs.
export type WorkshopOffer = {
  id: string
  workshop_id: string
  token: string
  label: string
  discount_type: 'fixed' | 'percent'
  discount_value: number
  // Override link; required at the application layer when
  // discount_value > 0 (no payment-provider integration means the
  // discount only "exists" insofar as the link's checkout matches).
  payment_link: string | null
  max_uses: number | null
  uses_count: number
  expires_at: string | null
  is_active: boolean
  created_at: string
}

// Phase 5 / A1: workshops have recurring cohorts (Hebrew label: "מחזור").
// Each cohort is one workshop × one start_date with optional label /
// advisory capacity / free-text notes. registration_leads.cohort_id
// (nullable) attaches a registration to a cohort post-signup.
export type WorkshopCohort = {
  id: string
  workshop_id: string
  start_date: string  // YYYY-MM-DD
  // Phase 5 / A1 Stage 2: optional local start time as HH:MM:SS. Two
  // cohorts on the same date with different times are distinct
  // entities. NULL = date-only cohort (admin hasn't set a time yet).
  start_time: string | null
  label: string | null
  capacity: number | null
  notes: string | null
  is_active: boolean
  // End-of-workshop feedback. end_date drives WHEN the survey email
  // goes out (end_date + survey_email_delay_days, Asia/Jerusalem). The
  // admin UI auto-suggests start_date + 4 weeks but it stays editable.
  // survey_sent_at is the once-only guard (NULL = not sent yet).
  end_date: string | null  // YYYY-MM-DD
  survey_sent_at: string | null
  created_at: string
}

export type WorkshopContent = {
  id: string
  workshop_id: string
  type: 'video' | 'homework' | 'pdf'
  title: string
  description: string | null
  url: string | null
  tasks_json: string[] | null
  display_order: number
  is_active: boolean
  created_at: string
}

export type UserHomeworkProgress = {
  id: string
  user_id: string
  content_id: string
  task_index: number
  completed: boolean
  completed_at: string | null
}

export type PartnerPerk = {
  id: string
  partner_name: string
  logo_url: string | null
  short_description: string | null
  full_description: string | null
  discount_code: string | null
  action_link: string | null
  is_featured: boolean
  is_active: boolean
  redeem_in_person: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type PerkAnalytic = {
  id: string
  perk_id: string
  user_id: string | null
  action_type: 'view' | 'copy_code' | 'visit_link'
  created_at: string
}

export type GlobalSetting = {
  id: string
  setting_key: string
  setting_value: string | null
  setting_type: 'text' | 'number' | 'boolean' | 'url' | 'json'
  category: string | null
  description: string | null
  updated_at: string
  created_at: string
}

export type DailyLogEntry = {
  id: string
  user_id: string
  child_id: string | null
  entry_date: string
  entry_time: string
  entry_type: 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'pumping' | 'milestone' | 'doctor_visit' | 'note'
  notes: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export type FeedingDetail = {
  id: string
  log_entry_id: string
  feeding_type: 'breast' | 'bottle' | 'solid' | null
  breast_side: 'left' | 'right' | 'both' | null
  duration_minutes: number | null
  amount_ml: number | null
  // Per-side seconds — populated by the dedicated Breastfeeding action page
  // (Phase 2). NULL for bottle/solid and for legacy breast entries that
  // only stored an aggregate duration_minutes.
  left_duration_seconds: number | null
  right_duration_seconds: number | null
  // Bottle-only: distinguishes pumped breast milk from formula. NULL for
  // breast/solid feedings and for legacy bottle entries.
  milk_type: 'pumped' | 'formula' | null
}

export type SleepDetail = {
  id: string
  log_entry_id: string
  sleep_type: 'nap' | 'night' | null
  duration_minutes: number | null
  quality: 'good' | 'fair' | 'poor' | null
}

export type DiaperDetail = {
  id: string
  log_entry_id: string
  // 'dry' was added via migration 20260601130000 for the dedicated
  // DiaperPage (checked-but-found-dry diapers, useful for intake/output
  // tracking). Existing rows are wet/dirty/both/NULL.
  diaper_type: 'wet' | 'dirty' | 'both' | 'dry' | null
  notes: string | null
}

// Structured details for entries with entry_type='doctor_visit'. The table
// is named medical_details (TypeScript convention) even though the parent
// entry_type stays as the legacy 'doctor_visit' string per Q2/N2.
export type MedicalDetail = {
  id: string
  log_entry_id: string
  medical_type: 'vaccination' | 'checkup' | 'illness' | 'medication' | 'other' | null
  details: string | null
  created_at: string
}

export type ActiveTimer = {
  id: string
  user_id: string
  timer_type: string
  start_time: string
  additional_data: Record<string, unknown> | null
  created_at: string
}

export type PregnancyWeeklyGuide = {
  id: string
  week: number
  symptoms: string | null
  baby_size: string | null
  baby_size_emoji: string | null
  development: string | null
  fun_fact: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
}

export type UserPregnancyItem = {
  id: string
  user_id: string
  category: 'medical' | 'buying'
  subcategory: string | null
  text: string
  week_from: number | null
  week_to: number | null
  is_completed: boolean
  created_at: string
}

export type PregnancyChecklistItem = {
  id: string
  category: 'medical' | 'buying'
  subcategory: string | null
  text: string
  week_from: number | null
  week_to: number | null
  display_order: number
  is_active: boolean
  created_at: string
}

export type UserReminder = {
  id: string
  user_id: string
  label: string
  emoji: string
  time_of_day: string | null
  is_enabled: boolean
  created_at: string
}

export type ServicePartner = {
  id: string
  title: string
  description: string | null
  // 'both' (Yahav 11.8.26): a vendor who serves pregnancy AND
  // motherhood used to have to be entered twice.
  category: 'pregnancy' | 'motherhood' | 'both'
  /** First topic. Kept in sync with subcategories[0] for older readers. */
  subcategory: string | null
  /** Every folder this vendor belongs to — a trainer who is also a
   *  nutritionist appears in both. */
  subcategories: string[] | null
  whatsapp_number: string | null
  logo_url: string | null
  display_order: number
  is_active: boolean
  created_at: string
}

// Admin-only vendor business info (cost per event + notes). Separate
// table on purpose — service_partners is publicly readable, costs are
// not for moms' eyes. RLS: admin-only.
export type VendorAdminInfo = {
  vendor_id: string
  cost: number | null
  cost_notes: string | null
  updated_at: string
}

export type PartnerLead = {
  id: string
  user_id: string | null
  partner_id: string | null
  action_type: 'whatsapp' | 'callback'
  contact_name: string | null
  contact_phone: string | null
  created_at: string
}

// Extended types (with joins)
export type DailyLogEntryWithDetails = DailyLogEntry & {
  feeding_details?: FeedingDetail | null
  sleep_details?: SleepDetail | null
  diaper_details?: DiaperDetail | null
}

export type VideoWithProgress = Video & {
  is_completed?: boolean
  homework_tasks?: HomeworkTask[]
  content_categories?: { name: string } | null
}


// ─── Community events ("הקהילה של מימו") ─────────────────────────────────────
// Free/paid monthly community events with capacity + one-tap in-app
// registration. price=0 means a free event; price>0 requires
// payment_link at the app layer ("דמי רצינות" against no-shows).

export type CommunityEvent = {
  id: string
  title: string
  emoji: string | null
  event_type: string | null
  description: string | null
  event_date: string        // YYYY-MM-DD
  start_time: string | null // HH:MM:SS
  end_time: string | null
  location: string | null
  location_link: string | null
  capacity: number | null   // null = unlimited
  price: number
  payment_link: string | null
  vendor_id: string | null
  vendor_name: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// Row shape returned by the get_community_events RPC — event fields plus
// the live registration count and the calling user's own status.
export type CommunityEventRow = {
  id: string
  title: string
  emoji: string | null
  event_type: string | null
  description: string | null
  event_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  location_link: string | null
  capacity: number | null
  price: number
  payment_link: string | null
  vendor_name: string | null
  image_url: string | null
  /** Seats taken, not rows: a mother bringing someone counts twice. */
  registered_count: number
  my_status: 'registered' | 'cancelled' | 'attended' | 'no_show' | null
  /** Names the calling user is bringing with her. */
  my_guests: string[] | null
}

// Row shape of the get_my_waitlists RPC — the calling user's place in
// line for upcoming full events (simple waitlist, no auto-cascade yet).
export type MyWaitlist = {
  event_id: string
  my_position: number
  waiting_count: number
}

export type EventRegistration = {
  id: string
  event_id: string
  user_id: string
  status: 'registered' | 'cancelled' | 'attended' | 'no_show'
  paid: boolean
  created_at: string
  updated_at: string
}

// Row shape of the get_event_attendees RPC — mirrors what the
// community_profiles view exposes so moms can open each other's
// profile from an event (direct WhatsApp gated on community_consent).
export type EventAttendee = {
  user_id: string
  mother_name: string | null
  area: string | null
  phone_number: string | null
  community_consent: boolean | null
  community_bio: string | null
  community_tags: string[] | null
  child_dob: string | null
  child_gender: 'boy' | 'girl' | 'other' | null
  /** People this attendee is bringing. They have no profile of their own. */
  guest_names: string[] | null
}
