import { useEffect, useState } from 'react'
import { PlayCircle, BookOpen, Check, X as XIcon, Infinity as InfinityIcon, Smartphone, Clock } from 'lucide-react'
import { supabase, Workshop } from '../../lib/supabase'

/**
 * The sales page for a digital course — rendered ABOVE the registration
 * form on ?register=<course id>, so the ad lands on one page that sells
 * and collects in the same scroll.
 *
 * Why here and not on lp.mimo-baby.co.il: the form stores a pending lead
 * id in localStorage, and the thank-you page reads it back. Those are
 * different origins, so a form on the marketing site would hand the app a
 * buyer it cannot identify. One page, one origin, one fewer click.
 *
 * Every word is editable in global_settings (course_lp_*) so Brenda can
 * rewrite the page without a deploy. The module list is NOT editable copy —
 * it is read from the course's own content, so it can never drift from
 * what she actually gets.
 */

type Props = { workshop: Workshop; onCta: () => void }

const DEFAULTS: Record<string, string> = {
  course_lp_hero_title: 'התינוק שלך בוכה ואת לא יודעת אם זה גזים',
  course_lp_hero_sub: 'יש משהו שאת יכולה לעשות עם הידיים שלך.',
  course_lp_pain: '',
  course_lp_about: '',
  course_lp_for_you: '',
  course_lp_not_for_you: '',
  course_lp_guarantee: '',
  course_lp_testimonials: '',
}

function lines(v: string): string[] {
  return v.split('\n').map(s => s.trim()).filter(Boolean)
}

