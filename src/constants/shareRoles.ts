// Phase 4 / C1: the 5 family roles a mom can assign to a share invite.
// Matches the CHECK constraint on family_invite_tokens.role and
// user_profiles.family_role from migration 20260603000000.

export type ShareRole = 'father' | 'grandma' | 'grandpa' | 'aunt' | 'nanny'

export type ShareRoleDef = {
  id: ShareRole
  label: string  // Hebrew label shown in chips + greetings
  emoji: string
}

export const SHARE_ROLES: ShareRoleDef[] = [
  { id: 'father',  label: 'אבא',    emoji: '👨' },
  { id: 'grandma', label: 'סבתא',   emoji: '👵' },
  { id: 'grandpa', label: 'סבא',    emoji: '👴' },
  { id: 'aunt',    label: 'דודה',   emoji: '👩' },
  { id: 'nanny',   label: 'מטפלת',  emoji: '👩‍⚕️' },
]

export function roleDef(id: ShareRole | null | undefined): ShareRoleDef | null {
  if (!id) return null
  return SHARE_ROLES.find(r => r.id === id) ?? null
}

// Hebrew possessive label: "אבא של יגדי", "סבתא של יגדי", etc. The שם of
// the baby is interpolated by the caller. Returns the role label alone
// when babyName is missing.
export function roleOfBabyLabel(role: ShareRole | null | undefined, babyName: string | null | undefined): string {
  const def = roleDef(role)
  if (!def) return ''
  if (!babyName) return def.label
  return `${def.label} של ${babyName}`
}
