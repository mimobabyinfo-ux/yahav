-- Sales call script + call log for the admin "לידים" screen (24.9.26).
-- Yahav: "להוסיף באדמין את התסריטי מכירה ... לשמור את הדאטה וללמוד מה הדרך הטובה יותר".
-- Script structure from the meeting with Saar: סינון, חיבור, חסמים, כאב, גשר, מוצר, מחיר, סגירה.
-- sales_scripts : versioned script text, editable from the screen (every save = new version).
-- crm_call_logs : one row per call made with the script: which steps were done, blockers,
--                 what she said, price reaction, outcome. crm_call_stats() turns it into the
--                 weekly "למידה" view, matching calls to later paid registrations by phone.

create table if not exists public.sales_scripts (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  content jsonb not null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists sales_scripts_version_key on public.sales_scripts(version);

create table if not exists public.crm_call_logs (
  id uuid primary key default gen_random_uuid(),
  opp_id text,
  contact_id text,
  lead_name text,
  phone_local text,
  actor text,
  script_version int,
  product text,
  steps_done text[] not null default '{}',
  stopped_at text,
  blockers jsonb not null default '{}'::jsonb,
  pains text[] not null default '{}',
  price_reaction text,
  outcome text not null,
  note text,
  started_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_call_logs_created_idx on public.crm_call_logs(created_at desc);

alter table public.sales_scripts enable row level security;
alter table public.crm_call_logs enable row level security;
create policy sales_scripts_admin_all on public.sales_scripts for all using (public.is_admin()) with check (public.is_admin());
create policy crm_call_logs_admin_all on public.crm_call_logs for all using (public.is_admin()) with check (public.is_admin());

insert into public.sales_scripts (version, created_by, content) values (1, 'Claude', $json$
{
  "steps": [
    {"key": "open", "title": "פתיחה",
     "say": ["היי [שם], מדבר [אני] ממימו 🙂 השארת פרטים לסדנה של ברנדה. יש לך כמה דקות? את איתי?"],
     "hint": "לא נוח? לקבוע שעה. מעדיפה ווטסאפ? לעבור לווטסאפ."},
    {"key": "connect", "title": "חיבור",
     "say": ["איך את מרגישה?", "איך קוראים לו/לה?", "איך עברה הלידה?", "מה עשית לפני שהיית אמא?"],
     "hint": "לתת לה לדבר ולפרוק. קצת עליך, בקטנה."},
    {"key": "blockers", "title": "חסמים",
     "checks": [
       {"key": "age", "label": "גיל", "say": "בן/בת כמה? (עד 3 חודשים עטופים, 3 עד 6 מגלים)"},
       {"key": "distance", "label": "מרחק ורכב", "say": "הסטודיו באבא אחימאיר 10, רמת גן. זה באמת נוח לך? יש אוטו זמין? נסעת איתו כבר?"},
       {"key": "schedule", "label": "לו\"ז ל-5 מפגשים", "say": "5 מפגשים, פעם בשבוע. תבדקי רגע בלו\"ז שזה מסתדר."}
     ],
     "hint": "לא ממשיכים עד שהיא בודקת."},
    {"key": "pain", "title": "כאב",
     "say": ["למה השארת פרטים?", "מה קורה ביום יום? ובלילה?", "איך זה משפיע עלייך?"],
     "chips": ["שינה", "גזים / בכי", "בטן", "התפתחות", "בדידות", "ביטחון כאמא", "אחר"],
     "hint": "היא אומרת, לא אנחנו."},
    {"key": "bridge", "title": "גשר",
     "say": ["אם היית מקבלת [מה שהיא אמרה], מה היה קורה?"],
     "hint": "לחכות לתשובה שלה."},
    {"key": "product", "title": "מוצר",
     "products": {
       "atufim": ["5 מפגשים של שעה וחצי, קבוצה של עד 8", "הסתגלות מהרחם לעולם, שכיבה על הבטן, חלונות ערות", "כלים להרגעה ולהקלה על גזים", "קבוצת ווטסאפ, קפה בגינה, מתנה בסיום"],
       "maglim": ["5 מפגשים של שעה וחצי, קבוצה של עד 8", "גיל 4 חודשים, התהפכויות, חיזוק לקראת זחילה", "משחקי תקשורת וחוויות תחושתיות", "קבוצת ווטסאפ, קפה בגינה, מתנה בסיום"]
     },
     "say": ["על ברנדה: (להשלים בעריכה)"],
     "hint": "לבחור 2-3 דברים שמתחברים למה שהיא אמרה."},
    {"key": "price", "title": "מחיר",
     "say": ["ההשקעה היא 160 ש\"ח למפגש. אני מניח שזה לא יהיה בעיה עבורך, נכון?"],
     "choices": [{"key": "ok", "label": "בסדר"}, {"key": "hesitant", "label": "היססה"}, {"key": "no", "label": "לא מתאים"}],
     "hint": "לא מתאים? מפגש עיסוי חד פעמי 150 ש\"ח או קורס דיגיטלי 68 ש\"ח."},
    {"key": "close", "title": "סגירה",
     "say": ["אני שולח לך עכשיו לינק. תפתחי ונעשה את זה ביחד?"],
     "hint": "תמיד צעד הבא עם תאריך. לא \"תחזרי אליי\"."}
  ],
  "wa": [
    "היי [שם], זה [אני] ממימו 🙂 ניסיתי להתקשר לגבי הסדנה של ברנדה. מתי נוח לך שאתקשר? ואם יותר קל בהודעות, אפשר גם כאן.",
    "היי [שם], רק מעדכן שהמחזור הקרוב מתמלא. אם זה עדיין רלוונטי, אשמח לדבר. ואם העיתוי לא מתאים, תגידי לי ואשמור אותך למחזור הבא.",
    "היי [שם], לא רוצה להציק 🙂 אם תרצי בהמשך, אנחנו כאן. מאחלים לכם חודשים ראשונים רגועים 🤍"
  ]
}
$json$::jsonb) on conflict (version) do nothing;

-- Weekly learning view. p_days = how far back. Registered = outcome 'registered' or a paid
-- registration in the app with the same phone from one day before the call onward.
create or replace function public.crm_call_stats(p_days int default 7)
returns jsonb language sql security definer set search_path = public as $$
  with c as (
    select l.*,
      (l.outcome = 'registered' or exists (
        select 1 from registration_leads r
        where r.normalized_phone = l.phone_local and l.phone_local is not null
          and r.status in ('paid', 'handled') and r.created_at >= l.created_at - interval '1 day'
      )) as reg
    from crm_call_logs l
    where public.is_admin() and l.created_at >= now() - make_interval(days => p_days)
  ),
  a as (select * from c where outcome <> 'no_answer')
  select jsonb_build_object(
    'calls', (select count(*) from c),
    'answered', (select count(*) from a),
    'registered', (select count(*) from c where reg),
    'reached', (select coalesce(jsonb_object_agg(s, n), '{}') from (select unnest(steps_done) s, count(*) n from a group by 1) x),
    'stopped', (select coalesce(jsonb_object_agg(stopped_at, n), '{}') from (select stopped_at, count(*) n from a where not reg and stopped_at is not null group by 1) x),
    'blockers_no', (select coalesce(jsonb_object_agg(k, n), '{}') from (select k, count(*) n from a, jsonb_each_text(blockers) b(k, v) where v = 'no' group by 1) x),
    'pains', (select coalesce(jsonb_object_agg(p, n), '{}') from (select unnest(pains) p, count(*) n from a group by 1) x),
    'price', (select coalesce(jsonb_object_agg(price_reaction, n), '{}') from (select price_reaction, count(*) n from a where price_reaction is not null group by 1) x),
    'outcomes', (select coalesce(jsonb_object_agg(outcome, n), '{}') from (select outcome, count(*) n from c group by 1) x),
    'by_version', (select coalesce(jsonb_agg(jsonb_build_object('version', script_version, 'calls', n, 'answered', ans, 'registered', rg) order by script_version), '[]')
                   from (select script_version, count(*) n, count(*) filter (where outcome <> 'no_answer') ans, count(*) filter (where reg) rg from c group by 1) x)
  );
$$;
grant execute on function public.crm_call_stats(int) to authenticated;

-- Who works the lead (24.9.26, Yahav): "לסמן בכרטיס ליד שזה בטיפול של ברנדה ... בוגרת עטופים
-- שרוצה מגלים עדיף שזה יהיה ברנדה ... או פרטני". No row = Yahav's. The יהב / ברנדה switch on
-- the screen shows only that person's leads. Kept apart from crm_leads so the sync never touches it.
create table if not exists public.crm_lead_owner (
  opp_id text primary key,
  owner text not null,
  set_by text,
  set_at timestamptz not null default now()
);
alter table public.crm_lead_owner enable row level security;
create policy crm_lead_owner_admin_all on public.crm_lead_owner for all using (public.is_admin()) with check (public.is_admin());
alter publication supabase_realtime add table public.crm_lead_owner;
