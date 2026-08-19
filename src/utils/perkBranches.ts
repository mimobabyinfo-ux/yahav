// Brenda 19.8.26: partner businesses have branches — the cafe has three —
// and a mom standing in the app should be able to tap one and be navigated
// there. Branches live on the perk as jsonb, so the shape that comes back
// from the DB is whatever was written there; parse defensively and never let
// a malformed row break the benefits page.
//
// One helper file because three surfaces show branches (perk modal,
// membership card, benefits card) and they must agree on what a branch is
// and where tapping it leads.

export type PerkBranch = {
  /** What the mom sees: "רש\"י", "רוקח", "שנקר". */
  name: string
  /** Where we navigate to when there is no explicit link. */
  address?: string | null
  /** Optional override — a Waze / Google Maps link Brenda pasted. */
  link?: string | null
}

/** Read the jsonb column into a clean list. Anything unusable is dropped. */
export function perkBranches(raw: unknown): PerkBranch[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map(b => ({
      name: typeof b.name === 'string' ? b.name.trim() : '',
      address: typeof b.address === 'string' ? b.address.trim() : '',
      link: typeof b.link === 'string' ? b.link.trim() : '',
    }))
    // A branch with neither a name nor somewhere to go is noise.
    .filter(b => b.name || b.address || b.link)
}

/** Make a pasted link openable even when she left off the https://. */
function normalizeLink(link: string): string {
  if (/^https?:\/\//i.test(link)) return link
  return `https://${link}`
}

/**
 * Where tapping this branch should take her. An explicit link wins; otherwise
 * we hand the address to Google Maps, which opens the native maps app on a
 * phone and offers navigation from there.
 */
export function branchMapUrl(branch: PerkBranch): string | null {
  if (branch.link) return normalizeLink(branch.link)
  if (branch.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`
  }
  // Only a name — better than nothing: search for the business by name.
  if (branch.name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.name)}`
  }
  return null
}

/** "3 סניפים" / "סניף אחד" — for the small chip on a perk card. */
export function branchCountLabel(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return 'סניף אחד'
  return `${count} סניפים`
}
