import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './program.css'
import App from './App.tsx'

// ── Serving the build that was actually deployed ──────────────────────
//
// Brenda 18.8.26: "when I open the app it first says מרכז… and only then
// בית עוטף ומלטף."
//
// That string is not in the app any more, and the tagline in the
// database is correct — so what she was reading was the PREVIOUS build,
// served out of the service worker's precache. The generated worker
// installs the new version and takes over (skipWaiting + clientsClaim),
// but nothing tells the page already on screen, so she kept looking at
// yesterday's HTML and JS until she happened to close and reopen the
// tab. Every deploy behaved this way; the tagline is just the change
// that was visible enough to notice.
//
// `controllerchange` fires the moment the new worker takes control. One
// reload then, and only then, puts her on the build that was deployed.
// The hadController guard is what stops the very first visit — where the
// same event fires because there was no worker at all — from reloading a
// page that is already current.
// The reload WAITS until she comes BACK to the screen. A deploy can land
// at any moment of any day, and a reload is a hard reset of everything
// typed but not yet saved — half an onboarding form, a bottle she is in
// the middle of logging. So a new worker taking over only arms the
// reload; it fires when the tab becomes visible again.
//
// 17.9.26 (טל מרום): the reload used to fire the moment the tab went to
// the BACKGROUND. On an iPhone, tapping "אני מגיעה!" on a paid event
// opens the payment tab, which backgrounds the app tab — so the armed
// reload fired right there, in the same tap, and killed the
// register_for_event request before it left the phone. She saw a blank
// screen, then the home screen, and the server never heard from her
// (13 times in one evening, zero registrations). Reloading on RETURN
// loses nothing more than reloading on leave did, and cannot interrupt
// an action that is what took her away.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  let pending = false

  function reloadNow() {
    if (reloading) return
    reloading = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    pending = true
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (pending) { reloadNow(); return }
    // A PWA on a phone is rarely closed, only backgrounded. Ask for a new
    // worker whenever she comes back to it, so "open the app tomorrow"
    // picks up today's deploy instead of waiting for a cold start.
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
