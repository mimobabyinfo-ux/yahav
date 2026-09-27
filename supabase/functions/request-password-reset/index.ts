// Edge Function: request-password-reset
//
// Brenda 27.9.26: "אין אופציה של שכחתי סיסמה באפליקציה - מישהי נרשמה
// ושכחה את הסיסמה ולא יכלה להתחבר".
//
// Why our own function and not supabase.auth.resetPasswordForEmail():
// the project never sent an auth email itself (email confirmation is off,
// every sign-in link so far is minted with generateLink and delivered by
// us). Supabase's built-in mailer is English, rate-limited, and without a
// custom SMTP it only delivers to the project's team members, so a mother
// would simply never get it. Here we mint the recovery link with
// generateLink and send a Hebrew email through Resend from
// noreply@mimo-baby.co.il, like every other Mimo email.
//
// The link lands on APP_URL/?reset=1 with a recovery session in the hash;
// App.tsx sees it and shows SetNewPasswordPage.
//
// Always answers { ok: true } whether or not the address has an account,
// so the form cannot be used to find out who is registered.
// Throttle: at most 3 emails per address per hour (password_reset_requests).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://mimo-baby.co.il'
const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
const MAX_PER_HOUR = 3

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  let email = ''
  try { email = String((await req.json())?.email ?? '').trim().toLowerCase() } catch { /* empty */ }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, reason: 'bad_email' }, 400)

  // Throttle before anything else.
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await admin.from('password_reset_requests')
    .select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', hourAgo)
  if ((count ?? 0) >= MAX_PER_HOUR) return json({ ok: true, throttled: true })
  await admin.from('password_reset_requests').insert({ email })

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${APP_URL}/?reset=1` },
  })
  // No account with this address: say nothing different.
  if (linkErr || !linkData?.properties?.action_link) {
    console.log('[reset] no link for address:', linkErr?.message)
    await admin.from('password_reset_requests').update({ outcome: 'no_account' })
      .eq('email', email).gte('created_at', new Date(Date.now() - 60_000).toISOString())
    return json({ ok: true })
  }
  if (!RESEND_API_KEY) return json({ ok: false, reason: 'no_mailer' }, 500)

  const link = linkData.properties.action_link
  const { data: prof } = await admin.from('user_profiles')
    .select('mother_name').eq('id', linkData.user.id).maybeSingle()
  const first = (prof?.mother_name ?? '').trim().split(/\s+/)[0] ?? ''
  const hi = first ? `היי ${escapeHtml(first)},` : 'היי,'

  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#F8F4EC;font-family:Arial,Helvetica,sans-serif;color:#443327">
<div style="max-width:480px;margin:0 auto;padding:28px 20px;direction:rtl;text-align:right">
  <div style="background:#fff;border-radius:20px;padding:28px 24px;border:1px solid #F0EAE0">
    <p style="font-size:17px;margin:0 0 14px">${hi}</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px">ביקשת לבחור סיסמה חדשה לאפליקציית מימו. לחיצה על הכפתור תכניס אותך לאפליקציה, ושם תבחרי סיסמה חדשה.</p>
    <p style="text-align:center;margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#E7C78A;color:#4A3A28;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:16px">לבחירת סיסמה חדשה</a></p>
    <p style="font-size:13px;line-height:1.6;color:#8A7A63;margin:0">הקישור תקף לשעה ולשימוש אחד. אם לא ביקשת, אפשר פשוט להתעלם מהמייל והסיסמה נשארת כמו שהיא.</p>
  </div>
  <p style="font-size:12px;color:#9C8A74;text-align:center;margin:16px 0 0">מימו · mimo-baby.co.il</p>
</div></body></html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject: 'בחירת סיסמה חדשה למימו', html }),
  })
  const outcome = res.ok ? 'sent' : `resend_${res.status}`
  if (!res.ok) console.error('[reset] resend failed', res.status, await res.text())
  await admin.from('password_reset_requests').update({ outcome })
    .eq('email', email).gte('created_at', new Date(Date.now() - 60_000).toISOString())
  return json({ ok: true })
})
