import { useRef, useState } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { compressImage } from '../../utils/imageCompress'

// Brenda 16.9.26: "כשאני מעלה תמונה היום זה דרך url למוצר אבל אם אני רוצה
// להכניס בעצמי אי אפשר להעלות אותה פשוט?"
//
// One picker for every admin image field: choose a file from the
// computer or phone, it is shrunk client-side (compressImage: max 1200px,
// JPEG) and dropped into the public `images` bucket, and the public URL
// lands in the field. Pasting a URL still works underneath, for the
// times the picture already lives somewhere.

export default function ImageUploadField({
  value, onChange, folder, label = 'תמונה',
}: {
  value: string
  onChange: (url: string) => void
  /** Sub-folder inside the images bucket: 'products', 'events'... */
  folder: string
  label?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('זה לא קובץ תמונה'); return }
    setErr(null)
    setBusy(true)
    try {
      // SVG/GIF do not survive the canvas step; send those as they are.
      const raw = file.type === 'image/svg+xml' || file.type === 'image/gif'
      const blob: Blob = raw ? file : await compressImage(file)
      const ext = raw ? (file.name.split('.').pop() || 'png') : 'jpg'
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('images').upload(path, blob, {
        upsert: false, contentType: raw ? file.type : 'image/jpeg', cacheControl: '31536000',
      })
      if (error) { setErr('ההעלאה נכשלה: ' + error.message); return }
      const { data } = supabase.storage.from('images').getPublicUrl(path)
      onChange(data.publicUrl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: '#8A7A63' }}>{label}</label>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {value ? (
        <div className="relative rounded-xl overflow-hidden" style={{ border: '1px solid #E9E2D6' }}>
          <img src={value} alt="" className="w-full h-32 object-cover" />
          <div className="absolute top-1.5 left-1.5 flex gap-1">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
              className="px-2 py-1 rounded-full text-[11px] font-bold bg-white/90 hover:bg-white" style={{ color: '#7B604C' }}>
              {busy ? 'מעלה...' : 'החלפה'}
            </button>
            <button type="button" onClick={() => onChange('')} title="הסרה"
              className="w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
          style={{ border: '1.5px dashed #DCD4C8', color: '#7B604C', background: '#FAF7F1' }}>
          <ImageIcon className="w-4 h-4" />
          {busy ? 'מעלה תמונה...' : 'העלאת תמונה מהמחשב'}
        </button>
      )}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        dir="ltr"
        placeholder="או הדביקי קישור לתמונה"
        className="mt-1.5 w-full px-3 py-1.5 rounded-xl text-xs bg-white focus:outline-none focus:border-mustard-400"
        style={{ border: '1px solid #E9E2D6', color: '#8A7A63' }}
      />
      {err && <p className="text-xs text-red-500 font-semibold mt-1">{err}</p>}
    </div>
  )
}
