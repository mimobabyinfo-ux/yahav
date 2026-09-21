import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = {
  storagePath: string
  entryId: string
  onDeleted: () => void
  bucket?: string
  isVideo?: boolean
}

export default function DiaperPhotoThumbnail({ storagePath, entryId, onDeleted, bucket = 'diaper-photos', isVideo = false }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.storage.from(bucket)
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => { if (data) setSignedUrl(data.signedUrl) })
  }, [storagePath, bucket])

  async function deletePhoto(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    await supabase.storage.from(bucket).remove([storagePath])
    await supabase.from('daily_log_entries').update({ photo_url: null }).eq('id', entryId)
    onDeleted()
  }

  if (!signedUrl) return null

  return (
    <>
      {/* stopPropagation: the thumbnail sits inside the timeline card, whose
          own onClick opens the entry for editing. */}
      <button
        onClick={e => { e.stopPropagation(); setFullscreen(true) }}
        className="flex-shrink-0 rounded-lg overflow-hidden border border-sand-100 hover:border-mustard-300 transition-colors"
      >
        {isVideo ? (
          <video src={signedUrl} className="w-10 h-10 object-cover" muted playsInline />
        ) : (
          <img src={signedUrl} alt="תמונה" className="w-10 h-10 object-cover" />
        )}
      </button>

      {/* Portal to <body>: the journal wraps its content in a positioned,
          stacking-context ancestor, which trapped this `fixed` overlay inside
          the list. It covered only the list (not the date bar or BottomNav),
          centred the photo in the full list height instead of the screen, and
          left the close button at the top of the list, off screen. Same fix as
          BottomSheet. */}
      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          dir="rtl"
          onClick={e => { e.stopPropagation(); setFullscreen(false) }}
        >
          <button
            onClick={e => { e.stopPropagation(); setFullscreen(false) }}
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            className="absolute right-4 p-2 bg-white/20 rounded-full text-white"
          >
            <X className="w-5 h-5" />
          </button>
          {isVideo ? (
            <video
              src={signedUrl}
              controls
              className="max-w-full max-h-[80vh] rounded-2xl"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <img
              src={signedUrl}
              alt="תמונה"
              className="max-w-full max-h-[80vh] rounded-2xl object-contain"
              onClick={e => e.stopPropagation()}
            />
          )}
          <button
            onClick={deletePhoto}
            disabled={deleting}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-red-500/80 hover:bg-red-600 text-white rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'מוחק...' : 'מחק מדיה'}
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
