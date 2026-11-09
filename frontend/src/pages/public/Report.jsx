import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  Loader2,
  MapPin,
  Plus,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react'
import { createIncident, uploadIncidentMedia } from '../../services/api'
import { useReportStore } from '../../context/reportStore'
import CallButton from '../../components/common/CallButton'
import LocationPicker from '../../components/report/LocationPicker'
import HospitalDiscovery from '../../components/report/HospitalDiscovery'
import ImageUploader from '../../components/report/ImageUploader'

const INCIDENT_TYPES = ['Road accident', 'Fire', 'Medical emergency', 'Other']

const blankPatient = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  display_name: '',
  age: '',
  consciousness: 'Responsive',
  breathing: 'Normal',
  bleeding: 'None',
  additional_notes: '',
})

function Field({ label, required, hint, children, error }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-200">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-red-400">{error}</span>}
    </label>
  )
}

const inputClass =
  'mt-1 w-full rounded-lg border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-red-500'

export default function Report() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { latitude, longitude, address: storedAddress, setLocation, reset } =
    useReportStore()

  const [lat, setLat] = useState(latitude)
  const [lon, setLon] = useState(longitude)
  const [address, setAddress] = useState(storedAddress || '')
  const [landmark, setLandmark] = useState('')
  const [incidentType, setIncidentType] = useState('Road accident')
  const [description, setDescription] = useState('')
  const [injuredCount, setInjuredCount] = useState(1)
  const [patients, setPatients] = useState([blankPatient()])
  const [selectedHospital, setSelectedHospital] = useState(null)
  const [images, setImages] = useState([])
  const [uploads, setUploads] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState(
    params.get('location') === 'denied'
      ? 'Location permission was denied. Enter the location manually below.'
      : ''
  )

  const [reportedAt] = useState(() => new Date())

  function applyLocation(nextLat, nextLon, suppliedAddress = address) {
    setLat(nextLat)
    setLon(nextLon)
    setLocation(nextLat, nextLon, suppliedAddress)
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationMessage('This browser does not support GPS. Enter coordinates manually.')
      return
    }
    setLocating(true)
    setLocationMessage('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = Number(position.coords.latitude.toFixed(6))
        const nextLon = Number(position.coords.longitude.toFixed(6))
        applyLocation(nextLat, nextLon)
        setLocating(false)
      },
      (geoError) => {
        setLocating(false)
        setLocationMessage(
          geoError.code === 1
            ? 'Location permission was denied. Enter the location manually below.'
            : 'Could not get GPS location. Enter the location manually below.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function updatePatient(index, field, value) {
    setPatients((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  function validate() {
    const next = {}
    if (!INCIDENT_TYPES.includes(incidentType)) next.incidentType = 'Choose an incident type.'
    if (description.trim().length < 5) {
      next.description = 'Add a short description (at least 5 characters).'
    }
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
      next.location = 'Set your location with GPS, map click or coordinates.'
    } else if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      next.location = 'Latitude must be -90…90 and longitude -180…180.'
    }
    if (!Number.isInteger(injuredCount) || injuredCount < 1) {
      next.injuredCount = 'Enter at least one injured person.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function patientPayload() {
    return patients
      .filter(
        (p) =>
          p.display_name.trim() ||
          p.age !== '' ||
          p.additional_notes.trim() ||
          p.consciousness !== 'Responsive' ||
          p.breathing !== 'Normal' ||
          p.bleeding !== 'None'
      )
      .map((p) => ({
        display_name: p.display_name.trim() || 'Unknown',
        age: p.age === '' ? null : Number(p.age),
        consciousness: p.consciousness,
        breathing: p.breathing,
        bleeding: p.bleeding,
        additional_notes: p.additional_notes.trim() || null,
      }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSubmitting(true)
    try {
      const incident = await createIncident({
        incident_type: incidentType,
        description: description.trim(),
        latitude: Number(lat),
        longitude: Number(lon),
        address: address.trim() || null,
        landmark: landmark.trim() || null,
        injured_count: Number(injuredCount),
        preferred_hospital: selectedHospital
          ? {
              osm_id: selectedHospital.osm_id,
              name: selectedHospital.name,
              address: selectedHospital.address || null,
              latitude: selectedHospital.latitude,
              longitude: selectedHospital.longitude,
              distance_km: selectedHospital.distance_km,
              availability_verified: Boolean(selectedHospital.availability_verified),
            }
          : null,
        patients: patientPayload(),
      })

      try {
        sessionStorage.setItem(
          `lifelink-ticket:${incident.public_code}`,
          incident.ticket_token
        )
        const codes = JSON.parse(
          localStorage.getItem('lifelink-ticket-codes') || '[]'
        )
        localStorage.setItem(
          'lifelink-ticket-codes',
          JSON.stringify(
            [incident.public_code, ...codes.filter((c) => c !== incident.public_code)].slice(
              0,
              8
            )
          )
        )
      } catch {
        /* storage can be unavailable in private mode */
      }

      setCreated(incident)
      setUploads(images.map((image) => ({
        id: image.id,
        name: image.file.name,
        progress: 0,
        status: 'uploading',
      })))
      window.scrollTo({ top: 0, behavior: 'smooth' })

      for (const image of images) {
        try {
          await uploadIncidentMedia(
            incident.id,
            image.file,
            incident.access_token,
            (progressEvent) => {
              const total = progressEvent.total || image.file.size
              const progress = Math.min(
                99,
                Math.round((progressEvent.loaded / total) * 100)
              )
              setUploads((rows) =>
                rows.map((row) =>
                  row.id === image.id ? { ...row, progress } : row
                )
              )
            }
          )
          setUploads((rows) =>
            rows.map((row) =>
              row.id === image.id
                ? { ...row, progress: 100, status: 'done' }
                : row
            )
          )
        } catch (uploadError) {
          setUploads((rows) =>
            rows.map((row) =>
              row.id === image.id
                ? {
                    ...row,
                    status: 'error',
                    error:
                      uploadError.response?.data?.detail ||
                      'Upload failed. The ticket was still created.',
                  }
                : row
            )
          )
        }
      }
    } catch (createError) {
      const detail = createError.response?.data?.detail
      setError(
        typeof detail === 'string'
          ? detail
          : 'Could not submit the report. Check the fields and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  function resetReport() {
    images.forEach((image) => URL.revokeObjectURL(image.preview))
    reset()
    setLat(null)
    setLon(null)
    setAddress('')
    setLandmark('')
    setDescription('')
    setPatients([blankPatient()])
    setSelectedHospital(null)
    setImages([])
    setUploads([])
    setCreated(null)
    setErrors({})
    setError('')
  }

  if (created) {
    const stillUploading = uploads.some((row) => row.status === 'uploading')
    const failed = uploads.filter((row) => row.status === 'error')
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-10">
        <CallButton compact />
        <div className="rounded-xl border border-emerald-700/50 bg-navy-900 p-6 text-center">
          <CheckCircle2 size={46} className="mx-auto text-emerald-400" />
          <h1 className="mt-3 text-2xl font-bold">Report submitted</h1>
          <p className="mt-1 text-sm text-slate-400">
            The control room can now see your emergency. Keep these details safe.
          </p>

          <div className="mt-5 rounded-lg border border-navy-700 bg-navy-950 p-5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Ticket number
            </div>
            <div className="mt-1 font-mono text-3xl font-extrabold tracking-wider text-emerald-300">
              {created.public_code}
            </div>
            <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Ticket PIN
            </div>
            <div className="mt-1 font-mono text-2xl font-extrabold tracking-[0.3em] text-amber-300">
              {created.access_pin}
            </div>
            <p className="mx-auto mt-3 max-w-md text-xs text-slate-500">
              You need the ticket number and PIN to open this ticket later. We
              cannot show the PIN again.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              to={`/ticket/${created.public_code}`}
              className={`rounded-lg px-5 py-2.5 text-sm font-bold ${
                stillUploading
                  ? 'cursor-wait bg-navy-700 text-slate-400'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
              onClick={(e) => stillUploading && e.preventDefault()}
            >
              View Ticket
            </Link>
            <button
              type="button"
              onClick={() => navigate('/track')}
              className="rounded-lg border border-navy-600 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-navy-800"
            >
              Open later with PIN
            </button>
            <button
              type="button"
              onClick={resetReport}
              className="rounded-lg border border-navy-700 px-5 py-2.5 text-sm text-slate-400 hover:bg-navy-800"
            >
              Report another
            </button>
          </div>

          {uploads.length > 0 && (
            <div className="mt-5 text-left">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Photos
              </div>
              <div className="mt-2 space-y-1.5">
                {uploads.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 rounded-lg border border-navy-800 bg-navy-950 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-400">
                      {row.name}
                    </span>
                    {row.status === 'done' && (
                      <span className="text-emerald-400">Uploaded</span>
                    )}
                    {row.status === 'error' && (
                      <span className="text-red-400">{row.error}</span>
                    )}
                    {row.status === 'uploading' && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Loader2 size={11} className="animate-spin" /> {row.progress}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {failed.length > 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  The report is safe, but {failed.length} photo
                  {failed.length > 1 ? 's' : ''} could not be uploaded.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-5">
      <CallButton compact />
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/emergency" className="text-sm text-slate-500 hover:text-slate-300">
          ← Emergency
        </Link>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <Clock3 size={13} />
          {reportedAt.toLocaleString(undefined, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <h1 className="mt-3 text-2xl font-bold">Report an emergency</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Fill in what you know. Fields marked <span className="text-red-400">*</span>{' '}
        are required; everything else can be left blank if you are unsure.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-700/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        {/* Incident */}
        <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            1. What happened?
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field
              label="Incident type"
              required
              hint="Choose the closest match."
              error={errors.incidentType}
            >
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                className={inputClass}
              >
                {INCIDENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Number of injured people"
              required
              hint="Your best estimate is fine."
              error={errors.injuredCount}
            >
              <input
                type="number"
                min="1"
                max="500"
                value={injuredCount}
                onChange={(e) => setInjuredCount(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Short description"
              required
              hint="For example: two-wheeler hit a pedestrian near the bus stop."
              error={errors.description}
            >
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you can see. Do not put yourself in danger to look closer."
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Reported date and time" hint="Added automatically when you submit.">
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-950/60 px-3 py-2.5 text-sm text-slate-300">
                <Clock3 size={14} className="text-slate-500" />
                {reportedAt.toLocaleString()}
              </div>
            </Field>
          </div>
        </section>

        {/* Location */}
        <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin size={17} className="text-red-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              2. Where is it?
            </h2>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              <Crosshair size={13} className={locating ? 'animate-spin' : ''} />
              {locating ? 'Locating…' : 'Use my location'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            GPS is best. If permission is denied, type coordinates or click the map.
          </p>
          {locationMessage && (
            <p className="mt-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              {locationMessage}
            </p>
          )}
          {errors.location && (
            <p className="mt-2 text-xs text-red-400">{errors.location}</p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Latitude" hint="Example: 28.6139" required>
              <input
                type="number"
                step="any"
                value={lat ?? ''}
                onChange={(e) => applyLocation(e.target.value === '' ? null : Number(e.target.value), lon)}
                placeholder="Latitude"
                className={inputClass}
              />
            </Field>
            <Field label="Longitude" hint="Example: 77.2090" required>
              <input
                type="number"
                step="any"
                value={lon ?? ''}
                onChange={(e) => applyLocation(lat, e.target.value === '' ? null : Number(e.target.value))}
                placeholder="Longitude"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field
              label="Current location / address"
              hint="Street, area or junction. Helps responders find you faster."
            >
              <input
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  if (lat != null && lon != null) {
                    setLocation(lat, lon, e.target.value)
                  }
                }}
                placeholder="e.g. Ring Road near ITO crossing, New Delhi"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field
              label="Landmark"
              hint="Optional: a shop, metro station, temple or other easy-to-spot place."
            >
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. Opposite the petrol pump"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-3">
            <LocationPicker
              latitude={lat}
              longitude={lon}
              onPick={(nextLat, nextLon) =>
                applyLocation(
                  Number(nextLat.toFixed(6)),
                  Number(nextLon.toFixed(6))
                )
              }
            />
          </div>
        </section>

        <HospitalDiscovery
          latitude={lat}
          longitude={lon}
          selected={selectedHospital}
          onSelect={setSelectedHospital}
        />

        {/* Patients */}
        <section className="rounded-xl border border-navy-700 bg-navy-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound size={17} className="text-amber-300" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              3. People injured
            </h2>
            <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
              OPTIONAL DETAILS
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Add details for anyone you can see. Leave unknown details as they are.
          </p>

          <div className="mt-3 space-y-4">
            {patients.map((patient, index) => (
              <div
                key={patient.key}
                className="rounded-lg border border-navy-800 bg-navy-950/50 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">
                    Injured person {index + 1}
                  </span>
                  {patients.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPatients((rows) => rows.filter((_, i) => i !== index))
                      }
                      className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-400"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  )}
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <Field label="Name" hint="Optional">
                    <input
                      value={patient.display_name}
                      onChange={(e) =>
                        updatePatient(index, 'display_name', e.target.value)
                      }
                      placeholder="Name or 'Unknown'"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Approximate age" hint="Optional">
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={patient.age}
                      onChange={(e) => updatePatient(index, 'age', e.target.value)}
                      placeholder="Years"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Consciousness" hint="Are they awake and responsive?">
                    <select
                      value={patient.consciousness}
                      onChange={(e) =>
                        updatePatient(index, 'consciousness', e.target.value)
                      }
                      className={inputClass}
                    >
                      <option>Responsive</option>
                      <option>Confused</option>
                      <option>Unresponsive</option>
                      <option>Not sure</option>
                    </select>
                  </Field>
                  <Field label="Breathing" hint="Is breathing normal or difficult?">
                    <select
                      value={patient.breathing}
                      onChange={(e) =>
                        updatePatient(index, 'breathing', e.target.value)
                      }
                      className={inputClass}
                    >
                      <option>Normal</option>
                      <option>Fast or difficult</option>
                      <option>Not breathing</option>
                      <option>Not sure</option>
                    </select>
                  </Field>
                  <Field label="Visible bleeding or injuries" hint="What you can see">
                    <select
                      value={patient.bleeding}
                      onChange={(e) =>
                        updatePatient(index, 'bleeding', e.target.value)
                      }
                      className={inputClass}
                    >
                      <option>None</option>
                      <option>Minor bleeding</option>
                      <option>Severe bleeding</option>
                      <option>Other visible injury</option>
                      <option>Not sure</option>
                    </select>
                  </Field>
                  <Field label="Additional information" hint="Optional">
                    <input
                      value={patient.additional_notes}
                      onChange={(e) =>
                        updatePatient(index, 'additional_notes', e.target.value)
                      }
                      placeholder="Anything else responders should know"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPatients((rows) => [...rows, blankPatient()])}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-navy-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-navy-800"
          >
            <Plus size={13} /> Add another injured person
          </button>
        </section>

        <ImageUploader
          images={images}
          setImages={setImages}
          uploads={uploads}
          disabled={submitting}
        />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-700 bg-navy-900 p-4">
          <p className="text-xs text-slate-500">
            By submitting, you confirm this is a simulation report. For a real
            emergency call your local emergency number.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
            {submitting ? 'Submitting…' : 'Submit emergency report'}
          </button>
        </div>
      </form>
    </div>
  )
}
