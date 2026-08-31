/**
 * Ad attribution for registrations: which ad brought which lead.
 *
 * Since 31.8.26 the marketing site (lp.mimo-baby.co.il) appends the stored
 * utm_* / fbclid of the ad click to every link that leads here, so the
 * register page URL arrives carrying the ad's identity. We snapshot those
 * params on first load (she may browse cohorts before submitting, which
 * drops them from the address bar) and attach the snapshot to the
 * registration_leads insert.
 *
 * Organic visitors simply store nulls. Never throws — attribution must
 * never stand between a woman and her registration.
 */

const KEY = 'mimo_ad_attribution'

export type AdAttribution = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  landing_path: string | null
}

const EMPTY: AdAttribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  fbclid: null,
  landing_path: null,
}

function read(params: URLSearchParams, key: string): string | null {
  const v = params.get(key)
  if (!v) return null
  // Keep the column sane if someone hand-crafts a monstrous URL.
  return v.slice(0, 200)
}

/** Call once when a public page mounts. First touch wins for the session. */
export function captureAdAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    const incoming: AdAttribution = {
      utm_source: read(params, 'utm_source'),
      utm_medium: read(params, 'utm_medium'),
      utm_campaign: read(params, 'utm_campaign'),
      utm_content: read(params, 'utm_content'),
      utm_term: read(params, 'utm_term'),
      fbclid: read(params, 'fbclid'),
      landing_path: (window.location.pathname + window.location.search).slice(0, 200),
    }
    const hasAnyParam =
      incoming.utm_source ||
      incoming.utm_medium ||
      incoming.utm_campaign ||
      incoming.utm_content ||
      incoming.utm_term ||
      incoming.fbclid
    // Don't let an internal navigation blank out the ad that brought her.
    const stored = sessionStorage.getItem(KEY)
    if (stored && !hasAnyParam) return
    sessionStorage.setItem(KEY, JSON.stringify(incoming))
  } catch {
    // sessionStorage can be unavailable (private-mode Safari) — fine.
  }
}

/** The stored snapshot, shaped to spread straight into a leads insert. */
export function getAdAttribution(): AdAttribution {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return EMPTY
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<AdAttribution>) }
  } catch {
    return EMPTY
  }
}
