import { X, Copy, ExternalLink, Check, Navigation, MapPin } from 'lucide-react'
import { useState } from 'react'
import { supabase, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { perkBranches, branchMapUrl, type PerkBranch } from '../utils/perkBranches'

type Props = {
  perk: PartnerPerk
  onClose: () => void
}

export default function PerkDetailsModal({ perk, onClose }: Props) {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  const branches = perkBranches(perk.branches)

  async function trackAction(action: 'view' | 'copy_code' | 'visit_link' | 'navigate') {
    await supabase.from('perk_analytics').insert({
      perk_id: perk.id,
      user_id: user?.id ?? null,
      action_type: action,
    })
  }

  async function handleCopy() {
    if (!perk.discount_code) return
    await navigator.clipboard.writeText(perk.discount_code)
    setCopied(true)
    await trackAction('copy_code')
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleVisit() {
    if (!perk.action_link) return
    await trackAction('visit_link')
    window.open(perk.action_link, '_blank', 'noopener')
  }

  function handleNavigate(branch: PerkBranch) {
    const url = branchMapUrl(branch)
    if (!url) return
    // Open first, track afterwards: Safari blocks a window.open that runs
    // after an await, and losing her tap is worse than losing the stat.
    window.open(url, '_blank', 'noopener')
    void trackAction('navigate')
  }

  // The sheet sits ABOVE the bottom nav (z-50) rather than under it. While it
  // shared z-50 the nav painted over the last rows and swallowed whatever sat
  // there: the third branch, the discount code.
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The extra bottom padding keeps the last button clear of the iPhone
            home indicator now that the sheet reaches the screen edge. */}
        <div
          className="p-5 pt-3 space-y-4"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          {/* Logo + Partner name */}
          <div className="flex items-center gap-4">
            {perk.logo_url ? (
              <img
                src={perk.logo_url}
                alt={perk.partner_name}
                className="w-16 h-16 rounded-2xl object-contain bg-sand-50 p-2"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-mustard-100 flex items-center justify-center text-2xl">
                🎁
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-sand-800">{perk.partner_name}</h2>
              {perk.short_description && (
                <p className="text-sm text-sand-500">{perk.short_description}</p>
              )}
            </div>
          </div>

          {/* Full description */}
          {perk.full_description && (
            <div className="bg-sand-50 rounded-2xl p-4">
              <p className="text-sm text-sand-700 leading-relaxed">{perk.full_description}</p>
            </div>
          )}

          {/* Branches: tap one to navigate there. A partner with three
              cafes should not force her to copy an address by hand. */}
          {branches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#7B604C' }}>
                <MapPin className="w-3.5 h-3.5" style={{ color: '#A35C3D' }} />
                {branches.length > 1 ? 'הסניפים המשתתפים' : 'המיקום'}
              </p>
              {branches.map((b, i) => {
                const url = branchMapUrl(b)
                return (
                  <button
                    key={i}
                    onClick={() => handleNavigate(b)}
                    disabled={!url}
                    className="w-full flex items-center justify-between gap-3 rounded-2xl p-3 text-right transition-all hover:shadow-md disabled:opacity-60"
                    style={{ background: '#FAF7F1' }}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#443327' }}>
                        {b.name || b.address}
                      </p>
                      {b.name && b.address && (
                        <p className="text-xs truncate" style={{ color: '#7B604C' }}>{b.address}</p>
                      )}
                    </div>
                    {url && (
                      <span
                        className="flex items-center gap-1 flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white"
                        style={{ background: '#A35C3D' }}
                      >
                        <Navigation className="w-3.5 h-3.5" /> ניווט
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Discount code */}
          {perk.discount_code && (
            <div className="bg-mustard-50 border-2 border-dashed border-mustard-200 rounded-2xl p-4">
              <p className="text-xs text-mustard-600 font-medium mb-2">קוד הנחה</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xl font-bold tracking-widest text-mustard-700">
                  {perk.discount_code}
                </span>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                    copied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-mustard-500 text-white hover:bg-mustard-600'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'הועתק!' : 'העתיקי'}
                </button>
              </div>
            </div>
          )}

          {/* Visit link */}
          {perk.action_link && (
            <button
              onClick={handleVisit}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-mustard-500 to-mustard-600 hover:from-mustard-600 hover:to-mustard-700 text-white font-semibold py-3.5 px-6 rounded-2xl transition-all shadow-lg"
            >
              <ExternalLink className="w-4 h-4" />
              לאתר השותף
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
