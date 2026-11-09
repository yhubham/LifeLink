import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Landing from './pages/public/Landing'
import Emergency from './pages/public/Emergency'
import Report from './pages/public/Report'
import Track from './pages/public/Track'
import Guidance from './pages/public/Guidance'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/emergency/report" element={<Report />} />
        <Route path="/emergency/guidance" element={<Guidance />} />
        <Route path="/emergency/guidance/:id" element={<Guidance />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:id" element={<Track />} />
        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center text-slate-400">
              Coming in a later phase — admin / ambulance / hospital dashboards
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
