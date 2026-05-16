// Silent auto-detection of sleep_type from when a sleep started.
//
// Rule (per product spec, Phase 3 / C1 follow-up):
//   start hour ∈ [19, 24) ∪ [0, 7) → 'night'
//   start hour ∈ [7, 19)           → 'nap'
//
// Always derive from the START time, never from the save time. A nap that
// began at 18:55 and ended at 19:10 is still a nap.
//
// No UI toggle exists — moms don't need to think about it. Edge-case
// overrides (e.g. an early-evening sleep mom wants counted as a nap)
// will be possible via entry-edit once that lands in C7.
//
// Future use: the visual treatment in C3 Day-view and the nap/night
// breakdown chart in C6 also call this helper.

export function sleepTypeFromStartTime(startTime: Date): 'nap' | 'night' {
  const hour = startTime.getHours()
  return hour >= 19 || hour < 7 ? 'night' : 'nap'
}
