import { useEffect, useState } from 'react'
import { PlayCircle, BookOpen, Check, X as XIcon, Infinity as InfinityIcon, Smartphone, Sparkles } from 'lucide-react'
import { supabase, Workshop } from '../../lib/supabase'
import MimoDuck from '../MimoDuck'
import MimoLeaf from '../MimoLeaf'

/**
 * The sales page for a digital course — rendered ABOVE the registration
 * form on ?register=<course id>, so the ad lands on one page that sells
 * and collects in the same scroll.
 *
 * Why here and not on lp.mimo-baby.co.il: the form stores a pending lead
 * id in localStorage and the thank-you page reads it back. Those are
 * different origins, so a form on the marketing site would hand the app a
 * buyer it cannot identify. One page, one origin, one fewer click.
 *
 * Dressed in the brand book, not in generic app chrome: the duck pair, the
 * botanical sprigs, and the seven named colours (rojo tierra, arena, verde
 * musgo, celeste, rosa polvo, amarillo patito, beige). A woman arriving
 * from an ad has never seen Mimo before — this page is the first
 * impression, so it should look like Brenda and not like a form.
 *
 * All copy lives in global_settings (course_lp_*) so Brenda can rewrite
 * any word without a deploy. The module list is NOT copy — it is read from
 * the course's own content, so the page can never promise a lesson that
 * does not exist.
 */

type Props = { workshop: Workshop; onCta: () => void }

const C = {
  clay:   '#A35C3D',   // rojo tierra
  arena:  '#C6BDA0',
  moss:   '#818267',   // verde musgo
  sky:    '#C3CDD2',   // celeste
  blush:  '#EADBDD',   // rosa polvo
  duck:   '#E7C78A',   // amarillo patito
  beige:  '#DCD4C8',
  ink:    '#3D2E20',
  inkSoft:'#6E5836',
}

