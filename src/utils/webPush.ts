import { supabase } from '../lib/supabase'

// Web Push, client side: ask, subscribe, remember.
//
// The VAPID public key is public by design — it is sent to the push
// service on every subscribe and is visible in any browser's network
// tab. The PRIVATE half lives only as a Supabase edge-function secret.
export const VAPID_PUBLIC_KEY =
  'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'

export type PushState =
  | 'unsupported'   // the browser has no push at all
  | 'needs-install' // iOS: push only exists once added to the home screen
  | 'denied'        // she said no; only her browser settings can undo it
  | 'off'           // supported, allowed to ask, not subscribed
  | 'on'            // subscribed

// Returns a plain ArrayBuffer: TS types applicationServerKey as
// BufferSource over a non-shared ArrayBuffer, and a Uint8Array's buffer
// is ArrayBufferLike, which doesn't satisfy it.
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS 13+ reports as a Mac; a touch-capable "Mac" is an iPad.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export async function getPushState(): Promise<PushState> {
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // On iOS the whole push API is simply absent until the app is on the
  // home screen — so "unsupported" there means "not installed yet",
  // which is a very different message to show a person.
  if (!hasApi) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Ask, subscribe, and store. Must be called from a user gesture. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
  })

  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: bufToBase64Url(sub.getKey('p256dh')),
    p_auth: bufToBase64Url(sub.getKey('auth')),
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) {
    console.error('[push] saving the subscription failed:', error)
    // Don't leave a browser subscribed to a server that doesn't know
    // about it — that produces silence that looks like a bug.
    await sub.unsubscribe().catch(() => {})
    return 'off'
  }
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe().catch(() => {})
  }
  return 'off'
}
