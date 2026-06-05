import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { type CustomerKey } from './customerLookup'
import CustomerCardModal from './CustomerCardModal'

// Phase 5 / A2 Part 3: a tiny provider that any admin descendant can
// reach via useOpenCustomer() to summon the customer card. The card
// is rendered once at the provider root so opening / closing is a
// state flip rather than a portal mount.

type OpenCustomerFn = (key: CustomerKey) => void

const OpenCustomerContext = createContext<OpenCustomerFn | null>(null)

export function CustomerCardProvider({ children }: { children: ReactNode }) {
  const [openKey, setOpenKey] = useState<CustomerKey | null>(null)
  const open = useCallback((key: CustomerKey) => {
    // Bail when there's nothing to look up — keeps the modal from
    // showing an empty "no matches" view from a noop click.
    if (!key.phone && !key.email) return
    setOpenKey(key)
  }, [])
  const close = useCallback(() => setOpenKey(null), [])

  // Stable ref to a state-flip — never re-renders the descendants
  // unless the function identity changes (it won't).
  const value = useMemo(() => open, [open])

  return (
    <OpenCustomerContext.Provider value={value}>
      {children}
      {openKey && <CustomerCardModal initialKey={openKey} onClose={close} />}
    </OpenCustomerContext.Provider>
  )
}

// Returns a no-op when not under a provider — admin code can call
// this unconditionally and just nothing will happen outside admin.
export function useOpenCustomer(): OpenCustomerFn {
  const fn = useContext(OpenCustomerContext)
  return fn ?? (() => {})
}
