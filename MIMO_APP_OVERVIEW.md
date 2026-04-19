# Mimo App — Full Feature Overview

> Hebrew RTL baby & pregnancy tracking app · React 18 + TypeScript + Supabase + Vercel

---

## User Modes

The app has two distinct experiences based on the user's mode:

| Mode | Who | Home screen |
|------|-----|-------------|
| **Mom mode** | Users with a baby | Dashboard with feeding timer, daily tips, quick actions |
| **Pregnancy mode** | Pregnant users | Pregnancy tracker with week guide, medical/buying checklist, reminders |

---

## Pages

### DashboardPage (בית)
- Baby age display
- Feeding countdown timer (calculates next feeding based on interval — 2–4 hours, stored in localStorage)
- Rotating daily tips
- Featured partner perks carousel
- Family invite button (share journal link)
- Quick action buttons → opens LogEntryModal

### PregnancyDashboard (מעקב — pregnant users)
- Current pregnancy week + baby size/development guide (from `pregnancy_weekly_guide` table)
- Medical checklist grouped by week (items from `pregnancy_checklist_items`)
- Buying checklist grouped by week
- Personal item addition (add your own checklist items)
- Inline edit for personal items
- Trash icon to hide any item (stored in `hidden_pregnancy_items` jsonb per user)
- Progress bar (% completed)
- Custom reminders panel (water, vitamins, exercise + custom) using `user_reminders` table
- Full CRUD for reminders

### JournalPage (יומן)
- Horizontal calendar (navigate by day)
- Activity log timeline (color-coded by type)
- Entry types: Feeding, Sleep, Diaper, Tummy Time, Milestone, Doctor Visit, Note
- Running timers (feeding/sleep/tummy time) with auto-log on stop
- Daily summary stats (total feedings, sleep minutes, diapers)
- Multi-child switcher (family members)
- On feeding save: calculates next feeding time, stores in localStorage, schedules browser notification

### ProAreaPage (סרטונים)
- Pro-only educational video library
- Category filtering
- Video completion tracking
- Homework tasks per video
- Form trigger: auto-shows survey after N video views

### WorkshopsPage (מוצרים)
- Products/workshops with price, description, image
- Payment link + optional WhatsApp contact per product
- Modal with full product details

### CommunityPage (קהילה)
- **Mom mode**: Filter by baby age ±1 month or by area
- **Pregnancy mode**: Filter by pregnancy week ±2 or by area
- Edit your own community profile (bio, phone, area)
- Toggle privacy consent
- Contact other moms via WhatsApp

### ServicesMarketplacePage (שירותים)
- Two categories: 🤰 Pregnancy / 🌸 Motherhood
- Partners grouped by subcategory (doula, pelvic floor, lactation, etc.)
- WhatsApp button → logs lead → opens WA with pre-filled message
- "Request callback" inline form → logs lead
- All leads saved to `partner_leads` table

### BenefitsPage (הטבות)
- Partner perks & discount codes
- Search bar
- View/copy code/visit link all tracked in `perk_analytics`

### MyServicesPage (שירותים)
- Family management: create family, join with invite code
- Family invite link generation (passwordless guest access)
- List of purchased workshops

### ContactPage (צור קשר)
- WhatsApp, Email, Instagram links
- FAQ section

### PublicFormPage (?form=ID)
- Publicly accessible dynamic forms
- Field types: text, textarea, select (pill buttons), rating (1–5)
- Required field validation
- Submits to `form_submissions` (anonymous — no login required)
- Thank-you screen after submission

### PublicBabyPage (?baby=TOKEN)
- Shareable read-only view of a baby's recent journal entries
- No login required

### GuestJoinPage (?join=TOKEN)
- Passwordless family invite redemption
- Grants read-only journal access without creating an account

---

## Navigation (BottomNav)

### Regular user (5 tabs)
בית → סרטונים → מוצרים → קהילה → שירותים

### Pregnant user (same 5 tabs, "בית" becomes "מעקב")

### Admin (3 tabs in bottom nav)
דשבורד → ניהול → טפסים
(+ "View as User" toggle)

### Guest (2 tabs)
יומן → בית

---

## Admin Panel

Access: users with `is_admin = true` are auto-redirected to admin on login.

The admin panel has 12 internal sub-tabs:

### Insights (דשבורד)
- User cohort retention (Day 1, 3, 7)
- Video performance (views + completions)
- Event activity timeline
- Lead status breakdown

### Users (משתמשים)
- Search by name/email
- View: email, mother name, baby name, pro status, lead status
- Edit: staff notes, lead status (new_lead → active_workshop → post_service)
- Promote to pro, set admin

### Tips (טיפים)
- CRUD for daily rotating tips shown on dashboard

### Videos (סרטונים)
- CRUD: title, description, duration, category, tags
- Homework tasks per video
- Display order

### Products (מוצרים)
- CRUD workshops: title, price, image, payment link, stock
- Per-product WhatsApp override

### Perks (הטבות)
- CRUD partner_perks: name, logo, code, description
- Toggle featured (show in dashboard carousel)
- View analytics per perk (views, copies, clicks)

### Categories (קטגוריות)
- CRUD content_categories for videos & workshops
- Icon, color, type (video | workshop | both)

