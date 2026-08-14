import { supabase } from '../lib/supabase'

/**
 * Course video URLs, signed and short-lived.
 *
 * The lesson videos used to be served from a PUBLIC storage bucket. That
 * meant any buyer could right-click a lesson, copy the address, and paste
 * it into a WhatsApp group — where it worked forever, for anyone, with no
 * account. The login side of the course was never the leak; this was.
 *
 * A signed URL is generated at play time and dies after an hour. It cannot
 * stop a screen recording — nothing can — but it turns "copy a link" into
 * real effort, which at this price point is the whole game.
 *
 * Safe either way: if the bucket is still public, or signing fails for any
 * reason, the original URL is returned and playback is unaffected. That
 * lets the app ship BEFORE the bucket is locked down, with no window where
 * a paying mother sees a broken video.
 */

const SIGNED_TTL_SECONDS = 60 * 60

/** Matches .../storage/v1/object/public/<bucket>/<path...> */
const PUBLIC_OBJECT = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

// Signing costs a round trip; the same lesson re-opened should not pay it
// twice. Keyed by URL, dropped a minute before the signature expires.
const cache = new Map<string, { url: string; expires: number }>()

export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(PUBLIC_OBJECT)
  if (!m) return null
  try {
    return { bucket: m[1], path: decodeURIComponent(m[2].split('?')[0]) }
  } catch {
    return { bucket: m[1], path: m[2].split('?')[0] }
  }
}

/**
 * Returns a signed URL for a Supabase storage object, or the input URL
 * unchanged when it is not one (an external link, a YouTube embed) or when
 * signing is not possible.
 */
export async function signedMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null

  const now = Date.now()
  const hit = cache.get(url)
  if (hit && hit.expires > now) return hit.url

  const parsed = parseStorageUrl(url)
  if (!parsed) return url

  try {
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_TTL_SECONDS)
    if (error || !data?.signedUrl) {
      // Bucket still public, or she genuinely has no rights — either way,
      // let the original URL decide. A public bucket keeps working; a
      // locked one will simply refuse, which is the correct outcome.
      return url
    }
    cache.set(url, { url: data.signedUrl, expires: now + (SIGNED_TTL_SECONDS - 60) * 1000 })
    return data.signedUrl
  } catch {
    return url
  }
}
