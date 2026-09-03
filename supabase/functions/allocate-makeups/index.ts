// Edge Function: allocate-makeups
//
// רץ כל שעה (pg_cron). שני דברים:
//   1. מריץ את ההקצאה על כל מפגש שנשארו לו פחות מ-24 שעות ויש בתור בקשות
//      השלמה. ברגע הזה הרוסטר של המחזור המארח סגור וההיעדרויות ידועות, אז
//      אפשר לחלק את המקומות שנשארו לפי סדר הבקשות.
//   2. שולח לכל אמא שהוכרעה בקשתה מייל: אושר או לא נכנסת.
//
// למה לא ווטסאפ: חלון 24 השעות של Meta כמעט תמיד יהיה סגור ברגע הזה, אז
// שליחה מחוץ ל-template פשוט לא תצא. ראה whatsapp_24h_window.
//
// אין צורך בטבלת אידמפוטנטיות: allocated_at על המפגש חוסם הקצאה כפולה,
// ו-notified_at על הבקשה חוסם מייל כפול.
//
// Secrets: RESEND_API_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY מוזרקים.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
const ALERT_TO = 'mimobaby.info@gmail.com'

type Notification = {
  request_id: string
  status: 'confirmed' | 'rejected'
  reject_reason: string | null
  mother_name: string | null
  mother_email: string | null
  workshop_title: string
  meeting_number: number
  missed_date: string
  makeup_date: string
  makeup_time: string | null
  makeup_cohort_label: string
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`
}

function dayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function shell(body: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;color:#3A352E;line-height:1.7;" dir="rtl">${body}</body></html>`
}

function confirmedEmail(n: Notification): { subject: string; html: string } {
  const when = `יום ${dayName(n.makeup_date)}, ${ddmm(n.makeup_date)}${n.makeup_time ? ` בשעה ${n.makeup_time.slice(0, 5)}` : ''}`
  return {
    subject: `יש לך מקום בהשלמה של מפגש ${n.meeting_number}`,
    html: shell(`
      <h2 style="color:#A35C3D;">יש לך מקום 🤍</h2>
      <p>היי ${escapeHtml(n.mother_name ?? '')},</p>
      <p>ההשלמה של <strong>מפגש ${n.meeting_number}</strong> ב${escapeHtml(n.workshop_title)} אושרה.</p>
      <p style="background:#F5F1EB;border-radius:12px;padding:14px;margin:16px 0;">
        <strong>${when}</strong><br />
        קבוצת ${escapeHtml(n.makeup_cohort_label)}
      </p>
      <p>נתראה שם. אם משהו משתנה, סמני באפליקציה כדי שהמקום יתפנה למישהי אחרת.</p>
    `),
  }
}

function rejectedEmail(n: Notification): { subject: string; html: string } {
  const cancelled = n.reject_reason === 'meeting_cancelled'
  return {
    subject: `לגבי ההשלמה של מפגש ${n.meeting_number}`,
    html: shell(`
      <h2 style="color:#A35C3D;">לא הצלחנו לשריין לך מקום הפעם</h2>
      <p>היי ${escapeHtml(n.mother_name ?? '')},</p>
      <p>${cancelled
        ? `המפגש ב-${ddmm(n.makeup_date)} שביקשת להשלים בו התבטל.`
        : `הקבוצה של ${ddmm(n.makeup_date)} התמלאה, ונרשמות הקבוצה קודמות למשלימות.`}</p>
      <p>אפשר לבחור מועד אחר להשלמה באפליקציה, כל עוד יש כזה בטווח. בכל מקרה,
         סיכום המפגש והתרגילים ממתינים לך שם ואפשר לעבור עליהם בקצב שלך.</p>
    `),
  }
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<string> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    })
    if (!res.ok) return `failed: Resend ${res.status} ${await res.text()}`
    return 'sent'
  } catch (e) {
    return `failed: ${String(e)}`
  }
}

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  // 1. ההקצאה עצמה
  const { data: allocated, error: allocError } = await supabase.rpc('allocate_makeups_due')
  if (allocError) {
    console.error('[allocate-makeups] allocation failed', allocError.message)
    return new Response(JSON.stringify({ error: allocError.message }), { status: 500 })
  }

  // 2. ההודעות. גם בקשות שהוכרעו בריצה קודמת ושהמייל עליהן נכשל נאספות כאן,
  //    כי הסינון הוא notified_at ולא "מה הוקצה עכשיו".
  const { data: pending, error: notifyError } = await supabase
    .from('v_makeup_notifications')
    .select('*')
    .limit(200)
  if (notifyError) {
    console.error('[allocate-makeups] notification fetch failed', notifyError.message)
    return new Response(JSON.stringify({ error: notifyError.message }), { status: 500 })
  }

  const list = (pending ?? []) as Notification[]
  const sentIds: string[] = []
  const failures: string[] = []
  const noEmail: string[] = []

  for (const n of list) {
    // בלי כתובת אין למי לשלוח. מסמנים כטופל כדי שלא ננסה שוב כל שעה לנצח,
    // והשורה עדיין תופיע לברנדה במסך ההשלמות.
    if (!n.mother_email) { noEmail.push(n.request_id); sentIds.push(n.request_id); continue }
    if (!RESEND_API_KEY) { failures.push(`${n.request_id}: no RESEND_API_KEY`); continue }
    const mail = n.status === 'confirmed' ? confirmedEmail(n) : rejectedEmail(n)
    const result = await sendEmail(RESEND_API_KEY, n.mother_email, mail.subject, mail.html)
    if (result === 'sent') sentIds.push(n.request_id)
    else failures.push(`${n.request_id}: ${result}`)
  }

  if (sentIds.length > 0) {
    const { error: markError } = await supabase.rpc('mark_makeups_notified', { p_ids: sentIds })
    if (markError) console.error('[allocate-makeups] mark failed', markError.message)
  }

  // מייל אחד לברנדה רק כשבאמת קרה משהו, כדי שהתיבה שלה לא תתמלא בכלום.
  const confirmedCount = list.filter(n => n.status === 'confirmed').length
  const rejectedCount = list.filter(n => n.status === 'rejected').length
  if (RESEND_API_KEY && (confirmedCount > 0 || rejectedCount > 0)) {
    const rows = list.map(n =>
      `<li>${escapeHtml(n.mother_name ?? '—')} · מפגש ${n.meeting_number} ב-${ddmm(n.makeup_date)} · <strong>${n.status === 'confirmed' ? 'אושרה' : 'לא נכנסה'}</strong></li>`
    ).join('')
    await sendEmail(
      RESEND_API_KEY, ALERT_TO,
      `השלמות: ${confirmedCount} אושרו, ${rejectedCount} לא נכנסו`,
      shell(`<h2 style="color:#A35C3D;">עדכון השלמות</h2><ul>${rows}</ul>
             <p style="font-size:13px;color:#9a8a7a;">כל אחת מהן קיבלה מייל. אין צורך בפעולה מצידך.</p>`),
    )
  }

  const summary = {
    meetings_allocated: (allocated ?? []).length,
    allocation: allocated ?? [],
    notifications: list.length,
    emails_sent: sentIds.length - noEmail.length,
    without_email: noEmail.length,
    failures,
  }
  console.log('[allocate-makeups]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
