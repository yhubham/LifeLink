import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/public/Landing'
import Emergency from './pages/public/Emergency'
import Report from './pages/public/Report'
import Track from './pages/public/Track'
import Ticket from './pages/public/Ticket'
import Guidance from './pages/public/Guidance'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import Incidents from './pages/admin/Incidents'
import IncidentDetail from './pages/admin/IncidentDetail'
import MapView from './pages/admin/MapView'
import Ambulances from './pages/admin/Ambulances'
import Hospitals from './pages/admin/Hospitals'
import AdminLayout from './layouts/AdminLayout'
import AmbulanceLayout from './layouts/AmbulanceLayout'
import HospitalLayout from './layouts/HospitalLayout'
import AmbulanceDashboard from './pages/ambulance/Dashboard'
import AmbulanceAssignments from './pages/ambulance/Assignments'
import AmbulanceIncident from './pages/ambulance/Incident'
import AmbulanceLocation from './pages/ambulance/Location'
import HospitalDashboard from './pages/hospital/Dashboard'
import HospitalAlerts from './pages/hospital/Alerts'
import HospitalPatient from './pages/hospital/Patient'
import HospitalCapacity from './pages/hospital/Capacity'
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
        <Route path="/ticket/:code" element={<Ticket />} />

        {/* Shared staff login */}
        <Route path="/admin/login" element={<Login />} />

        {/* Control room */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN', 'POLICE', 'RESCUE']} dashboard="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="map" element={<MapView />} />
          <Route path="ambulances" element={<Ambulances />} />
          <Route path="hospitals" element={<Hospitals />} />
        </Route>

        {/* Ambulance crew */}
        <Route
          path="/ambulance"
          element={
            <ProtectedRoute dashboard="ambulance">
              <AmbulanceLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/ambulance/dashboard" replace />} />
          <Route path="dashboard" element={<AmbulanceDashboard />} />
          <Route path="assignments" element={<AmbulanceAssignments />} />
          <Route path="incident/:id" element={<AmbulanceIncident />} />
          <Route path="location" element={<AmbulanceLocation />} />
        </Route>

        {/* Hospital desk */}
        <Route
          path="/hospital"
          element={
            <ProtectedRoute dashboard="hospital">
              <HospitalLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/hospital/dashboard" replace />} />
          <Route path="dashboard" element={<HospitalDashboard />} />
          <Route path="alerts" element={<HospitalAlerts />} />
          <Route path="patient/:id" element={<HospitalPatient />} />
          <Route path="capacity" element={<HospitalCapacity />} />
        </Route>

        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center text-slate-400">
              Page not found
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
