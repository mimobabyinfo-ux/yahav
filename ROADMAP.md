# Mimo App — Roadmap

---

## Week 1 — April 19, 2026 · 🔄 In Progress

### ✅ Timed Workshop Access
- Replaced `is_pro` boolean with date-based access from `purchased_workshops`
- Added `access_start_date` / `access_end_date` columns
- `hasActiveWorkshopAccess` computed in AuthContext: true if today is within the access window
- Once `access_end_date` passes, user automatically loses video access ("locked" state shown)

### ✅ Admin — Assign Workshop Access
- New **🎓 הקצה גישה לסדנה** button on each user row in Users tab
- Modal: select workshop, set start date + end date → upserts `purchased_workshops`
- User gets instant access in the app upon save

### ✅ Videos — Locked State
- Clear locked screen when user has no active access
- Message: "הגישה לסרטונים ניתנת לאחר רכישת סדנה פעילה"
- No upgrade CTA — instructs user to contact Brenda directly

### ✅ Home Screen — Access Badge
- When user has active access: gold banner showing "⭐ גישה לסדנה פתוחה עד [DATE]"
- הטבות moved from quick-access grid to 🎁 icon in the top-right header

### ✅ Form Builder Improvements
- New field types: 📋 Info block (display-only text), 🔗 Link button (payment)
- Reorder fields with ▲ ▼ buttons
- Edit existing forms inline (✏️ button)
- Forms grouped by folders (📁) in admin

### ✅ Form Submissions
- Fixed anonymous submissions (public forms no longer require login)
- Delete individual submissions from admin
- Forms grouped by folder for cleaner navigation

---

## Week 2 — April 26, 2026 · 📋 Planned

### Push Notifications
- Browser/PWA push notifications for:
  - Feeding reminders (already partially implemented via setTimeout)
  - Custom reminders (water, vitamins, exercise)
- Service Worker integration for background notifications

### Analytics Dashboard Improvements
- Show active workshop access count per workshop title
- Expiry alerts: users whose access expires in the next 7 days
- Conversion funnel: lead → active_workshop → post_service

### Community Improvements
- Allow mothers to post text updates / questions
- Like / react to community posts
- Filter by topic (feeding, sleep, development, etc.)

---

## Week 3 — May 3, 2026 · 📋 Planned

### Multi-Workshop Access
- Users can have access to multiple workshops simultaneously
- ProAreaPage filters videos by category matching the user's active workshops
- Badge on home screen shows all active workshops

### Baby Development Milestones
- Pre-seeded developmental milestones by age range
- User can mark milestones as reached
- Visual timeline of reached milestones

### Pregnancy — Birth Prep Module
- Hospital bag checklist
- Birth plan template
- Emergency contacts card

---

## Backlog · 💡 Ideas

- [ ] Dark mode
- [ ] Export journal to PDF
- [ ] Multi-language support (Arabic)
- [ ] Pediatrician appointment tracker
- [ ] Growth chart (weight/height over time)
- [ ] Sleep regression alerts by age
- [ ] Partner (dad) dedicated view
- [ ] In-app chat with Brenda (admin-to-user messaging)
- [ ] Referral program (invite a friend → get bonus)

---

## Technical Debt

- [ ] Replace `is_pro` flag entirely with computed `hasActiveWorkshopAccess`
- [ ] Migrate RLS policies to use database roles instead of `is_admin` column checks
- [ ] Add Supabase Edge Functions for scheduled access expiry notifications
- [ ] Unit tests for AuthContext access computation
