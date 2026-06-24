// Edge Function: send-cohort-surveys
//
// Once a day (invoked by a Supabase cron job, see the migration notes /
// dashboard steps), this emails the END-OF-WORKSHOP FEEDBACK survey to
// every registrant of any cohort that ended `survey_email_delay_days`
// ago (default 2) and hasn't been sent yet.
//
// IMPORTANT: the survey form is workshops.feedback_form_id — the
// SEPARATE end-of-workshop survey. It is NOT linked_form_id (that's the
// opening / developmental form shown in the customer card at the start).
//
// Idempotency contract (cohort-level):
//   - We only set workshop_cohorts.survey_sent_at AFTER every email for
//     that cohort has been sent successfully. A mid-run failure leaves
//     survey_sent_at NULL, so the next daily run retries the WHOLE
//     cohort. (At our volume re-sending a few duplicates to a cohort
//     that partially failed is acceptable; silently dropping a mother is
//     not.)
//
// All date comparisons run in Asia/Jerusalem.
//
// Secrets (set as Supabase function secrets — never hardcoded):
//   RESEND_API_KEY                 — Resend API key
//   SUPABASE_URL                   — auto-injected by the platform
//   SUPABASE_SERVICE_ROLE_KEY      — auto-injected; needed to read
//                                    registration_leads + update cohorts
//                                    past RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Where the app is served. The public form route is `?form=<id>`
// (App.tsx renders <PublicFormPage> before the auth gate, so the survey
// link needs NO login). Override here if the domain ever changes.
const SURVEY_URL_BASE = 'https://mimo-baby.co.il'

const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
// Workshop-agnostic warm copy. Subject per product spec.
const EMAIL_SUBJECT = 'נשמח לשמוע איך היה לך בעטופים 🤍'

const DEFAULT_DELAY_DAYS = 2

