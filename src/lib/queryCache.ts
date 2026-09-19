// ── Small stale-while-revalidate cache for reads that rarely change ────
//
// יהב 19.9.26: "לפעמים לוקח זמן לדפים להיטען". App.tsx remounts a page on
// every tab switch (<div key={currentPage}>), so each visit to the home
// screen or the community fetched the same settings, age guide, perks,
// announcements and events again — from a database in ap-northeast-1,
// at ~500ms a round trip from Israel. Nothing on those lists changes
// between two taps.
//
// This keeps the last answer in memory (and mirrors it to sessionStorage,
// so a reload inside the same tab starts warm). A component that asks
// again gets the cached rows at once and, when they are older than
// `ttlMs`, a background refetch that updates it in place. The cache is
// per tab and dies with it; it is cleared on sign-out so a shared phone
// never shows one person's rows to the next (see clearQueryCache).
//
// It is NOT for rows that belong to the person and change under her
// hands (the journal, timers, registrations). Those keep their own fetch.

type Entry<T> = { at: number; data: T }

const mem = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
const SS_PREFIX = 'mimo_qc:'

function readSS<T>(key: string): Entry<T> | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key)
    if (!raw) return null
    const e = JSON.parse(raw) as Entry<T>
    if (!e || typeof e.at !== 'number') return null
    return e
  } catch { return null }
}

function writeSS(key: string, e: Entry<unknown>) {
  try { sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(e)) } catch { /* quota / private mode */ }
}

/** The cached value, if any, without fetching. */
export function peekQuery<T>(key: string): T | undefined {
  const m = mem.get(key) as Entry<T> | undefined
  if (m) return m.data
  const s = readSS<T>(key)
  if (s) { mem.set(key, s); return s.data }
  return undefined
}

/**
 * Resolve `key` to data: cached when fresh enough, otherwise fetched.
 * Concurrent callers for the same key share one request.
 */
export async function cachedQuery<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
  const hit = (mem.get(key) as Entry<T> | undefined) ?? readSS<T>(key)
  if (hit) {
    if (!mem.has(key)) mem.set(key, hit)
    // Stale: answer from the cache now, refresh behind it. The next mount
    // (a tab switch is one) gets the fresh rows.
    if (Date.now() - hit.at >= ttlMs) revalidate(key, fetcher).catch(() => {})
    return hit.data
  }
  return revalidate(key, fetcher)
}

async function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined
  if (running) return running
  const p = fetcher().then(data => {
    const e = { at: Date.now(), data }
    mem.set(key, e)
    writeSS(key, e)
    return data
  }).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Drop one key (after a write that makes it stale) or everything (sign-out). */
export function invalidateQuery(key: string) {
  mem.delete(key)
  try { sessionStorage.removeItem(SS_PREFIX + key) } catch { /* ignore */ }
}

export function invalidateQueryPrefix(prefix: string) {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) invalidateQuery(k)
  try {
    const gone: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(SS_PREFIX + prefix)) gone.push(k)
    }
    gone.forEach(k => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}

export function clearQueryCache() {
  mem.clear()
  try {
    const gone: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(SS_PREFIX)) gone.push(k)
    }
    gone.forEach(k => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
