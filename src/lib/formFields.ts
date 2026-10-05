// Shared helpers for form fields: multi-select answers and conditional
// visibility (showIf). Answers are stored as strings keyed by field label;
// a multi-select answer is the chosen options joined by MULTI_SEP.

export type FormShowIf = { field: string; equals: string }

export const MULTI_SEP = ' | '

export function multiSelected(current: string | undefined | null): string[] {
  return (current ?? '').split(MULTI_SEP).map(s => s.trim()).filter(Boolean)
}

export function toggleMulti(current: string | undefined, opt: string, max?: number): string {
  const arr = multiSelected(current)
  if (arr.includes(opt)) return arr.filter(o => o !== opt).join(MULTI_SEP)
  if (max && max > 0 && arr.length >= max) return arr.join(MULTI_SEP)
  return [...arr, opt].join(MULTI_SEP)
}

/** A field with showIf is visible only when the controlling field's answer includes `equals`. */
export function isFieldVisible(field: { showIf?: FormShowIf | null }, answers: Record<string, string>): boolean {
  const cond = field.showIf
  if (!cond || !cond.field) return true
  return multiSelected(answers[cond.field]).includes(cond.equals)
}

/** Drop answers of fields that are currently hidden, so branching questions never leak stale answers. */
export function visibleAnswers<F extends { label: string; showIf?: FormShowIf | null }>(fields: F[], answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    if (isFieldVisible(f, answers) && answers[f.label] !== undefined) out[f.label] = answers[f.label]
  }
  return out
}
