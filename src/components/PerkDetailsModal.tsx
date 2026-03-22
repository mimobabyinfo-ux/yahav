import { X, Copy, ExternalLink, Check } from 'lucide-react'
import { useState } from 'react'
import { supabase, PartnerPerk } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Props = {
  perk: PartnerPerk
  onClose: () => void
}

export default function PerkDetailsModal({ perk, onClose }: Props) {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)

  async function trackAction(action: 'view' | 'copy_code' | 'visit_link') {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-sand-100 text-sand-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 pt-3 space-y-4">
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
