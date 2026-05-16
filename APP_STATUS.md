# Mimo — App Status Snapshot

*Last updated: 2026-05-21 · verified against `main` at commit `46d29f7`*

This document is a **handoff snapshot** of what's currently in the Mimo app — feature inventory by role, recent launch-prep work, DB tables, and known gaps. Pair it with [`CLAUDE.md`](CLAUDE.md) (project brief + work rules) and [`IDEAS.md`](IDEAS.md) (deferred backlog).

---

## What Mimo is

Hebrew-language mobile-first PWA (RTL) for pregnant women and new mothers in Israel. Combines baby tracking journal, weekly pregnancy guide, digital workshops, product store, services marketplace (hidden), and community. Operated by a single business owner (Brenda) who guides users through WhatsApp.

**Current focus**: pre-launch polish. Aiming for App Store + Google Play submission. Beta-testing with ~5 real moms.

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS, RTL, fixed 480px max-width on mobile |
| DB / Auth | Supabase (PostgreSQL + RLS, email/password + Google OAuth) |
| Storage | Supabase Storage |
| Hosting | Vercel (deploy from `main` → mimo-baby.co.il) |
| PWA | vite-plugin-pwa + Workbox |

---

## Launch-prep work shipped recently (commit highlights)

These were tackled in priority order; all live in production after manual Supabase migration runs:

