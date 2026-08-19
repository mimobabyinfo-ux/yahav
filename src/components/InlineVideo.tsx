import { useEffect, useState } from 'react'
import { signedMediaUrl } from '../utils/signedMedia'

const FALLBACK_RATIO = 9 / 16

/**
 * One video player, sized to its own footage.
 *
 * Phone clips are 9:16 and must never be cropped, but a clip shot in
 * landscape must not be letterboxed into a tall box either — so the frame
 * starts at 9:16 and adopts the real ratio once metadata arrives.
 *
 * The source is signed at play time (see utils/signedMedia), which is why
 * this lives in one place: the course player and the community tutorials
 * both need that, and a second copy would be the copy that forgets.
 */
export default function InlineVideo({ url, onPlay }: { url: string; onPlay?: () => void }) {
  const [ratio, setRatio] = useState(FALLBACK_RATIO)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    signedMediaUrl(url).then(u => { if (!cancelled) setSrc(u) })
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="flex justify-center">
      <div
        className="relative w-full overflow-hidden rounded-2xl bg-black"
        style={{ aspectRatio: String(ratio), maxHeight: '70vh', maxWidth: `calc(70vh * ${ratio})` }}
      >
        {!src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          </div>
        )}
        <video
          src={src ?? undefined}
          controls
          playsInline
          preload="metadata"
          onPlay={onPlay}
          onLoadedMetadata={e => {
            const v = e.currentTarget
            if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight)
          }}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
    </div>
  )
}
