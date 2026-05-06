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
- Any feature that competes with the owner's WhatsApp-based guidance — WhatsApp is the support channel, not the app

## Future Ideas
Feature ideas that are NOT being built now are tracked in `IDEAS.md` at the repo root. Do not implement features from that file without explicit approval — the file exists specifically to keep them OUT of the active codebase until the app launches and validates demand.

## How to Work With Me

- Before starting any feature, give me a 3-5 bullet plan of what you'll build and why
- Check existing tables/components before proposing new ones — we have 25+ tables and a lot of existing infrastructure
- If a request could be solved by modifying existing code instead of adding new code, prefer that
- After each feature, give me a short changelog
- If something contradicts this brief, flag it — don't silently do it your way

## Quality Gate Before Declaring Features Complete

Before saying "feature is ready" or "all tasks done":

1. **Run `npm run build` locally.** Not `npm run dev`. The production build catches TypeScript errors that dev mode hides.
2. **Test in a real browser.** Open the deployed/local URL, click every new button, fill every new form, navigate every new flow. "I wrote the code" is not "I tested it."
3. **For features with admin + user sides:** test both sides end-to-end with separate browser windows or incognito mode.
4. **Report what you actually tested.** Instead of "feature complete," say "I built X. I tested Y, Z, W. I did not test [list]."

If you skip these steps, expect the user to find the bug you would have found in 30 seconds.

### Build success ≠ runtime success

A clean `npm run build` only proves the code **compiles**. It does NOT prove the page **renders**. TypeScript and the bundler do not run your component, do not exercise React render, do not call `Date.toISOString()` on an actual value. A page can build successfully and crash with a white screen on first paint.

For any feature that affects user-facing pages, you must:
1. Open the actual page in a browser (incognito/hard-refresh to bypass PWA cache),
2. Observe it render successfully,
3. Click through every relevant flow (including edge cases: empty data, missing fields, brand-new user, no entries yet),

before claiming the feature is complete. If you cannot do this from your environment, say so explicitly — do NOT claim "tested" when only the build was checked.

---

# Mimo App — Full Product Brief
*Last updated: April 2026*

---

## What Is Mimo?

Mimo is a Hebrew-language mobile-first web app (PWA) for pregnant women and new mothers in Israel. It combines a baby tracking journal, curated workshops, a product store, community, and a services directory — all in one place. The app is operated by a business owner who personally guides users through workshops via WhatsApp.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (RTL, dir="rtl") |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage (images bucket) |
| PWA | vite-plugin-pwa + Workbox |
| Analytics | Custom `useTracker` hook → `user_activities` table |
| Fonts | Nunito (Google Fonts) |

The app runs at a fixed 480px max-width on mobile, full-width on desktop (admin mode only).

---

## Owner / Business Settings

All owner-specific strings are stored in `global_settings` and editable from Admin → הגדרות:

| Key | Default | Where used |
|---|---|---|
| `owner_name` | ברנדה | WhatsApp CTAs ("שאלי את X") throughout the app |
| `owner_whatsapp` | 972527506227 | All WhatsApp links (ProAreaPage, WorkshopsPage, PublicPartnerPage) |
| `app_subtitle` | מרכז התפתחות לתינוקות | Tagline below logo on login screen |

These are read via the `useOwnerSettings` hook (`src/hooks/useOwnerSettings.ts`).
**Never hardcode the owner's name or phone number.** Always use the hook or query `global_settings` directly.

> **DB note:** `global_settings` requires a UNIQUE constraint on `setting_key` for upserts to work correctly. If settings don't save, check for duplicate rows. The login page reads `app_subtitle` with `.limit(1)` (not `.single()`) to handle this gracefully.

---

## User Types

| Type | Description |
|---|---|
| **Pregnant** (`user_mode: 'pregnant'`) | Gets pregnancy dashboard, checklist, weekly guide. No journal tab until baby is born. |
| **Mom** (`user_mode: 'mom'`) | Gets baby tracking dashboard |
| **Admin** (`is_admin: true`) | Full admin panel on desktop |
| **Guest** | Joins via family invite link, sees journal only |

---

## Pages & Navigation

Bottom nav (mobile) — 5 tabs:

