import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = {
  storagePath: string
  entryId: string
  onDeleted: () => void
}

export default function DiaperPhotoThumbnail({ storagePath, entryId, onDeleted }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.storage.from('diaper-photos')
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => { if (data) setSignedUrl(data.signedUrl) })
  }, [storagePath])

  async function deletePhoto(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    await supabase.storage.from('diaper-photos').remove([storagePath])
    await supabase.from('daily_log_entries').update({ photo_url: null }).eq('id', entryId)
    onDeleted()
  }

  if (!signedUrl) return null

  return (
    <>
      <button
        onClick={() => setFullscreen(true)}
        className="flex-shrink-0 rounded-lg overflow-hidden border border-sand-100 hover:border-mustard-300 transition-colors"
      >
        <img src={signedUrl} alt="תמונת חיתול" className="w-10 h-10 object-cover" />
      </button>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          dir="rtl"
          onClick={() => setFullscreen(false)}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={signedUrl}
            alt="תמונת חיתול"
            className="max-w-full max-h-[80vh] rounded-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={deletePhoto}
            disabled={deleting}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-red-500/80 hover:bg-red-600 text-white rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'מוחק...' : 'מחק תמונה'}
          </button>
        </div>
      )}
    </>
  )
}
