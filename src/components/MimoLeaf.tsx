// The botanical elements from the brand book (last page), extracted
// from the PDF at full vector resolution and shipped as transparent
// PNGs — 10 files, 82KB for the whole set.
//
// These replace the single duck that used to sit in empty states and
// card corners. The reason is in the brand book itself: the Mimo mark
// is a PAIR, a mother and a duckling, and a lone duck read as a
// different, thinner logo everywhere it appeared. The leaves carry the
// brand without competing with the mark.

export type LeafVariant =
  | 'sand-1' | 'sand-2'   // AMARILLO PATITO / ARENA
  | 'blush'               // ROSA POLVO
  | 'clay'                // ROJO TIERRA
  | 'sky-1' | 'sky-2'     // CELESTE
export type BerryVariant = 'blush' | 'clay' | 'moss' | 'sky'

type Props = {
  variant?: LeafVariant
  size?: number
  /** Rotation in degrees — the sprigs were drawn at one angle; turning
   *  them is what keeps a page from looking stamped. */
  rotate?: number
  flip?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function MimoLeaf({
  variant = 'sand-1',
  size = 96,
  rotate = 0,
  flip = false,
  className,
  style,
}: Props) {
  const transform = [
    rotate ? `rotate(${rotate}deg)` : '',
    flip ? 'scaleX(-1)' : '',
  ].filter(Boolean).join(' ')
  return (
    <img
      src={`/brand/leaf-${variant}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{
        width: size,
        height: 'auto',
        transform: transform || undefined,
        userSelect: 'none',
        ...style,
      }}
    />
  )
}

/** The little three-dot berry cluster. Good as a full stop between
 *  sections, or scattered next to a sprig. */
export function MimoBerries({
  variant = 'moss',
  size = 18,
  className,
  style,
}: {
  variant?: BerryVariant
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <img
      src={`/brand/berry-${variant}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ width: size, height: 'auto', userSelect: 'none', ...style }}
    />
  )
}

/** Two sprigs meeting around whatever you put between them — the shape
 *  the brand book uses on its own title pages. Reads as a frame rather
 *  than as a sticker, which is what an empty state wants. */
export function MimoLeafPair({
  size = 84,
  children,
  className,
}: {
  size?: number
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-center gap-1 ${className ?? ''}`}>
      <MimoLeaf variant="sand-1" size={size} rotate={-14} />
      {children}
      <MimoLeaf variant="sand-2" size={size} rotate={14} flip />
    </div>
  )
}
