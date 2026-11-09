import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { myAssignments } from '../../services/api'
import { ASSIGNMENT_STYLES, formatTime } from '../../lib/status'

export default function Assignments() {
  const [assignments, setAssignments] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    myAssignments()
      .then(setAssignments)
      .catch((e) => setError(e.response?.data?.detail || 'Could not load assignments.'))
  }, [])

  return (
    <div>
      <h1 className="text-xl font-bold">Assignments</h1>
      <p className="text-sm text-slate-500">
        Active dispatches across the simulated fleet (demo mode shows all crews).
      </p>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-5 overflow-x-auto rounded-xl border border-navy-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Incident</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Ambulance</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-t border-navy-800 bg-navy-950/40">
                <td className="px-4 py-3 font-mono text-xs">{a.incident_public_code}</td>
                <td className="px-4 py-3 font-semibold">{a.incident_type}</td>
                <td className="px-4 py-3 text-slate-300">{a.call_sign}</td>
                <td className="px-4 py-3 text-slate-500">{formatTime(a.assigned_at)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${ASSIGNMENT_STYLES[a.assignment_status]}`}
                  >
                    {a.assignment_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/ambulance/incident/${a.incident_id}`}
                    className="text-xs font-semibold text-sky-300 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No active assignments.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
