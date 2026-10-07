/**
 * Where a mother came from (?src=<channel>), kept until her profile exists.
 *
 * 7.10.26: the app campaign brought 54 clicks and not one profile carried
 * acquisition_source, including Brenda's own test sign-up through the ad
 * link opened inside Instagram. The value lived only in localStorage, and
 * App.tsx stripped ?src from the address bar on the first load. Anything
 * that moves her to another browser context (Instagram's "open in
 * browser", Google sign-in, an in-app browser that does not keep storage)
 * then loses it with no way back.
 *
 * So the value is now kept in three places (localStorage, sessionStorage,
 * a first-party cookie) and stays in the URL, and a Meta ad click that
 * arrives with fbclid but no src is still counted as 'meta_click'.
 * Never throws: attribution must never stand between a woman and signup.
 */

const KEY = 'mimo_src'
const MAX_AGE_DAYS = 30

function clean(v: string): string {
  return v.trim().toLowerCase().slice(0, 32)
}

function readCookie(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)mimo_src=([^;]*)/)
    return m ? decodeURIComponent(m[1]) || null : null
  } catch {
    return null
  }
}

export function setCampaignSrc(raw: string): void {
  const v = clean(raw)
  if (!v) return
  try { localStorage.setItem(KEY, v) } catch { /* private mode */ }
  try { sessionStorage.setItem(KEY, v) } catch { /* private mode */ }
  try {
    document.cookie = `${KEY}=${encodeURIComponent(v)}; Max-Age=${MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax`
  } catch { /* cookies blocked */ }
}

export function getCampaignSrc(): string | null {
  let v: string | null = null
  try { v = localStorage.getItem(KEY) } catch { /* */ }
  if (!v) { try { v = sessionStorage.getItem(KEY) } catch { /* */ } }
  if (!v) v = readCookie()
  if (!v) {
    // Last resort: still in the address bar (it is no longer stripped).
    try { v = new URLSearchParams(window.location.search).get('src') } catch { /* */ }
  }
  return v ? clean(v) : null
}

export function clearCampaignSrc(): void {
  try { localStorage.removeItem(KEY) } catch { /* */ }
  try { sessionStorage.removeItem(KEY) } catch { /* */ }
  try { document.cookie = `${KEY}=; Max-Age=0; Path=/; SameSite=Lax` } catch { /* */ }
}

/** Call once at startup. ?src wins; a bare Meta ad click (fbclid) counts as 'meta_click'. */
export function captureCampaignSrc(params: URLSearchParams): void {
  const src = params.get('src')
  if (src) { setCampaignSrc(src); return }
  if (params.get('fbclid') && !getCampaignSrc()) setCampaignSrc('meta_click')
}

/** The OAuth return URL, carrying src so it survives a browser switch. */
export function oauthRedirectTo(): string {
  const src = getCampaignSrc()
  return src ? `${window.location.origin}/?src=${encodeURIComponent(src)}` : window.location.origin
}
