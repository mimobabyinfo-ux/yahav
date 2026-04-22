# Mimo App — Context for Claude Code

## Current Strategic Focus (April 2026)

The app is feature-complete for launch. Current priority is NOT building new features — it's activating existing Mimo workshop customers and learning from real usage.

Before building any new feature, ask: "Does this help get the first 50 active users, or does it help retain existing customers?" If neither, push back.

## What NOT to Build Right Now

- New feature categories not listed in this brief
- Payments / subscriptions / PRO tier (explicitly out of scope)
- Push notifications (using WhatsApp instead)
- Native iOS/Android apps (staying on PWA)
- Professionals marketplace visibility in nav (currently hidden, intentional)
- Any feature that competes with Michal's WhatsApp-based guidance — WhatsApp is the support channel, not the app

## How to Work With Me

- Before starting any feature, give me a 3-5 bullet plan of what you'll build and why
- Check existing tables/components before proposing new ones — we have 25+ tables and a lot of existing infrastructure
- If a request could be solved by modifying existing code instead of adding new code, prefer that
- After each feature, give me a short changelog
- If something contradicts this brief, flag it — don't silently do it your way

---

# Mimo App — Full Product Brief
*Last updated: April 2026*

---

## What Is Mimo?

Mimo is a Hebrew-language mobile-first web app (PWA) for pregnant women and new mothers in Israel. It combines a baby tracking journal, curated workshops, community, and a services directory — all in one place. The app is operated by Michal, who personally guides users through workshops via WhatsApp.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (RTL, dir="rtl") |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (images bucket) |
| PWA | vite-plugin-pwa + Workbox |
| Analytics | Custom `useTracker` hook → `analytics_events` table |
| Fonts | Nunito (Google Fonts) |

The app runs at a fixed 480px max-width on mobile, full-width on desktop (admin mode only).

---

## User Types

| Type | Description |
|---|---|
| **Pregnant** (`user_mode: 'pregnant'`) | Gets pregnancy dashboard, checklist, weekly guide |
| **Mom** (`user_mode: 'mom'`) | Gets baby tracking dashboard |
| **Admin** (`is_admin: true`) | Full admin panel on desktop |
| **Guest** | Joins via family invite link, sees journal only |

---

## Pages & Navigation

Bottom nav (mobile) has 5 tabs:

| Tab | Mom | Pregnant |
|---|---|---|
| 1 | בית (Dashboard) | בית (Pregnancy Dashboard) |
| 2 | יומן (Journal) | יומן |
| 3 | סדנאות | סדנאות |
| 4 | קהילה | קהילה |
| 5 | מוצרים (Workshops/Products) | מוצרים |

### Special URL routes (no login required)
- `?form=<id>` — Public form page
- `?baby=<token>` — Public baby milestone share page
- `?join=<token>` — Guest family join page
- `?partner` — Business partnership pitch page (Hebrew)

---

## Dashboard Pages

### Mom Dashboard (`DashboardPage`)
- Daily tip (rotates from `daily_tips` table)
- Baby age display + feeding interval reminder
- Quick links: Journal, Community, Workshops
- Family invite section (shown to users with children)
- Baby milestone photo cards

### Pregnancy Dashboard (`PregnancyDashboard`)
- Current week + baby size comparison
- Weekly development guide (from `pregnancy_weekly_guides`)
- Medical + buying checklists (per-week, from `pregnancy_checklist_items`)
- Quick links

---

## Journal (`JournalPage`)

Tracks baby daily events:
- **Feeding** (breast/bottle/solid, side, duration, amount)
- **Sleep** (nap/night, duration, quality)
- **Diaper** (wet/dirty/both)
- **Pumping**
- **Milestone**
- **Doctor visit**
- **Notes**

Features:
- Active timer (breast feeding, sleep) — persisted in `active_timers` table
- Day-by-day log view
- Public share page per child via `share_token`
- Photo uploads per entry

---

## Workshops / "My Workshops" (`ProAreaPage`)

Access controlled via `purchased_workshops` table (start/end date).

Features:
- Workshop folder list (card with image, title, access expiry)
- Retention reminder banner: shown 7+ days after access assigned (dismissible per day)
- Per-workshop content view:
  - **Videos** — inline player (`<video>`)
  - **Homework** — checklist with progress bar, persisted in `user_homework_progress`
  - **PDFs** — link-out
  - Workshop summary / key takeaways block
  - "שאלי את מיכל" WhatsApp button (pre-filled with user + workshop name)
  - "הסדנה הבאה" CTA (uses `payment_link` if set, else WA to Michal)
- Admin sees all active workshops without access gates

### Workshop content stored in:
- `workshops` — master list (title, description, summary, image, price, payment_link, video_url)
- `workshop_content` — items per workshop (video / homework / pdf)
- `purchased_workshops` — per-user access with dates

---

## Benefits / Perks (`BenefitsPage`)

