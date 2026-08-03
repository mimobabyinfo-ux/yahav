// The official Mimo brand ducks - pixel-faithful cutouts from the
// "icono grafico" brand sheet (transparent PNGs in /public/brand/).
// Used for playful brand moments: empty states, hero corners, and the
// dashboard watermark.

type Variant = 'family' | 'mama' | 'chick'

type Props = {
  /** Rendered width in px (height keeps the brand aspect ratio). */
  size?: number
  /** Legacy switch: true = mama + duckling, false = solo mama. */
  withDuckling?: boolean
  /** Explicit choice - overrides withDuckling when set. */
  variant?: Variant
  className?: string
  style?: React.CSSProperties
}

const SRC: Record<Variant, string> = {
  family: '/brand/duck-family.png',
  mama: '/brand/duck-mama.png',
  chick: '/brand/duck-chick.png',
}

export default function MimoDuck({ size = 120, withDuckling = true, variant, className, style }: Props) {
  const v: Variant = variant ?? (withDuckling ? 'family' : 'mama')
  // The brand cutouts face left; in this RTL layout they should face the
  // content, so every consumer gets a horizontal mirror.
  return (
    <img
      src={SRC[v]}
      width={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ height: 'auto', transform: 'scaleX(-1)', ...style }}
    />
  )
}
