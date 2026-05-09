# Mimo — Future Feature Ideas

This file tracks feature ideas that are NOT being built now but should be considered for future versions (Phase 2+, post-launch).

**Rule:** Nothing here gets built until the app is live in stores AND has 100+ active users AND we've validated the idea with real user feedback.

---

## Solid Foods / Baby-Led Weaning Screen

**Status:** Phase 2 candidate
**Source:** Mom in Brenda's community who uses Solid Starts app
**Inspiration:** [Solid Starts](https://solidstarts.com/) — 4M+ parents, food database for babies

### The idea
A dedicated screen for introducing solid foods to babies (6+ months). Hebrew-first, tailored to Israeli kitchens.

### Why this is interesting
- Natural extension of the journal (transition from milk to solids)
- High user engagement potential (parents check daily)
- Possible premium feature (revenue opportunity)
- Aligns with Mimo's "trusted companion" positioning

### Why we're NOT building it now
- Significant scope: needs 50-100 foods minimum, each with prep instructions, choking risk, allergen info
- Requires medical review (pediatrician or nutritionist signoff)
- Estimated 3-6 weeks of dedicated work
- Would delay store launch by 6+ weeks
- Unknown if users actually want this in Mimo (vs using a separate app)

### Validation needed before building
- Beta feedback: "did you feel something was missing for solid foods stage?"
- User survey post-launch: would you pay for this feature?
- Check overlap: how many users have babies 6+ months (the target audience)?

### Minimum viable version (if we eventually build it)
- Start with 10-15 common Israeli baby foods (avocado, banana, hummus, tahini, eggplant, cooked carrot, etc.)
- Don't try to compete with Solid Starts on breadth
- Compete on Hebrew + Israeli context + integration with the journal

---

## Add new ideas below this line
<!-- Format: ## Idea name, then Status / Source / Description / Why now / Why not now / Validation -->

---

## Additional pregnancy profile fields

**Status:** Phase 2 candidate
**Source:** noticed while building פרטי הריון section in UserSettingsPage (2026-05-09)

### The idea
Today the only pregnancy-specific column on `user_profiles` is `due_date`. If users want to track richer context — first pregnancy vs. multiparous, twins/multiples, high-risk flags, last menstrual period — we'd need new columns.

### Why we're NOT building it now
- Requires a Supabase migration (out of scope for current sprint).
- Unclear which fields are actually wanted by users; risk of bloat.
- "Parity" (1st/2nd/3rd pregnancy) and "multiples" are the most commonly requested by tracking apps; everything else can wait.

### Validation needed
- Beta survey: which fields would moms actually want to record / see in their pregnancy dashboard?
- Check if Brenda's WhatsApp guidance distinguishes between first-time and multiparous moms — if yes, parity matters.

---

## Optional "Feeding Interval Prediction" view

**Status:** Removed (2026-05-09), keep for potential reintroduction
**Source:** Roni (beta tester) feedback

### What we removed
The journal originally had a `FeedingIntervalCard` showing predicted "next feeding in X hours" plus an alert banner ("baby needs to eat now!") and a browser-Notification scheduler. Roni said she didn't want predictions — she wanted to see *when the baby last ate*. We replaced the prediction with a "time since last action" badge on every action button.

### Why this could come back
- Some moms may actually want the interval reminder (especially first-time moms with strict-schedule pediatricians).
- The `FeedingIntervalCard.tsx` file is intact, including the 2 / 2.5 / 3 / 3.5 / 4 hours picker and the prediction logic.
- The `user_profiles.feeding_interval_hours` column is still in the schema, just unused by the UI.

### Options if we reintroduce
1. **Settings → Advanced → "מעקב מרווחים"** — opt-in toggle, hidden by default
2. **Pregnancy-mode-only** carryover → for moms who arrive from pregnancy mode and already had it on
3. **Specific user request only** — leave dormant unless multiple beta testers ask for it

### When to revisit
After 50+ active users post-launch, if a meaningful fraction asks for feeding-interval reminders.


---

## OAuth Branding — לסדר לפני השקה

**Status:** Pre-launch fix (Week 3 target)
**Source:** דיווח אישי

### הבעיה
במסך ההתחברות של גוגל מופיע `Ir a pkekucngirkjqigpmlrt.supabase.co` במקום שם האפליקציה. זה נראה לא מקצועי לאמהות ועלול להרתיע מלהשלים התחברות.

### שתי דרכים לפתור

1. **Custom Domain ב-Supabase** (Pro plan, ~$25/חודש) — הדרך המקצועית.
   ה-OAuth callback עובר לדומיין ייעודי (למשל `auth.mimo-baby.co.il`), ובמסך גוגל מוצג הדומיין הזה במקום ה-URL הגנרי של Supabase. דורש שדרוג מנוי, אבל פותר מיד.

2. **Google OAuth Verification** — תהליך חינמי שלוקח 1-3 שבועות.
   דורש: Privacy Policy פומבית, Terms of Service, בקשת אימות מ-Google. אחרי האישור, מסך הגוגל יציג את שם האפליקציה ("Mimo") במקום ה-URL.

### מתי לטפל
**שבוע 3** — ממילא עובדים אז על privacy policy ו-assets לחנות האפליקציות, אז זה משתלב טבעית.

### החלטה נדרשת לפני ההתחלה
לעבור ל-Supabase Pro (~$25/חודש, מיידי) או ללכת על Google Verification (חינמי, 1-3 שבועות)?
