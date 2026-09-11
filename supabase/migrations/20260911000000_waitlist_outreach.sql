-- "מי יכלה, מי לא, מי לא ענתה".
--
-- Yahav 11.9.26: he sent the waitlist a WhatsApp about a fathers' meetup on
-- 25/09, and the moment he pressed "שלח" the rows left the home card
-- (it listed only notified_at IS NULL). He then had to keep the answers in
-- his head: "חלק אמרו לי שהם יכולים חלק לא ... ואני צריך לעבור ידנית".
--
-- What he asked for:
--   1. Nobody disappears after a message. The list is a control panel, not
--      a to-do list that empties itself.
--   2. A proposed date per product ("אני רוצה לעשות ב-25/09"), and for each
--      mother: can / cannot / has not answered, so he knows whether there
--      are enough to go ahead.
--   3. A mother who cannot make THIS date stays in the data as someone who
--      wants the workshop, for the next cohort.
--
-- The proposed date lives on the product, not on a cohort. He wants to
-- gauge demand BEFORE committing, and a cohort row would put a buy button
-- in the store. If a cohort with that exact date exists, notified_cohort_id
-- is still stamped as before.
--
-- The answer is keyed to the date she was asked about (proposed_date).
-- Change the product's proposed date and every row is "not asked yet"
-- again, with her previous answer shown as history. That is how "לא יכולה
-- ב-25/09" turns into "לפנות אליה במחזור הבא" without any extra state.

alter table public.workshops
  add column if not exists waitlist_proposed_date date;

comment on column public.workshops.waitlist_proposed_date is
  'The date currently being proposed to the waitlist (before a cohort exists). Null = no proposal yet.';

alter table public.workshop_waitlist
  add column if not exists proposed_date date,
  add column if not exists response text
    check (response is null or response in ('yes', 'no')),
  add column if not exists responded_at timestamptz;

comment on column public.workshop_waitlist.proposed_date is
  'The date she was asked about in the last message. Compared with workshops.waitlist_proposed_date to decide whether she has been asked about the current proposal.';
comment on column public.workshop_waitlist.response is
  'yes = can make proposed_date, no = cannot. Null = not answered yet.';

-- Rows already sent before this migration (6 on 11.9.26) have notified_at
-- but no proposed_date, because the old message carried no date unless a
-- cohort existed. The admin treats those as "sent, date not recorded" and
-- attaches the current proposal when Yahav marks the answer. Not backfilled
-- here on purpose: guessing the date he typed by hand would be a lie.