export default function CourseSalesSections({ workshop, onCta }: Props) {
  const [s, setS] = useState<Record<string, string>>(DEFAULTS)
  const [modules, setModules] = useState<{ name: string; videos: number; reads: number }[]>([])

  useEffect(() => {
    supabase.from('global_settings')
      .select('setting_key, setting_value')
      .like('setting_key', 'course_lp_%')
      .then(({ data }) => {
        const map = { ...DEFAULTS }
        for (const r of (data ?? []) as { setting_key: string; setting_value: string }[]) {
          if (r.setting_value) map[r.setting_key] = r.setting_value
        }
        setS(map)
      })
  }, [])

  useEffect(() => {
    supabase.from('workshop_content')
      .select('section, type, display_order')
      .eq('workshop_id', workshop.id)
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }) => {
        const out: { name: string; videos: number; reads: number }[] = []
        for (const c of (data ?? []) as { section: string | null; type: string }[]) {
          const name = (c.section ?? '').trim()
          if (!name) continue
          const last = out[out.length - 1]
          const row = last && last.name === name ? last : (out.push({ name, videos: 0, reads: 0 }), out[out.length - 1])
          if (c.type === 'video') row.videos++
          else row.reads++
        }
        setModules(out)
      })
  }, [workshop.id])

  const lessonCount = modules.reduce((n, m) => n + m.videos + m.reads, 0)
  const videoCount = modules.reduce((n, m) => n + m.videos, 0)
  const testimonials = lines(s.course_lp_testimonials)

  return (
    <div className="space-y-5 mb-6">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        {workshop.image_url && (
          <img src={workshop.image_url} alt="" className="w-full h-48 object-cover" />
        )}
        <div className="p-5 space-y-3 text-center">
          <h2 className="text-2xl font-bold leading-tight" style={{ color: '#3D2E20' }}>
            {s.course_lp_hero_title}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#6E5836' }}>
            {s.course_lp_hero_sub}
          </p>
          <p className="text-sm font-bold" style={{ color: '#8A6A2F' }}>
            {workshop.title}
          </p>

          <button onClick={onCta}
            className="w-full py-4 rounded-2xl font-bold text-base text-[#4A3A28]"
            style={{ background: '#E7C78A' }}>
            לרכישה · {workshop.price != null ? `${workshop.price} ₪` : 'להרשמה'} ←
          </button>

          <div className="flex items-center justify-center gap-3 pt-1 flex-wrap">
            {[
              { icon: <Clock className="w-3.5 h-3.5" />, t: 'גישה מיידית' },
              { icon: <Smartphone className="w-3.5 h-3.5" />, t: 'מהטלפון' },
              { icon: <InfinityIcon className="w-3.5 h-3.5" />, t: 'שלך לתמיד' },
            ].map(x => (
              <span key={x.t} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#8A8370' }}>
                {x.icon}{x.t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── The pain ─────────────────────────────────────────────────────── */}
      {s.course_lp_pain && (
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <p className="text-sm leading-loose whitespace-pre-line" style={{ color: '#4A3A28' }}>
            {s.course_lp_pain}
          </p>
        </div>
      )}

      {/* ── What is inside — straight from the course itself ─────────────── */}
      {modules.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-base mb-1" style={{ color: '#3D2E20' }}>מה יש בפנים</h3>
          <p className="text-xs mb-3" style={{ color: '#8A8370' }}>
            {lessonCount} שיעורים · {videoCount} סרטוני וידאו
          </p>
          <div className="space-y-1.5">
            {modules.map((m, i) => (
              <div key={`${m.name}-${i}`} className="flex items-center gap-2.5 rounded-2xl p-3"
                style={{ background: '#FDF8EE' }}>
                {m.videos > 0
                  ? <PlayCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#C8A460' }} />
                  : <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: '#A2937D' }} />}
                <span className="text-sm font-semibold flex-1" style={{ color: '#4A3A28' }}>{m.name}</span>
                <span className="text-[11px] flex-shrink-0" style={{ color: '#A2937D' }}>
                  {m.videos > 0 ? `${m.videos} סרטון${m.videos > 1 ? 'ים' : ''}` : 'לקריאה'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-base mb-3" style={{ color: '#3D2E20' }}>מה אמהות מספרות</h3>
          <div className="grid grid-cols-2 gap-2">
            {testimonials.slice(0, 4).map(src => (
              <img key={src} src={src} alt="" loading="lazy"
                className="w-full rounded-2xl border" style={{ borderColor: '#EFE8DC' }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Who it is for ────────────────────────────────────────────────── */}
      {(s.course_lp_for_you || s.course_lp_not_for_you) && (
        <div className="bg-white rounded-3xl shadow-sm p-5 space-y-4">
          {s.course_lp_for_you && (
            <div>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#2E7D32' }}>זה בשבילך אם</h3>
              <ul className="space-y-1.5">
                {lines(s.course_lp_for_you).map(l => (
                  <li key={l} className="flex items-start gap-2 text-sm" style={{ color: '#4A3A28' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#2E7D32' }} />
                    <span className="leading-relaxed">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.course_lp_not_for_you && (
            <div>
              <h3 className="font-bold text-sm mb-2" style={{ color: '#8A5A5A' }}>זה לא בשבילך אם</h3>
              <ul className="space-y-1.5">
                {lines(s.course_lp_not_for_you).map(l => (
                  <li key={l} className="flex items-start gap-2 text-sm" style={{ color: '#6E5836' }}>
                    <XIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C08A8A' }} />
                    <span className="leading-relaxed">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Who teaches ──────────────────────────────────────────────────── */}
      {s.course_lp_about && (
        <div className="bg-white rounded-3xl shadow-sm p-5">
          <h3 className="font-bold text-base mb-2" style={{ color: '#3D2E20' }}>מי מלמדת</h3>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#4A3A28' }}>
            {s.course_lp_about}
          </p>
        </div>
      )}

      {/* ── Guarantee — only if Brenda decided there is one ───────────────── */}
      {s.course_lp_guarantee && (
        <div className="rounded-3xl p-5 text-center"
          style={{ background: '#FDF3E3', border: '1px solid #E7C78A' }}>
          <p className="text-sm font-semibold leading-relaxed whitespace-pre-line" style={{ color: '#6E5836' }}>
            {s.course_lp_guarantee}
          </p>
        </div>
      )}

      {/* ── The close, right above the form ───────────────────────────────── */}
      <div className="text-center px-2">
        <p className="text-lg font-bold" style={{ color: '#3D2E20' }}>
          {workshop.price != null ? `${workshop.price} ₪. פעם אחת. שלך לתמיד.` : 'להרשמה'}
        </p>
        <p className="text-xs mt-1" style={{ color: '#8A8370' }}>
          בלי מנוי, בלי חידוש, בלי תאריך תפוגה. משאירה פרטים, משלמת, ונכנסת לקורס.
        </p>
      </div>
    </div>
  )
}
