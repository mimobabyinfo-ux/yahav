// Demo dataset for the explainer clips. No real mother appears in any frame.
export const USER_ID = '11111111-1111-4111-8111-111111111111'
export const CHILD_ID = '22222222-2222-4222-8222-222222222222'

const TODAY = '2026-08-19'
const YESTERDAY = '2026-08-18'

const entry = (id, date, time, type, extra = {}) => ({
  id, user_id: USER_ID, child_id: CHILD_ID,
  entry_date: date, entry_time: time, entry_type: type,
  notes: null, photo_url: null,
  created_at: `${date}T${time}Z`, updated_at: `${date}T${time}Z`,
  feeding_details: [], sleep_details: [], diaper_details: [],
  ...extra,
})

const feed = (id, date, time, d) => entry(id, date, time, 'feeding', {
  feeding_details: [{
    id: `fd-${id}`, log_entry_id: id, feeding_type: 'breast', breast_side: 'both',
    duration_minutes: null, amount_ml: null, left_duration_seconds: null,
    right_duration_seconds: null, milk_type: null, ...d,
  }],
})
const sleep = (id, date, time, d) => entry(id, date, time, 'sleep', {
  sleep_details: [{ id: `sd-${id}`, log_entry_id: id, sleep_type: 'nap', duration_minutes: 60, quality: 'good', ...d }],
})
const diaper = (id, date, time, d) => entry(id, date, time, 'diaper', {
  diaper_details: [{ id: `dd-${id}`, log_entry_id: id, diaper_type: 'wet', notes: null, ...d }],
})

export const db = {
  user_profiles: [{
    id: USER_ID, email: 'noa@example.com', mother_name: 'נועה', baby_name: 'יעל',
    baby_dob: '2026-05-02', baby_gender: 'girl', is_pro: false, is_admin: false,
    display_name: 'נועה', lead_status: null, acquisition_source: 'app', staff_notes: null,
    last_active: `${TODAY}T08:00:00Z`, family_id: null, area: 'רמת גן', neighborhood: null,
    phone_number: '0501234567', community_consent: true,
    community_bio: 'אמא טרייה ליעל, אוהבת הליכות בוקר בפארק',
    community_tags: ['walks', 'coffee'], user_mode: 'mom', due_date: null,
    feeding_interval_hours: 3, created_at: '2026-05-03T09:00:00Z', updated_at: `${TODAY}T08:00:00Z`,
    onboarding_completed: true, consent_terms: true, consent_privacy: true,
  }],
  children: [{
    id: CHILD_ID, user_id: USER_ID, name: 'יעל', dob: '2026-05-02', gender: 'girl',
    share_token: 'demo-share-token', created_at: '2026-05-03T09:00:00Z',
  }],
  daily_log_entries: [
    feed('e1', TODAY, '07:10:00', { duration_minutes: 18 }),
    diaper('e2', TODAY, '07:35:00', { diaper_type: 'both' }),
    sleep('e3', TODAY, '08:20:00', { duration_minutes: 75 }),
    feed('e4', TODAY, '10:05:00', { feeding_type: 'bottle', breast_side: null, amount_ml: 120, milk_type: 'pumped' }),
    diaper('e5', TODAY, '11:00:00', { diaper_type: 'wet' }),
    sleep('e6', TODAY, '12:15:00', { duration_minutes: 95 }),
    feed('e7', TODAY, '14:00:00', { duration_minutes: 22 }),
    feed('e8', YESTERDAY, '21:30:00', { duration_minutes: 20 }),
    sleep('e9', YESTERDAY, '22:10:00', { sleep_type: 'night', duration_minutes: 320, quality: 'fair' }),
  ],
  daily_tips: [{
    id: 't1', tip_text: 'בגיל שלושה חודשים תינוקות מתחילים לזהות פנים מוכרות ממרחק גדול יותר. זמן טוב לשחק "איפה אמא" מקרוב.',
    is_active: true, created_at: '2026-05-01T00:00:00Z', title: 'היא מזהה אותך',
    article_link: null, age_range_start_days: 60, age_range_end_days: 180,
    tip_for: 'mom', pregnancy_week_start: null, pregnancy_week_end: null,
  }],
  global_settings: [
    { id: 'g1', setting_key: 'owner_name', setting_value: 'ברנדה' },
    { id: 'g2', setting_key: 'owner_whatsapp', setting_value: '972527506227' },
    { id: 'g3', setting_key: 'app_subtitle', setting_value: 'בית עוטף ומלטף' },
  { id: 'g4', setting_key: 'show_home_perks', setting_value: 'true' },
  ],
  active_timers: [],
  purchased_workshops: [],
  families: [],
  partner_perks: [],
  workshops: [],
  videos: [],
}

