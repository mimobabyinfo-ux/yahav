// Deterministic, non-cryptographic string hash (djb2). Used by the daily-tip
// selection to pick a stable tip per day per child without server-side
// randomness or random-mid-render flicker.
//
// Returns a non-negative 32-bit-ish integer. Same input → same output, every
// runtime. Distribution is "good enough" for picking one item out of dozens.

export function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    // (h * 33) + c, but using shifts + ANDing into 32 bits to avoid
    // float drift on long inputs.
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