**Pregnancy domain (April-May 2026):**
- 🆕 **Weekly guide v2** ([`8ff075b`](#)) — rewrote all 42 weeks of content (was 18 even-week stubs), added `fun_fact` column with amber-tinted UI section. Migration: `20260516120000_pregnancy_weekly_guide_v2.sql`.
- 🆕 **Reminder templates** ([`b4e3c9a`](#)) — 8 pre-defined templates (חומצה פולית, NIPT, GTT, GBS, etc.) with smart week filtering + strict-label dedup. Horizontal-scroll row above the free-text add. Data in `src/data/pregnancyReminderTemplates.ts`, no schema change.
- 🆕 **Items on week cards** ([`9575df4`](#), fixed in [`b7fdea6`](#)) — user_pregnancy_items now render on each WeekGuideCard within `week_from..week_to` range. Blue-tinted "📝 המשימות שלך לשבוע הזה" section.
- 🆕 **Buying list categorization** ([`25215d2`](#)) — split flat buying list into 7 collapsible subcategories (ריהוט/בטיחות/האכלה/היגיינה/ביגוד/אבזרים/שונות) with per-group progress. Migration: `20260520120000_pregnancy_buying_subcategory.sql`. Backfilled 16 seed rows.
- 🐛 **Pregnant UX fixes** ([`0bf00e1`](#), [`5fb629d`](#), [`df2be96`](#)) — welcome text generic, week-guide deduplication, due_date editor in UserSettingsPage, settings entry point on PregnancyDashboard, child editing.

**Mom / Journal domain:**
- 🆕 **Quick-add bar redesign** ([`f8d6458`](#), [`b85f77f`](#), [`f3d3702`](#)) — replaced "next feeding prediction" with "time since last action" (per beta tester Roni's feedback). 2x2 grid on Dashboard + JournalPage.
- 🆕 **Feeding type picker** ([`0b76260`](#), [`95158a9`](#)) — tap 🍼 → bottom-sheet with הנקה/בקבוק/מוצק. Bottle → modal with amount; solid → "מה התינוק אכל?" textarea.
- 🆕 **Timer/manual choice** ([`95158a9`](#)) — eliminates accidental timer starts. Tap sleep/tummy → 2-option sheet: "התחילי טיימר" (now) vs "רישום ידני" (already happened).
- 🆕 **Past-date logging** ([`0b76260`](#)) — quick-add bar visible on past-date journal views; all actions route to modal with `selectedDate`.
- 🆕 **Timeline filter** ([`07bb463`](#)) — 5 filter tabs above the daily timeline (הכל / האכלה / שינה / חיתול / בטן).
- 🆕 **Visual feeding differentiation** ([`4d77320`](#)) — breast/bottle/solid get distinct icons (🤱/🍼/🥄) and color palettes (teal/blue/yellow) in the timeline.
- 🆕 **Sleep start/end times** ([`88d777c`](#)) — manual sleep entry takes start + end times, computes duration. Past-midnight wrap handled.
- 🆕 **Visible legend** ([`88d777c`](#), [`23008c8`](#)) — week/month view swatches use saturated `dot` color, not pale `bg`.

**Cross-cutting:**
- 🐛 **Family details RLS fix** (`20260506000000_fix_details_family_rls.sql`) — feeding/sleep/diaper details now visible to family members via PostgREST embeds (previous policies were self-only).

---

## Feature inventory by role

### 👤 Pregnant user (`user_mode='pregnant'`)
| Feature | Status |
|---|---|
| Pregnancy dashboard with week-by-week guide (42 weeks, all populated) | ✅ |
| Medical checklist + buying list (subcategorized + collapsible) | ✅ |
| Personal items (medical/buying) with week range placement | ✅ |
| Items render contextually on their week's guide card | ✅ |
| Reminder templates (smart week filtering) | ✅ |
| Free-text custom reminders | ✅ |
| Built-in reminders: vitamins / water / exercise | ✅ |
| Settings page: edit due date, view personal info | ✅ |
| Pregnancy → mom mode graduation ("התינוק נולד!") | ✅ |
| Workshops / Community / Store / Perks | ✅ shared with mom |

### 👶 Mom user (`user_mode='mom'`)
| Feature | Status |
|---|---|
| Home dashboard: greeting, child switcher, daily tip, perks, family invite | ✅ |
| Quick-add bar (2x2: feeding/sleep/diaper/tummy_time) with "time since" | ✅ |
| Feeding type picker (breast/bottle/solid) | ✅ |
| Timer/manual choice for sleep + tummy_time | ✅ |
| Journal with daily timeline (filterable), week view, month view | ✅ |
| Active timer cards (start/stop, breast side switch) | ✅ |
| LogEntryModal — 7 entry types, photo upload for diaper + milestone | ✅ |
| Past-date entries from quick-add bar | ✅ |
| Family invite (shareable WhatsApp link, anonymous guest access) | ✅ |
| Workshops / Community / Store / Perks | ✅ |
| Settings: edit children (name/DOB/gender), view personal info | ✅ |

### 🔧 Admin (`is_admin=true`)
Auto-lands on AdminPage. Desktop: sidebar; mobile: 5-tab bottom nav. **12 sections, all functional**:

BI/Analytics · Users (search, lead_status, assign workshop access) · Workshops & Products (CRUD + content + drag-drop ordering) · Videos · Daily Tips · Perks (CRUD + analytics) · Forms (builder + submissions, CSV export, unread badge) · Leads & CRM (partner leads + user CRM) · **Pregnancy** (weekly guide editor with fun_fact field + medical/buying checklist editor with subcategory) · Services Partners · Settings (owner_name, owner_whatsapp, app_subtitle, thank-you page) · Registrations (registration_leads viewer with unread badge).

### 🌐 Public / no-login routes
| Route | Purpose |
|---|---|
| `?form=<id>` | Public form (7 field types, validated, saved to `form_submissions`) |
| `?baby=<token>` | Public baby milestone share page |
| `?join=<token>` | Family invite redemption → anonymous Supabase auth + child-level access |
| `?partner` | B2B partner pitch landing page |
| `?register=<workshop_id>` | Workshop registration form → `registration_leads` |
| `?thanks` | Thank-you page with configurable content + social links |
| `?settings` | UserSettingsPage (logged-in only — covers both mom + pregnancy) |

---

## Database schema (high-level)

**User / family**: `user_profiles`, `children`, `families`, `family_invite_tokens`
**Tracking**: `daily_log_entries` + `feeding_details` / `sleep_details` / `diaper_details`, `active_timers`
**Pregnancy**: `pregnancy_weekly_guide` (admin master, 42 rows incl. fun_fact), `pregnancy_checklist_items` (admin master, medical+buying with subcategory), `user_pregnancy_items` (per-user, with subcategory), `user_reminders`
**Workshops**: `workshops`, `workshop_content`, `purchased_workshops`, `user_homework_progress`
**Perks/services**: `partner_perks`, `perk_analytics`, `service_partners`, `partner_leads`
**Forms**: `forms`, `form_submissions`, `form_assignments`
**Misc**: `daily_tips`, `user_activities` (analytics), `global_settings`, `registration_leads`, `community_profiles`

**Family-aware RLS** on `daily_log_entries` + the 3 detail tables — family members see each other's journal entries with full detail.

---

## Hidden / Phase 2 features

- **`ServicesMarketplacePage`** — service providers marketplace (doulas, lactation consultants). Fully built; intentionally hidden from nav until 100+ active users + 5-10 recruited providers. To activate: wire into `BottomNav.tsx` + add route. See header comment in file.

## Deferred / known gaps

(Tracked in `IDEAS.md` — don't build without explicit approval.)

- **OAuth branding** — Google sign-in screen shows raw Supabase URL. Fix needs either Supabase Pro custom domain (~$25/mo) or Google OAuth Verification (1-3 weeks). Target: Week 3.
- **Additional pregnancy profile fields** (parity, multiples, high-risk flags) — would need schema migration.
- **Edit personal info** (mother_name / phone / area) — currently read-only in settings. Children are editable.
- **Feeding interval prediction** — removed per Roni's feedback. May come back as opt-in advanced view if requested.
- **Edit subcategory on existing personal buying items** — admin form has dropdown but per-user edit form doesn't yet. Beta testers' legacy items default to "📋 שונות".
- **App-store readiness blocker**: payment_link buttons inside the app may conflict with Apple IAP rule 3.1.1 (digital content). Strategy decision pending — likely "remove buy buttons inside the wrapped app, keep WhatsApp inquiry only" path.

## Out of scope (intentional)

- In-app purchases (handled externally via payment_link)
- Push notifications (handled via WhatsApp)
- Video hosting (uses direct URL / Supabase storage links)
- Native iOS/Android (staying on PWA until app-store strategy decided)

---

## Deploy state

- **Active branches**: `main` (= production source for Vercel) and `claude/setup-new-app-dn1fD` (active dev branch). Both in sync via fast-forward merges.
- **Latest deploys**: every merge to `main` triggers Vercel auto-deploy. Custom domain: mimo-baby.co.il.
- **PWA cache caveat**: users may need hard refresh (Ctrl+Shift+R) after deploys to bypass service-worker cache.
- **Migrations**: applied manually via Supabase Dashboard SQL Editor — NOT auto-run on deploy. Always verify migration applied before merging dependent code to `main`.

---

## How to pick this up

1. Read `CLAUDE.md` first — it has the strategic focus, work rules ("show plan first, run build before claiming done"), and explicit "what NOT to build right now" list.
2. Skim `IDEAS.md` — backlog of deferred features.
3. Use this file (`APP_STATUS.md`) for the current feature inventory.
4. `git log --oneline -30` to see the trajectory of recent changes.

For the next conversation, recommended openers:
- "Continue from where we left off — what's the next priority before launch?"
- Or pick a specific item from the deferred list and ask: "Let's tackle X."