export const SESSION = {
  access_token: 'demo-access-token', token_type: 'bearer', expires_in: 3600 * 24 * 365,
  expires_at: Math.floor(Date.parse('2027-01-01T00:00:00Z') / 1000),
  refresh_token: 'demo-refresh-token',
  user: {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'noa@example.com',
    email_confirmed_at: '2026-05-03T09:00:00Z', phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { terms_accepted_at: '2026-05-03T09:00:00Z', terms_version: '18 באוגוסט 2026', marketing_opt_in: true },
    identities: [], created_at: '2026-05-03T09:00:00Z',
    updated_at: '2026-05-03T09:00:00Z',
  },
}

// ── Community: events, attendees, credits, waitlist ──────────────────────────
const ev = (id, title, emoji, date, start, end, o = {}) => ({
  id, title, emoji, event_type: o.event_type ?? 'meetup',
  description: o.description ?? null, event_date: date, start_time: start, end_time: end,
  location: o.location ?? null, location_link: null,
  capacity: o.capacity ?? 20, price: o.price ?? 0,
  payment_link: o.price ? 'https://pay.example.com/x' : null,
  payment_link_pair: null, vendor_name: o.vendor_name ?? null, image_url: null,
  registered_count: o.registered ?? 0, my_status: o.my_status ?? null,
})

export const EVENTS = [
  ev('ev-yoga', 'יוגה לאמהות ותינוקות', '🧘🏻‍♀️', '2026-08-24', '10:00:00', '11:00:00', {
    description: 'שעה של תנועה נעימה, התינוקות איתנו על המזרן. מתאים מגיל חודשיים.',
    location: 'סטודיו נשימה, רמת גן', capacity: 12, price: 60, registered: 9, vendor_name: 'מיטל, מדריכת יוגה',
  }),
  ev('ev-cafe', 'קפה של בוקר עם אמהות', '☕', '2026-08-27', '09:30:00', '11:00:00', {
    description: 'מפגש פתוח, בלי תוכנית. באות, יושבות, מדברות. העגלות נכנסות.',
    location: 'קפה לואיז, רמת גן', capacity: 20, price: 0, registered: 12, my_status: 'registered',
  }),
  ev('ev-sleep', 'הרצאה: שינה בגיל 4 עד 6 חודשים', '🌙', '2026-09-02', '20:00:00', '21:30:00', {
    description: 'מה באמת קורה לשינה בגיל הזה, ומה אפשר לעשות בלי לשבור אף אחת.',
    location: 'זום, הקישור נשלח יום לפני', capacity: 30, price: 45, registered: 28,
  }),
  ev('ev-massage', 'סדנת עיסוי תינוקות', '💆🏼‍♀️', '2026-09-09', '17:00:00', '18:30:00', {
    description: 'ללמוד את הידיים. עיסוי בטן, גזים ורגליים.',
    location: 'מימו, רמת גן', capacity: 10, price: 90, registered: 10,
  }),
  ev('ev-picnic', 'פיקניק קהילה בפארק', '🧺', '2026-09-20', '16:30:00', '18:30:00', {
    description: 'שמיכה, פיצוחים, וכל האמהות של מימו במקום אחד.',
    location: 'פארק הלאומי, רמת גן', capacity: 40, price: 0, registered: 7,
  }),
]

export const ATTENDEES = [
  { user_id: 'u2', mother_name: 'שירה', area: 'רמת גן', phone_number: '0501111111', community_consent: true,
    community_bio: 'אמא לתאומים בני 5 חודשים', community_tags: ['walks'], child_dob: '2026-03-11', child_gender: 'boy', guest_names: null },
  { user_id: 'u3', mother_name: 'דנה', area: 'גבעתיים', phone_number: '0502222222', community_consent: true,
    community_bio: 'חוזרת לעבודה בקרוב', community_tags: ['coffee'], child_dob: '2026-05-20', child_gender: 'girl', guest_names: ['אמא שלי'] },
  { user_id: 'u4', mother_name: 'עדי', area: 'רמת גן', phone_number: '0503333333', community_consent: false,
    community_bio: null, community_tags: [], child_dob: '2026-06-02', child_gender: 'girl', guest_names: null },
]

export const CREDITS = [
  { id: 'cr1', amount: 60, event_title: 'יוגה לאמהות ותינוקות', created_at: '2026-08-12T10:00:00Z', expires_at: '2026-09-12' },
]

// ── Store: products, cohorts, one past purchase ─────────────────────────────
const prod = (id, title, type, price, o = {}) => ({
  id, title, description: o.description ?? null, summary: null, workshop_type: type,
  image_url: null, video_url: null, category_id: null, tags: null, price,
  currency: 'ILS', payment_link: 'https://pay.example.com/p', morning_product_id: null,
  next_workshop_id: null, public_registration: o.publicReg ?? false, linked_form_id: null,
  feedback_form_id: null, is_active: true, display_order: o.order ?? 1,
  whatsapp_number: '972527506227', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
})

