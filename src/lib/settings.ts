import { supabase } from './supabase'
import { cachedQuery } from './queryCache'

// global_settings, read once. Before 19.9.26 the home screen alone asked
// for it three times per open (owner WhatsApp, show_home_perks, referral
// on/off), each a separate round trip for a row or two out of a 1.4 KB
// table that every role may read. One cached fetch of the whole table
// serves them all; five minutes is far below how often Brenda edits it.

export type SettingsMap = Record<string, string>

const KEY = 'global_settings'
export const SETTINGS_TTL_MS = 5 * 60_000

export function getSettings(): Promise<SettingsMap> {
  return cachedQuery<SettingsMap>(KEY, async () => {
    const { data } = await supabase.from('global_settings').select('setting_key, setting_value')
    const map: SettingsMap = {}
    for (const r of (data ?? []) as { setting_key: string; setting_value: string | null }[]) {
      if (r.setting_value != null) map[r.setting_key] = r.setting_value
    }
    return map
  }, SETTINGS_TTL_MS)
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await getSettings())[key]
}