// today's date (YYYY-MM-DD) in Asia/Jerusalem, regardless of server TZ.
function todayInJerusalem(): string {
  // en-CA gives YYYY-MM-DD formatting.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Add days to a YYYY-MM-DD string (UTC math, no TZ drift). Returns YYYY-MM-DD.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function surveyEmailHtml(name: string, surveyUrl: string): string {
  const safeName = escapeHtml((name || '').trim())
  const greeting = safeName ? `היי ${safeName},` : 'היי,'
  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:24px;background:#FAF8F4;font-family:'Heebo','Assistant',system-ui,Arial,sans-serif;color:#3A352E;" dir="rtl">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
      <tr><td style="background:#ffffff;border-radius:24px;padding:36px 28px;text-align:center;box-shadow:0 14px 40px rgba(58,53,46,0.08);">
        <div style="font-size:40px;margin-bottom:8px;">🤍</div>
        <h1 style="font-size:22px;font-weight:800;color:#A35C3D;margin:0 0 16px;">${greeting}</h1>
        <p style="font-size:16px;line-height:1.7;margin:0 0 14px;">
          קודם כל — תודה שהיית חלק מהמסע הזה איתנו. היה לי ממש כיף ללוות אותך ואת הבייבי 🤍
        </p>
        <p style="font-size:16px;line-height:1.7;margin:0 0 26px;">
          אשמח לשמוע איך חווית את הסדנה — כמה מילים ממך עוזרות לי להמשיך ללמוד ולשפר.
          זה לוקח רק רגע.
        </p>
        <a href="${surveyUrl}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;text-decoration:none;font-weight:800;font-size:16px;padding:15px 34px;border-radius:999px;background:#A35C3D;color:#ffffff;">
          למילוי השאלון
        </a>
        <p style="font-size:13px;line-height:1.6;margin:26px 0 0;color:#9a8a7a;">
          אם הכפתור לא עובד, אפשר להעתיק את הקישור:<br />
          <span style="word-break:break-all;color:#A35C3D;">${surveyUrl}</span>
        </p>
      </td></tr>
      <tr><td style="text-align:center;padding-top:18px;color:#b3a896;font-size:12px;">באהבה, מימו 🤍</td></tr>
    </table>
  </body>
</html>`
}

async function sendEmail(
  resendKey: string,
  to: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject: EMAIL_SUBJECT,
        html,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${body}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing RESEND_API_KEY' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const today = todayInJerusalem()

  // Configurable delay (days after end_date). Falls back to default.
  let delayDays = DEFAULT_DELAY_DAYS
  const { data: settingRow } = await supabase
    .from('global_settings')
    .select('setting_value')
    .eq('setting_key', 'survey_email_delay_days')
    .maybeSingle()
  const parsed = settingRow?.setting_value != null ? parseInt(String(settingRow.setting_value), 10) : NaN
  if (Number.isInteger(parsed) && parsed >= 0) delayDays = parsed

  // Candidate cohorts: active, not yet sent, with an end_date. Date math
  // (end_date + delay <= today) done in JS against Jerusalem "today".
  const { data: cohorts, error: cohortErr } = await supabase
    .from('workshop_cohorts')
    .select('id, workshop_id, end_date, survey_sent_at, is_active')
    .eq('is_active', true)
    .is('survey_sent_at', null)
    .not('end_date', 'is', null)

  if (cohortErr) {
    return new Response(JSON.stringify({ error: cohortErr.message }), { status: 500 })
  }

  const due = (cohorts ?? []).filter(c => c.end_date && addDays(c.end_date, delayDays) <= today)

  const log: Array<Record<string, unknown>> = []
  let cohortsSent = 0
  let emailsSent = 0

  for (const cohort of due) {
    // Resolve the workshop's FEEDBACK form (NOT linked_form_id).
    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, title, feedback_form_id')
      .eq('id', cohort.workshop_id)
      .maybeSingle()

    const feedbackFormId = workshop?.feedback_form_id ?? null
    if (!feedbackFormId) {
      log.push({ cohort_id: cohort.id, skipped: 'no feedback_form_id on workshop' })
      continue
    }

    const surveyUrl = `${SURVEY_URL_BASE}?form=${feedbackFormId}`

    // Registrants with a usable email.
    const { data: leads, error: leadsErr } = await supabase
      .from('registration_leads')
      .select('id, name, email')
      .eq('cohort_id', cohort.id)
    if (leadsErr) {
      log.push({ cohort_id: cohort.id, error: `leads query: ${leadsErr.message}` })
      continue
    }

    const recipients = (leads ?? []).filter(l => l.email && l.email.includes('@'))

    let allOk = true
    let sentForCohort = 0
    for (const lead of recipients) {
      const html = surveyEmailHtml(lead.name ?? '', surveyUrl)
      const result = await sendEmail(RESEND_API_KEY, lead.email as string, html)
      if (result.ok) {
        sentForCohort++
        emailsSent++
        log.push({ cohort_id: cohort.id, email: lead.email, status: 'sent' })
      } else {
        allOk = false
        log.push({ cohort_id: cohort.id, email: lead.email, status: 'failed', error: result.error })
      }
    }

    // Mark sent only if nothing failed. With zero recipients allOk stays
    // true, so an empty cohort is marked sent (nothing to retry) rather
    // than re-scanned forever.
    if (allOk) {
      const { error: updErr } = await supabase
        .from('workshop_cohorts')
        .update({ survey_sent_at: new Date().toISOString() })
        .eq('id', cohort.id)
      if (updErr) {
        log.push({ cohort_id: cohort.id, error: `mark sent failed: ${updErr.message}` })
      } else {
        cohortsSent++
        log.push({ cohort_id: cohort.id, status: 'cohort_marked_sent', recipients: sentForCohort })
      }
    } else {
      log.push({ cohort_id: cohort.id, status: 'cohort_left_unsent_for_retry', sent: sentForCohort, total: recipients.length })
    }
  }

  const summary = {
    today_jerusalem: today,
    delay_days: delayDays,
    cohorts_due: due.length,
    cohorts_marked_sent: cohortsSent,
    emails_sent: emailsSent,
    log,
  }
  console.log('[send-cohort-surveys]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