| Tab | Mom | Pregnant |
|---|---|---|
| 1 | בית (Dashboard) | בית (Pregnancy Dashboard) |
| 2 | יומן (Journal) | *(no journal tab — pregnant users don't see it)* |
| 3 | סדנאות (ProAreaPage) | סדנאות |
| 4 | קהילה | קהילה |
| 5 | מוצרים (WorkshopsPage) | מוצרים |

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

## Digital Workshops / "My Workshops" (`ProAreaPage`)

**Accessed via "סדנאות" tab.** Access controlled via `purchased_workshops` table (start/end date).

Workshops that appear here: `workshops` records where `workshop_type IS NULL` (digital-only) OR any workshop the user has purchased access to.

Features:
- Workshop folder list (card with image, title, access expiry)
- Retention reminder banner: shown 7+ days after access assigned (dismissible per day via localStorage)
- Per-workshop content view:
  - **Videos** — inline player (`<video>`)
  - **Homework** — checklist with progress bar, persisted in `user_homework_progress`
  - **PDFs** — link-out
  - Workshop summary / key takeaways block
  - "שאלי את [owner]" WhatsApp button (pre-filled with user + workshop name)
  - "לסדנה הבאה" CTA — opens an in-app info modal (NOT a direct link). Modal shows: image, title, price, description (whitespace-pre-line), content counts, two buttons: "להרשמה ותשלום" (payment_link) + "יש לי שאלה" (WA). Analytics: `next_workshop_modal_open`, `next_workshop_payment_click`, `next_workshop_question_click`.
- Admin sees all active workshops without access gates

### Workshop series linking
`workshops.next_workshop_id` — nullable FK to another workshop. Set in admin to link a "next workshop" CTA inside the digital workshop view.

---

## Product Store (`WorkshopsPage`)

**Accessed via "מוצרים" tab.** Shows in-person workshops and physical products for prospective customers.

**Which workshops appear here:** only `workshops` records where `workshop_type IS NOT NULL` (i.e., has a category set).

- Category filter chips are **dynamic** — only categories with at least one active product appear
- Valid categories: `הריון` / `תינוקות` / `אימהות`
- Each card: image, title, description, price, "רכישה" (payment_link) + "וואטסאפ" buttons
- "הרכישות שלי" tab shows the user's `purchased_workshops`

### How to control what appears in the store (Admin)
In Admin → סדנאות / מוצרים → edit a workshop:
- **Set a category** (הריון/תינוקות/אימהות) → workshop appears in the מוצרים store
- **No category** → workshop is digital only, appears in "סדנאות" (ProAreaPage) for registered users
- To remove a category chip from the store: unset the category from all workshops in that category

---

## Benefits / Perks (`BenefitsPage`)

Partner perks for users:
- Grid of partner cards (`partner_perks` table)
- Each perk: logo, name, description, discount code (copy), action link
- Analytics tracked: view / copy_code / visit_link → `perk_analytics` table
- Featured perks shown first

---

## Services Marketplace (`ServicesMarketplacePage`)

Browse service partners (doulas, lactation consultants, etc.):
- Filter by pregnancy / motherhood category
- WhatsApp or callback CTA per partner
- Leads saved to `partner_leads` table

> **Note:** Marketplace is currently hidden from nav. Accessible programmatically.

---

## Community (`CommunityPage`)

User community features (available to both moms and pregnant users):
- Community bio / profile opt-in
- Community feed / posts

---

## Admin Panel (`AdminPage`)

Desktop-first layout: sidebar + main content area. Mobile: bottom nav with top 5 sections.

### Admin Sections

| Tab | What it manages |
|---|---|
| **BI & Analytics** | Event counts, DAU, user counts, top events |
| **Users** | User table with search, edit, lead status, assign workshop access |
| **סדנאות / מוצרים** | CRUD workshops + content manager. Category field controls store vs digital separation. |
| **Videos** | Standalone video library (categories, tags, thumbnails) |
| **Daily Tips** | CRUD daily tips (`daily_tips` table) |
| **Perks** | CRUD partner perks + analytics view |
| **Forms** | Form builder + submission viewer |
| **Leads & CRM** | Partner leads (WA/callback) + user CRM lead status |
| **Pregnancy** | Weekly guide editor + checklist editor |
| **Services** | Service partner CRUD (`service_partners` table) |
| **Settings** | Owner name, WhatsApp, login tagline (`global_settings`) |

### Workshop Editor Fields (Admin)
title, description, summary, price (₪), payment_link, image_url, video_url, whatsapp_number, **workshop_type** (store category), next_workshop_id (series link)

### Workshop Assignment Flow
1. Admin finds user in Users tab
2. Clicks "הקצה גישה" → modal opens
3. Select workshop + start/end date
4. Save → record created in `purchased_workshops`
5. Green "שלחי הודעת WhatsApp" button appears → pre-filled WA message to user's phone confirming access

---

## Key Database Tables

| Table | Purpose |
|---|---|
| `user_profiles` | Extended user data (name, baby info, mode, lead_status) |
| `children` | Child records per user |
| `families` | Family groups (invite code) |
| `workshops` | Workshop catalog — used by BOTH ProAreaPage and WorkshopsPage |
| `workshop_content` | Content items per workshop (video / homework / pdf) |
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
| `user_activities` | All tracked analytics events |
| `pregnancy_weekly_guides` | Weekly content for pregnant users |
| `pregnancy_checklist_items` | Medical/buying checklist templates |
| `user_pregnancy_items` | Per-user checklist completion |
| `global_settings` | Admin-editable key/value config (owner_name, owner_whatsapp, app_subtitle) |

---

## Onboarding (`OnboardingPage`)

Shown after first login (no profile yet). Collects:
- שם פרטי + שם משפחה (combined into `mother_name`)
- עיר — searchable combobox (not a plain select). Type to filter. `area` field.
- טלפון — required
- Community consent checkbox (show phone to other moms)
- Mode: pregnant or mom
- If pregnant: due date (required, `dir="ltr"` input)
- If mom: baby name, DOB (`dir="ltr"` input), gender (girl/boy only — no "other")

---

## Login (`LoginPage`)

- Reads `app_subtitle` from `global_settings` for the tagline (fallback: hardcoded default)
- Uses `.limit(1)` not `.single()` when reading settings (handles duplicate rows gracefully)
- "זכרי אותי" checkbox (default: checked). When unchecked: moves Supabase auth token from localStorage to sessionStorage after login so session clears on browser close.
- Google OAuth button present (requires Supabase OAuth config)
- `autocomplete` attributes set for browser password saving

---

## PWA Setup

- Manifest: `name: "Mimo — אמהות בביטחון"`, `short_name: "Mimo"`, standalone mode, RTL
- Service worker: Workbox, autoUpdate
- Caching: CacheFirst for Google Fonts, NetworkFirst for Supabase API
- Icons: `/icons/icon-192.png`, `/icons/icon-512.png`
- `InstallPrompt` component: Android native prompt + iOS Safari instructions
- **Note:** After deploys, users may need hard refresh (Ctrl+Shift+R) to bypass PWA cache

---

## Analytics Events

Tracked via `useTracker` hook → `user_activities` table:

| Event | Trigger |
|---|---|
| `page_view` | Every page navigation |
| `workshop_open` | User opens a workshop folder |
| `video_start` | User plays a video |
| `perk_view` | Perk card viewed |
| `perk_copy_code` | Discount code copied |
| `perk_visit_link` | Action link clicked |
| `next_workshop_modal_open` | "לסדנה הבאה" clicked |
| `next_workshop_payment_click` | Payment link clicked inside modal |
| `next_workshop_question_click` | WhatsApp question link clicked inside modal |

---

## Business Model

- **Workshops / Products**: sold individually via external payment_link, access granted manually by admin
- **Services marketplace**: leads → owner follows up
- **Partner perks**: brand partnerships
- No subscription / PRO tier currently active

---

## What's NOT in the App (intentionally excluded)

- In-app purchases / payment flow (handled externally via payment_link)
- Push notifications (handled via WhatsApp)
- Video hosting (uses direct URL / Supabase storage links)
- Professionals marketplace visible in nav (hidden, accessible programmatically)
- Journal tab for pregnant users (shown only after baby is born / mode switches to mom)

---

## Hidden / Phase 2 Features

Code that's fully built and tested but intentionally not exposed in the UI yet. Activation is a product decision, not an engineering one.

- **`ServicesMarketplacePage`** — service providers marketplace (doulas, lactation consultants, postpartum caregivers). Code ready, intentionally hidden. Activation criteria: 100+ active users on the platform AND 5-10 real service providers recruited and onboarded. To activate: wire a new tab into `BottomNav.tsx` and add the route in `App.tsx`. Header comment in the file documents the same.

---

## Deferred Decisions

### WhatsApp notification on form submission (April 2026)
**Decision:** Not implemented. Using an unread-badge counter in the admin nav instead.

**Why deferred:** There is no existing server-side WhatsApp API integration. Every WhatsApp interaction is a client-side `wa.me/` link. Adding real server-side notifications would require a paid WhatsApp Business API account (Green API ~$5/mo, Twilio, or 360dialog) plus a Supabase Edge Function webhook. At current scale (single owner, low form volume) the badge is sufficient — the owner checks admin regularly.

**When to revisit:** If submission volume grows or the owner starts missing important responses, implement via Supabase Edge Function + Green API. The badge counter (`forms_last_seen` localStorage key + `form_submissions.created_at` query in `App.tsx`) can remain as a fallback.

**Implementation reference:** Badge state lives in `App.tsx` (`unreadForms` state, `clearFormsBadge()`), passed as props to `AdminSidebar` (desktop) and `AdminPage` (mobile). localStorage key: `forms_last_seen`.
