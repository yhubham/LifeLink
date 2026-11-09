import { useEffect, useRef, useState } from 'react'
import { ImageOff, Loader2, ShieldCheck, X } from 'lucide-react'
import { fetchIncidentMedia, listIncidentMedia } from '../../services/api'
import { formatTime } from '../../lib/status'

/**
 * Authorized private media gallery.
 *
 * The backend only serves images to staff who are attached to the incident.
 * Images are fetched with the staff JWT and shown from short-lived blob URLs.
 */
export default function MediaGallery({ incidentId, title = 'Reported photos' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const urlsRef = useRef([])

  useEffect(() => {
    let cancelled = false
    const urls = []

    async function load() {
      setLoading(true)
      setError('')
      try {
        const media = await listIncidentMedia(incidentId)
        const withUrls = []
        for (const item of media) {
          if (cancelled) break
          try {
            const blob = await fetchIncidentMedia(incidentId, item.id)
            const url = URL.createObjectURL(blob)
            urls.push(url)
            withUrls.push({ ...item, url })
          } catch {
            /* one missing file should not hide the rest */
          }
        }
        if (!cancelled) setItems(withUrls)
      } catch (e) {
        if (!cancelled) {
          setError(
            e.response?.data?.detail || 'Could not load incident photos.'
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    urlsRef.current = urls
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
      urlsRef.current = []
    }
  }, [incidentId])

  return (
    <section className="mt-6 rounded-xl border border-navy-700 bg-navy-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {title}
        </h2>
        {items.length > 0 && (
          <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
            {items.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-600">
          <ShieldCheck size={11} /> Private · authorized staff only
        </span>
      </div>

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Loading photos…
        </p>
      )}

      {!loading && error && (
        <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <ImageOff size={14} /> No photos were attached to this report.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPreview(item)}
              className="group overflow-hidden rounded-lg border border-navy-700 bg-navy-950 text-left hover:border-sky-600"
            >
              <img
                src={item.url}
                alt={item.original_name || 'Incident photo'}
                className="h-28 w-full object-cover transition group-hover:opacity-90"
              />
              <span className="block truncate px-2 py-1 text-[10px] text-slate-500">
                {formatTime(item.created_at)}
              </span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-hidden rounded-xl border border-navy-700 bg-navy-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-navy-800 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                {preview.original_name || 'Incident photo'}
              </span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close photo"
                className="rounded p-1 text-slate-400 hover:bg-navy-800 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <img
              src={preview.url}
              alt={preview.original_name || 'Incident photo'}
              className="max-h-[75vh] w-full object-contain"
            />
          </div>
        </div>
      )}
    </section>
  )
}
