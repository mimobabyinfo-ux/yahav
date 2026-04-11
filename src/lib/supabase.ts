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
  created_at: string
  updated_at: string
}

export type Child = {
  id: string
  user_id: string
  name: string
  dob: string | null
  gender: 'boy' | 'girl' | 'other' | null
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
  workshop_type: string | null
  image_url: string | null
  video_url: string | null
  category_id: string | null
  tags: string[] | null
  price: number | null
  currency: string | null
  payment_link: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
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
