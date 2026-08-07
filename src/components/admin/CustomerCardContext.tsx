import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { type CustomerKey } from './customerLookup'
import CustomerCardModal from './CustomerCardModal'

// Phase 5 / A2 Part 3: a tiny provider that any admin descendant can
// reach via useOpenCustomer() to summon the customer card. The card
// is rendered once at the provider root so opening / closing is a
// state flip rather than a portal mount.
//
// Design handoff phase 5: the card is now a SIDE PANEL, and callers
// that hold an ordered list (e.g. the registrations list) can pass it
// so the panel's ‹ › arrows move between people without going back.

export type CustomerNav = { list: CustomerKey[]; index: number }

type OpenCustomerFn = (key: CustomerKey, nav?: CustomerNav) => void

const OpenCustomerContext = createContext<OpenCustomerFn | null>(null)

export function CustomerCardProvider({ children }: { children: ReactNode }) {
  const [openKey, setOpenKey] = useState<CustomerKey | null>(null)
  const [nav, setNav] = useState<CustomerNav | null>(null)

  const open = useCallback((key: CustomerKey, navCtx?: CustomerNav) => {
    // Bail when there's nothing to look up — keeps the panel from
    // showing an empty "no matches" view from a noop click.
    if (!key.phone && !key.email) return
    setOpenKey(key)
    setNav(navCtx ?? null)
  }, [])
  const close = useCallback(() => { setOpenKey(null); setNav(null) }, [])

  const navigate = useCallback((delta: number) => {
    setNav(cur => {
      if (!cur) return cur
      const next = Math.min(cur.list.length - 1, Math.max(0, cur.index + delta))
      if (next === cur.index) return cur
      setOpenKey(cur.list[next])
      return { ...cur, index: next }
    })
  }, [])

  // Stable ref to a state-flip — never re-renders the descendants
  // unless the function identity changes (it won't).
  const value = useMemo(() => open, [open])

  return (
    <OpenCustomerContext.Provider value={value}>
      {children}
      {openKey && (
        <CustomerCardModal
          initialKey={openKey}
          onClose={close}
          nav={nav ? { index: nav.index, total: nav.list.length } : undefined}
          onNavigate={navigate}
        />
      )}
    </OpenCustomerContext.Provider>
  )
}

// Returns a no-op when not under a provider — admin code can call
// this unconditionally and just nothing will happen outside admin.
export function useOpenCustomer(): OpenCustomerFn {
  const fn = useContext(OpenCustomerContext)
  return fn ?? (() => {})
}
