// Client-side image compression used before uploading to Supabase Storage.
// Extracted from LogEntryModal so MilestonePage and DiaperPage can reuse it
// without copy-pasting (and so future image-upload features have one
// canonical pipeline). Behavior is identical to the inline version this
// replaces: downsizes to ≤1200px on the longest edge, encodes JPEG q=0.82,
// re-encodes at q=0.6 if the first pass came out above 512 KB.

export function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = e => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const maxDim = 1200
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (blob && blob.size > 512 * 1024) {
            canvas.toBlob(b => resolve(b ?? blob), 'image/jpeg', 0.6)
          } else {
            resolve(blob ?? new Blob())
          }
        }, 'image/jpeg', 0.82)
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}
