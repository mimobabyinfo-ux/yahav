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
  phone_number: string | null
  community_consent: boolean
  community_bio: string | null
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
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
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
  entry_date: string
  entry_time: string
  entry_type: 'feeding' | 'sleep' | 'diaper' | 'pumping' | 'milestone' | 'doctor_visit' | 'note'
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
  diaper_type: 'wet' | 'dirty' | 'both' | null
  notes: string | null
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
  image_url: string | null
  is_active: boolean
  created_at: string
}

export type UserPregnancyItem = {
  id: string
  user_id: string
  category: 'medical' | 'buying'
  text: string
  week_from: number | null
  week_to: number | null
  is_completed: boolean
  created_at: string
}

export type PregnancyChecklistItem = {
  id: string
  category: 'medical' | 'buying'
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
  category: 'pregnancy' | 'motherhood'
  subcategory: string | null
  whatsapp_number: string | null
  logo_url: string | null
  display_order: number
  is_active: boolean
  created_at: string
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