Partner perks for users:
- Grid of partner cards (`partner_perks` table)
- Each perk: logo, name, description, discount code (copy), action link
- Analytics tracked: view / copy_code / visit_link → `perk_analytics` table
- Featured perks shown first

---

## Services (`MyServicesPage`)

User's personal services dashboard:
- Partner leads they submitted (WhatsApp / callback requests)
- History of service contacts

---

## Services Marketplace (`ServicesMarketplacePage`)

Browse service partners (doulas, lactation consultants, etc.):
- Filter by pregnancy / motherhood category
- WhatsApp or callback CTA per partner
- Leads saved to `partner_leads` table

> **Note:** Marketplace is currently hidden from nav (replaced with מוצרים/Workshops tab). Accessible programmatically.

---

## Community (`CommunityPage`)

User community features (available to both moms and pregnant users):
- Community bio / profile opt-in
- Community feed / posts

---

## Admin Panel (`AdminPage`)

Desktop-first layout: sidebar + main content area.

### Admin Sections (11 tabs):

| Tab | What it manages |
|---|---|
| **BI & Analytics** | Event counts, DAU, user counts, top events |
| **Users** | User table with search, edit, lead status, assign workshop access |
| **Workshops** | CRUD workshops + content manager per workshop |
| **Videos** | Standalone video library (categories, tags, thumbnails) |
| **Daily Tips** | CRUD daily tips (`daily_tips` table) |
| **Perks** | CRUD partner perks + analytics view |
| **Forms** | Form builder + submission viewer |
| **Leads & CRM** | Partner leads (WA/callback) + user CRM lead status |
| **Pregnancy** | Weekly guide editor + checklist editor |
| **Services** | Service partner CRUD |
| **Settings** | Global settings (`global_settings` table) |

### Workshop Assignment Flow
1. Admin finds user in Users tab
2. Clicks "הקצה גישה" → modal opens
3. Select workshop + start/end date
4. Save → record created in `purchased_workshops`
5. Green "שלחי הודעת WhatsApp" button appears → pre-filled WA message to user's phone number confirming access

---

## Key Database Tables

| Table | Purpose |
|---|---|
| `user_profiles` | Extended user data (name, baby info, mode, lead_status) |
| `children` | Child records per user |
| `families` | Family groups (invite code) |
| `workshops` | Workshop catalog |
| `workshop_content` | Content items per workshop |
| `purchased_workshops` | Per-user workshop access (with dates) |
| `user_homework_progress` | Checklist completion per user per content item |
| `daily_log_entries` | Journal entries |
| `feeding/sleep/diaper_details` | Detail rows per log entry |
| `active_timers` | Live timers (feeding, sleep) |
| `partner_perks` | Benefit partner cards |
| `perk_analytics` | Perk interaction tracking |
| `partner_leads` | WA/callback leads from services marketplace |
| `service_partners` | Service partner catalog |
| `daily_tips` | Rotating tips |
| `forms` | Custom form definitions (JSON fields) |
| `form_submissions` | User form responses |
| `analytics_events` | All tracked events |
| `pregnancy_weekly_guides` | Weekly content for pregnant users |
| `pregnancy_checklist_items` | Medical/buying checklist templates |
| `user_pregnancy_items` | Per-user checklist completion |
| `global_settings` | Admin-editable key/value config |

---

## PWA Setup

- Manifest: `name: "Mimo — אמהות בביטחון"`, `short_name: "Mimo"`, standalone mode, RTL
- Service worker: Workbox, autoUpdate
- Caching: CacheFirst for Google Fonts, NetworkFirst for Supabase API
- Icons: `/icons/icon-192.png`, `/icons/icon-512.png`
- `InstallPrompt` component:
  - Android: `beforeinstallprompt` → native install button
  - iOS: Step-by-step Safari share instructions
  - Dismissible, stored in localStorage

---

## Analytics Events

Tracked via `useTracker` hook → `analytics_events` table:

| Event | Trigger |
|---|---|
| `page_view` | Every page navigation |
| `workshop_open` | User opens a workshop folder |
| `video_start` | User plays a video |
| `perk_view` | Perk card viewed |
| `perk_copy_code` | Discount code copied |
| `perk_visit_link` | Action link clicked |

---

## Business Model

- **Workshops**: sold individually, access granted manually by admin
- **Services marketplace**: leads → Michal's team follows up
- **Partner perks**: brand partnerships
- No subscription / PRO tier currently active

---

## Contact / Support

- Michal's WhatsApp: `972527506227`
- All "ask Michal" WA links pre-fill messages with user name + context

---

## What's NOT in the App (intentionally excluded)

- In-app purchases / payment flow (handled externally via payment_link)
- Push notifications (handled via WhatsApp)
- Video hosting (uses direct URL / Supabase storage links)
- Professionals marketplace visible in nav (hidden, accessible programmatically)
