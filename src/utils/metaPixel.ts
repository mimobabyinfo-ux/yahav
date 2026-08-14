import { supabase } from '../lib/supabase'

/**
 * Meta pixel, loaded on demand.
 *
 * The pixel lives on the marketing site, but the funnel's two most valuable
 * moments happen inside the app: the form submit (?register) and the
 * payment return (?thanks). Without them a Sales campaign has no purchase
 * signal and Meta optimises for whoever likes filling in forms.
 *
 * Loaded lazily and ONLY on those two public pages. A mother logging her
 * baby's sleep at 3am is not carrying an ad tracker around the app.
 *
 * The id comes from global_settings.meta_pixel_id so it can be changed
 * without a deploy. No id configured = every call here is a no-op.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[]
  loaded?: boolean
  version?: string
}

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq }

let initPromise: Promise<boolean> | null = null

async function fetchPixelId(): Promise<string | null> {
  const { data } = await supabase
    .from('global_settings')
    .select('setting_value')
    .eq('setting_key', 'meta_pixel_id')
    .maybeSingle()
  const id = (data?.setting_value ?? '').trim()
  return id || null
}

function injectScript(): Promise<void> {
  const w = window as PixelWindow
  if (w.fbq) return Promise.resolve()
  const n = function (...args: unknown[]) {
    n.callMethod ? n.callMethod.apply(n, args) : n.queue!.push(args)
  } as Fbq
  n.queue = []
  n.loaded = true
  n.version = '2.0'
  w.fbq = n
  w._fbq = n
  return new Promise(resolve => {
    const t = document.createElement('script')
    t.async = true
    t.src = 'https://connect.facebook.net/en_US/fbevents.js'
    // An ad blocker must never hold up the page — resolve either way and
    // let the calls queue harmlessly.
    t.onload = () => resolve()
    t.onerror = () => resolve()
    document.head.appendChild(t)
  })
}

/** Loads + inits the pixel once per page. Resolves false if not configured. */
export function initPixel(): Promise<boolean> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const id = await fetchPixelId()
    if (!id) return false
    await injectScript()
    const w = window as PixelWindow
    if (!w.fbq) return false
    w.fbq('init', id)
    w.fbq('track', 'PageView')
    return true
  })()
  return initPromise
}

/** Fires a standard event. Safe to call before or without init. */
export async function pixelTrack(event: string, params?: Record<string, unknown>) {
  const ready = await initPixel()
  if (!ready) return
  const w = window as PixelWindow
  w.fbq?.('track', event, params ?? {})
}
