import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/public/Landing'
import Emergency from './pages/public/Emergency'
import Report from './pages/public/Report'
import Track from './pages/public/Track'
import Guidance from './pages/public/Guidance'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Incidents from './pages/admin/Incidents'
import IncidentDetail from './pages/admin/IncidentDetail'
import MapView from './pages/admin/MapView'
import AdminLayout from './layouts/AdminLayout'
import ProtectedRoute from './components/common/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public portal */}
        <Route path="/" element={<Landing />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/emergency/report" element={<Report />} />
        <Route path="/emergency/guidance" element={<Guidance />} />
        <Route path="/emergency/guidance/:id" element={<Guidance />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:id" element={<Track />} />

        {/* Control room */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="map" element={<MapView />} />
        </Route>

        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center text-slate-400">
              Coming in a later phase — ambulance / hospital dashboards
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
