import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, UploadCloud, XCircle } from 'lucide-react'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 12

const ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

export default function ImageUploader({ images, setImages, uploads = [], disabled }) {
  const inputRef = useRef(null)
  const [errors, setErrors] = useState([])

  function addFiles(fileList) {
    const incoming = Array.from(fileList || [])
    const next = [...images]
    const nextErrors = []

    for (const file of incoming) {
      if (next.length >= MAX_FILES) {
        nextErrors.push(`You can attach up to ${MAX_FILES} images.`)
        break
      }
      if (!ALLOWED.includes(file.type)) {
        nextErrors.push(`${file.name}: only JPG, PNG and WebP images are allowed.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        nextErrors.push(`${file.name}: file is larger than 10 MB.`)
        continue
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
          .toString(36)
          .slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
      })
    }

    setImages(next)
    setErrors(nextErrors)
    if (inputRef.current) inputRef.current.value = ''
  }

  function remove(item) {
    URL.revokeObjectURL(item.preview)
    setImages(images.filter((entry) => entry.id !== item.id))
    setErrors([])
  }

  return (
    <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="flex items-center gap-2">
        <ImagePlus size={17} className="text-sky-300" />
        <h2 className="font-bold">Accident photos (optional)</h2>
        <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
          JPG · PNG · WEBP
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Photos help responders prepare. Images are private and visible only to
        authorized staff. They are never sent to external AI services.
      </p>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!disabled) addFiles(e.dataTransfer.files)
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-navy-600 bg-navy-950/60 px-4 py-6 text-center text-sm text-slate-400 hover:border-sky-600 ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        }`}
      >
        <UploadCloud size={22} className="text-slate-500" />
        <span>
          <span className="font-semibold text-sky-300">Choose images</span> or drag
          them here
        </span>
        <span className="text-[11px] text-slate-600">
          Up to 12 images, 10 MB each. You can remove them before submitting.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled}
          onChange={(e) => addFiles(e.target.files)}
          className="hidden"
        />
      </label>

      {errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {errors.map((error) => (
            <li key={error} className="flex items-start gap-1 text-xs text-red-400">
              <XCircle size={12} className="mt-0.5 shrink-0" /> {error}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((item) => {
            const upload = uploads.find((entry) => entry.id === item.id)
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-lg border border-navy-700 bg-navy-950"
              >
                <div className="relative">
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="h-28 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={disabled}
                    className="absolute right-1 top-1 rounded-full bg-navy-950/90 p-1 text-slate-300 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="px-2 py-1.5">
                  <div className="truncate text-[11px] text-slate-400">
                    {item.file.name}
                  </div>
                  {upload ? (
                    <div className="mt-1">
                      <div className="h-1 overflow-hidden rounded-full bg-navy-800">
                        <div
                          className={`h-1 rounded-full ${
                            upload.status === 'error' ? 'bg-red-500' : 'bg-sky-400'
                          }`}
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                      <div
                        className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                          upload.status === 'error'
                            ? 'text-red-400'
                            : upload.status === 'done'
                              ? 'text-emerald-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {upload.status === 'uploading' && (
                          <Loader2 size={9} className="animate-spin" />
                        )}
                        {upload.status === 'done'
                          ? 'Uploaded'
                          : upload.status === 'error'
                            ? upload.error || 'Upload failed'
                            : `${upload.progress}%`}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-600">Ready to upload</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