const DEFAULTS: Record<string, string> = {
  course_lp_hero_title: '',
  course_lp_hero_sub: '',
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

/** Section shell — one card style for the whole page. */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-3xl p-5 ${className}`}
      style={{ boxShadow: '0 2px 16px rgba(61,46,32,0.06)' }}>
      {children}
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display font-bold text-lg mb-3" style={{ color: C.ink }}>{children}</h3>
  )
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
          const row = last && last.name === name
            ? last
            : (out.push({ name, videos: 0, reads: 0 }), out[out.length - 1])
          if (c.type === 'video') row.videos++
          else row.reads++
        }
        setModules(out)
      })
  }, [workshop.id])

  const lessonCount = modules.reduce((n, m) => n + m.videos + m.reads, 0)
  const videoCount = modules.reduce((n, m) => n + m.videos, 0)
  const testimonials = lines(s.course_lp_testimonials)
  const ageLine = workshop.age_range_start_months != null && workshop.age_range_end_months != null
    ? `מגיל לידה ועד ${workshop.age_range_end_months} חודשים`
    : null

  const Cta = ({ label }: { label: string }) => (
    <button onClick={onCta}
      className="w-full py-4 rounded-2xl font-bold text-base transition-transform active:scale-[0.98]"
      style={{ background: C.duck, color: '#4A3A28', boxShadow: '0 4px 14px rgba(231,199,138,0.5)' }}>
      {label}
    </button>
  )

  return (
    <div className="space-y-4 mb-6">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${C.blush} 0%, #FFFFFF 55%, ${C.beige} 100%)` }}>

        {/* Botanicals, quiet, behind everything */}
        <MimoLeaf variant="sky-1" size={110} rotate={-18}
          style={{ position: 'absolute', top: -18, left: -26, opacity: 0.5, pointerEvents: 'none' }} />
        <MimoLeaf variant="sand-2" size={92} rotate={140}
          style={{ position: 'absolute', bottom: -14, right: -20, opacity: 0.45, pointerEvents: 'none' }} />

        {workshop.image_url && (
          <img src={workshop.image_url} alt=""
            className="w-full h-52 object-cover" style={{ borderRadius: '24px 24px 0 0' }} />
        )}

        <div className="relative p-6 text-center space-y-3">
          {!workshop.image_url && (
            <div className="flex justify-center mb-1">
              <MimoDuck size={92} variant="family" />
            </div>
          )}

          {ageLine && (
            <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full"
              style={{ background: '#FFFFFF', color: C.moss }}>
              👶🏼 {ageLine}
            </span>
          )}

          <h2 className="font-display font-bold leading-tight" style={{ fontSize: 27, color: C.ink }}>
            {s.course_lp_hero_title}
          </h2>

          <p className="text-[15px] leading-relaxed" style={{ color: C.inkSoft }}>
            {s.course_lp_hero_sub}
          </p>

          <p className="text-sm font-bold pt-1" style={{ color: C.clay }}>
            {workshop.title}
          </p>

          <Cta label={`לרכישה · ${workshop.price != null ? `${workshop.price} ₪` : 'להרשמה'} ←`} />

          <div className="flex items-center justify-center gap-4 pt-1 flex-wrap">
            {[
              { icon: <Sparkles className="w-3.5 h-3.5" />, t: 'גישה מיידית' },
              { icon: <Smartphone className="w-3.5 h-3.5" />, t: 'מהטלפון' },
              { icon: <InfinityIcon className="w-3.5 h-3.5" />, t: 'שלך לתמיד' },
            ].map(x => (
              <span key={x.t} className="flex items-center gap-1 text-[11px] font-bold" style={{ color: C.moss }}>
                {x.icon}{x.t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── The moment she recognises ────────────────────────────────────── */}
      {s.course_lp_pain && (
        <div className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: C.blush }}>
          <MimoLeaf variant="blush" size={78} rotate={35}
            style={{ position: 'absolute', bottom: -12, left: -14, opacity: 0.55, pointerEvents: 'none' }} />
          <p className="relative text-[15px] leading-loose whitespace-pre-line font-medium"
            style={{ color: '#5A4433' }}>
            {s.course_lp_pain}
          </p>
        </div>
      )}

      {/* ── What is inside — read from the course itself ─────────────────── */}
      {modules.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-3">
            <Title>מה יש בפנים</Title>
            <span className="text-[11px] font-bold" style={{ color: C.clay }}>
              {lessonCount} שיעורים · {videoCount} סרטונים
            </span>
          </div>
          <div className="space-y-1.5">
            {modules.map((m, i) => (
              <div key={`${m.name}-${i}`} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
                style={{ background: i % 2 === 0 ? '#FDF8EE' : '#FBF7F1' }}>
                <span className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: m.videos > 0 ? C.duck : C.sky }}>
                  {m.videos > 0
                    ? <PlayCircle className="w-4 h-4" style={{ color: '#4A3A28' }} />
                    : <BookOpen className="w-4 h-4" style={{ color: '#4A5560' }} />}
                </span>
                <span className="text-sm font-semibold flex-1" style={{ color: '#4A3A28' }}>{m.name}</span>
                <span className="text-[11px] flex-shrink-0" style={{ color: '#A2937D' }}>
                  {m.videos > 0 ? `${m.videos} סרטון` : 'לקריאה'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <Card>
          <Title>מה אמהות מספרות</Title>
          <div className="grid grid-cols-2 gap-2">
            {testimonials.slice(0, 4).map(src => (
              <img key={src} src={src} alt="" loading="lazy"
                className="w-full rounded-2xl" style={{ border: `1px solid ${C.beige}` }} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Who it is for ────────────────────────────────────────────────── */}
      {(s.course_lp_for_you || s.course_lp_not_for_you) && (
        <Card className="space-y-4">
          {s.course_lp_for_you && (
            <div>
              <h4 className="font-bold text-sm mb-2" style={{ color: C.moss }}>זה בשבילך אם</h4>
              <ul className="space-y-2">
                {lines(s.course_lp_for_you).map(l => (
                  <li key={l} className="flex items-start gap-2.5 text-sm" style={{ color: '#4A3A28' }}>
                    <span className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: '#E8F0E4' }}>
                      <Check className="w-3 h-3" style={{ color: C.moss }} />
                    </span>
                    <span className="leading-relaxed">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.course_lp_not_for_you && (
            <div className="pt-1" style={{ borderTop: `1px solid ${C.beige}` }}>
              <h4 className="font-bold text-sm mb-2 mt-3" style={{ color: '#9A6A5A' }}>זה לא בשבילך אם</h4>
              <ul className="space-y-2">
                {lines(s.course_lp_not_for_you).map(l => (
                  <li key={l} className="flex items-start gap-2.5 text-sm" style={{ color: C.inkSoft }}>
                    <span className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: C.blush }}>
                      <XIcon className="w-3 h-3" style={{ color: '#9A6A5A' }} />
                    </span>
                    <span className="leading-relaxed">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* ── Brenda ───────────────────────────────────────────────────────── */}
      {s.course_lp_about && (
        <div className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: `linear-gradient(140deg, #FFFFFF, ${C.beige})` }}>
          <MimoDuck size={64} variant="mama"
            style={{ position: 'absolute', bottom: 8, left: 10, opacity: 0.35, pointerEvents: 'none' }} />
          <div className="relative">
            <Title>מי מלמדת</Title>
            <p className="text-[15px] leading-loose whitespace-pre-line" style={{ color: '#4A3A28' }}>
              {s.course_lp_about}
            </p>
          </div>
        </div>
      )}

      {/* ── Guarantee, only when Brenda decided there is one ──────────────── */}
      {s.course_lp_guarantee && (
        <div className="rounded-3xl p-5 text-center"
          style={{ background: '#FDF3E3', border: `1px solid ${C.duck}` }}>
          <p className="text-sm font-semibold leading-relaxed whitespace-pre-line" style={{ color: C.inkSoft }}>
            {s.course_lp_guarantee}
          </p>
        </div>
      )}

      {/* ── The close ────────────────────────────────────────────────────── */}
      <div className="rounded-3xl p-6 text-center relative overflow-hidden"
        style={{ background: `linear-gradient(160deg, ${C.beige}, ${C.blush})` }}>
        <MimoLeaf variant="clay" size={86} rotate={-30}
          style={{ position: 'absolute', top: -16, right: -18, opacity: 0.4, pointerEvents: 'none' }} />
        <div className="relative space-y-3">
          <p className="font-display font-bold" style={{ fontSize: 22, color: C.ink }}>
            {workshop.price != null ? `${workshop.price} ₪. פעם אחת. שלך לתמיד.` : 'להרשמה'}
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.inkSoft }}>
            בלי מנוי ובלי תאריך תפוגה. משאירה פרטים, משלמת, ונכנסת לקורס 🤍
          </p>
          <Cta label="אני רוצה את הקורס ←" />
        </div>
      </div>
    </div>
  )
}