### Pregnancy (הריון)
- **Weekly Guide**: edit symptoms/size/development for all 42 weeks
- **Checklist Items**: medical & buying, with week ranges
- **Reminders**: per-user reminders management

### Services (שירותים)
- CRUD service_partners (pregnancy/motherhood categories)
- WhatsApp number, logo, subcategory
- View partner_leads (who clicked / requested callback)

### Leads (לידים)
- View all partner_leads with user contact info
- Filter by action type (whatsapp | callback)

### Forms (טפסים)
- **Create** forms with dynamic fields
- **Edit** existing forms (✏️ button on each row)
- Field types: text, textarea, select (comma-separated options), rating 1–5
- Required/optional per field
- Trigger rules: after N video views / after N days
- View live submissions per form
- Copy public link (?form=ID)
- Assign forms to specific users

### Settings (הגדרות)
- Edit global_settings table (key-value config)

---

## Seeded Forms

| ID | Title | Fields |
|----|-------|--------|
| `...000001` | טופס הרשמה | שם, טלפון, מייל, סדנה, אישור תשלום |
| `...000002` | מתנת לידה MIMO | פרטי שולח + פרטי יולדת (7 שדות) |
| `...000003` | ליווי אחרי לידה | שאלון מעקב מלא — 49 שדות (פרטי אם, אב, תינוק, לידה, התפתחות, שינה, תחושות, בריאות, הצהרות) |
| `...000004` | שאלון התפתחות | זהה לטופס ליווי אחרי לידה — 49 שדות |

Public links: `https://[your-domain]/?form=[ID]`

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `user_profiles` | Extended user info: name, baby, mode, area, phone, admin flag |
| `children` | Multi-child support with share tokens |
| `families` | Multi-parent sync with invite codes |
| `family_invite_tokens` | Passwordless guest invite tokens (30-day expiry) |
| `daily_log_entries` | All journal entries (feeding/sleep/diaper/etc.) |
| `feeding_details` | Feeding specifics (type, breast side, duration, amount) |
| `sleep_details` | Sleep specifics (type, duration, quality) |
| `diaper_details` | Diaper specifics (type) |
| `active_timers` | Running stopwatches (in-progress activities) |
| `videos` | Pro video content |
| `homework_tasks` | Per-video homework tasks |
| `user_video_progress` | Video completion tracking |
| `workshops` | Products/courses with pricing |
| `purchased_workshops` | User purchase records |
| `content_categories` | Video/workshop categories |
| `daily_tips` | Rotating home screen tips |
| `partner_perks` | Discount codes and partner benefits |
| `perk_analytics` | View/click/copy events per perk |
| `service_partners` | Pregnancy/motherhood service providers |
| `partner_leads` | WhatsApp clicks + callback form submissions |
| `user_activities` | Full event tracking (page views, clicks, videos) |
| `global_settings` | Admin key-value configuration |
| `pregnancy_checklist_items` | Admin-managed checklist (medical + buying) |
| `user_pregnancy_items` | Personal checklist items added by user |
| `pregnancy_task_completions` | Which checklist items user has completed |
| `pregnancy_weekly_guide` | Week-by-week content (weeks 1–42) |
| `user_reminders` | Custom reminders per user (CRUD) |
| `forms` | Dynamic form templates (fields_json) |
| `form_submissions` | Form responses (anonymous allowed) |
| `form_assignments` | Admin assigns specific forms to specific users |

### Views
| View | Purpose |
|------|---------|
| `community_profiles` | Mom-mode community (denormalized, bypasses RLS) |
| `community_pregnant_profiles` | Pregnancy-mode community (no children join) |

---

## Special Features

### Feeding Timer & Notifications
- Log a feeding → calculates next feeding time based on interval (2–4 hours)
- Stores `next_feeding_time` in localStorage
- Requests browser notification permission
- Schedules a browser push notification at the next feeding time
- Dashboard shows countdown to next feeding

### Family Sharing
- Create a family → get 8-character invite code
- Other parent joins with code → shares same journal
- Generate passwordless guest link (for grandparents) → read-only access

### Smart Pregnancy Checklist
- Items sourced from admin-managed `pregnancy_checklist_items`
- Grouped by week range
- User can complete, add personal items, edit personal items, or hide any item
- Hidden items stored in `hidden_pregnancy_items` jsonb (per user, non-destructive)
- Progress bar reflects only visible items

### Form Triggers
- Forms can auto-appear after N video views or N days since signup
- One-time per user (checks `form_submissions`)
- Admin can also manually assign forms to specific users

### Analytics
- Every page view, button click, video start/end, coupon copy tracked
- Session ID per browser tab
- Feeds admin Insights tab (retention, video stats, activity timeline)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS (Sand/Mustard beige theme) |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL + Auth) |
| Auth | Email/password + Google OAuth |
| Build | Vite |
| Deployment | Vercel |
| Direction | RTL (Hebrew) |

---

## Color Theme

- **Primary gradient**: `#D4AA52 → #C49438` (Mustard gold)
- **Background gradient**: `#F7F3EC → #F2EBE0` (Warm beige)
- **Sand palette**: Used for text, borders, muted elements
- **Entry type colors**: Feeding=Blue, Sleep=Red, Diaper=Green, Tummy=Orange, Milestone=Amber, Doctor=Teal, Note=Gray