db.workshops = [
  prod('w-massage', 'סדנת עיסוי תינוקות', 'תינוקות', 380, { order: 1, publicReg: true,
    description: 'ארבעה מפגשים של שעה. לומדות עיסוי בטן, גזים, רגליים וגב, ומקבלות שמן עיסוי אורגני במתנה.' }),
  prod('w-birth', 'הכנה ללידה', 'הריון', 650, { order: 2, publicReg: true,
    description: 'חמישה מפגשים זוגיים. לידה, נשימות, הנקה ראשונה והשבוע הראשון בבית.' }),
  prod('w-back', 'חזרה לעצמי אחרי לידה', 'אימהות', 220, { order: 3,
    description: 'מפגש אחד, שעתיים, על הגוף ועל הראש אחרי לידה.' }),
  prod('w-oil', 'שמן עיסוי אורגני', 'תינוקות', 68, { order: 4,
    description: 'השמן שאנחנו עובדות איתו בסדנה. 100 מל, בלי בישום.' }),
  prod('w-kit', 'ערכת מתנה ליולדת', 'אימהות', 149, { order: 5,
    description: 'שמן עיסוי, מוצץ, בגד גוף ופתק אישי. נשלח עד הבית.' }),
]

export const COHORTS = [
  { id: 'c1', workshop_id: 'w-massage', start_date: '2026-09-07', start_time: '17:00:00', label: 'מחזור ספטמבר', capacity: 10, registered_count: 6 },
  { id: 'c2', workshop_id: 'w-massage', start_date: '2026-10-05', start_time: '17:00:00', label: 'מחזור אוקטובר', capacity: 10, registered_count: 1 },
  { id: 'c3', workshop_id: 'w-birth', start_date: '2026-09-14', start_time: '19:00:00', label: 'מחזור ספטמבר', capacity: 8, registered_count: 7 },
]

db.purchased_workshops = [{
  id: 'pw1', user_id: USER_ID, workshop_id: 'w-back',
  purchase_date: '2026-07-02', access_start_date: '2026-07-02', access_end_date: '2027-07-02',
  workshops: db.workshops.find(w => w.id === 'w-back'),
}]

db.partner_perks = [
  { id: 'p1', partner_name: 'בייבי לאב', description: '15% הנחה על כל האתר', discount_code: 'MIMO15',
    action_link: 'https://example.com', logo_url: null, is_featured: true, is_active: true, display_order: 1,
    valid_until: '2026-12-31', branches: null, category: null },
  { id: 'p2', partner_name: 'סטודיו תנועה', description: 'שיעור ניסיון חינם לאמהות מימו', discount_code: 'MIMOFREE',
    action_link: 'https://example.com', logo_url: null, is_featured: false, is_active: true, display_order: 2,
    valid_until: '2026-12-31', branches: null, category: null },
]

export const RPCS = {
  get_my_credit_balance: () => 60,
  get_community_events: () => EVENTS,
  get_event_attendees: () => ATTENDEES,
  get_my_credits: () => CREDITS,
  get_open_credits: () => CREDITS,
  get_my_waitlists: () => [],
  get_my_workshop_registrations: () => [],
  get_public_cohorts: () => COHORTS,
  get_neighborhood_suggestions: () => [],
  register_for_event: () => ({ status: 'registered' }),
  cancel_event_registration: () => ({ status: 'cancelled', credit: 0 }),
  join_event_waitlist: () => ({ position: 1 }),
  leave_event_waitlist: () => ({ ok: true }),
}

// Other mothers in the directory. Invented people, invented numbers.
const mom = (id, name, area, dob, gender, bio, tags, child) => ({
  id, mother_name: name, area, phone_number: '050' + id.slice(-7),
  community_consent: true, community_bio: bio, community_tags: tags,
  child_id: 'ch-' + id, child_dob: dob, child_gender: gender, child_name: child,
})
db.community_profiles = [
  mom('m1000001', 'שירה', 'רמת גן', '2026-04-11', 'boy', 'אמא לאורי, בפארק כל בוקר. שמחה לחברה', ['walks', 'coffee'], 'אורי'),
  mom('m1000002', 'דנה', 'גבעתיים', '2026-05-20', 'girl', 'חוזרת לעבודה בקרוב, מחפשת אמהות באזור', ['coffee', 'listening'], 'אלמה'),
  mom('m1000003', 'עדי', 'רמת גן', '2026-06-02', 'girl', 'ראשונה, לומדת הכל תוך כדי', ['playdate'], 'רוני'),
  mom('m1000004', 'ליאור', 'תל אביב', '2026-02-14', 'boy', 'שנייה בבית, אז כבר פחות נלחצת', ['workout', 'evening'], 'יהלי'),
  mom('m1000005', 'נטע', 'רמת גן', '2026-07-01', 'girl', 'טרייה מאוד, בעיקר עייפה', ['listening'], 'מיקה'),
  mom('m1000006', 'הילה', 'בני ברק', '2026-03-30', 'boy', 'אוהבת הליכות ארוכות עם העגלה', ['walks', 'playdate'], 'איתי'),
]
db.home_announcements = []
db.form_assignments = []
db.forms = []
