import { NavLink, Route, Routes } from 'react-router-dom'
import { AddPatientPage } from './pages/AddPatientPage'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { FinancePage } from './pages/FinancePage'
import { HomePage } from './pages/HomePage'
import { PatientsPage } from './pages/PatientsPage'
import { ProceduresPage } from './pages/ProceduresPage'
import { TreatmentPlansPage } from './pages/TreatmentPlansPage'

const linkBase =
  'px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white">
              D
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold text-slate-900">Dente</div>
              <div className="text-xs text-slate-500">Offline dental clinic manager</div>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/add-patient"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Add Patient
            </NavLink>
            <NavLink
              to="/patients"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Patients
            </NavLink>
            <NavLink
              to="/appointments"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Appointments
            </NavLink>
            <NavLink
              to="/procedures"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Procedures
            </NavLink>
            <NavLink
              to="/finance"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Finance
            </NavLink>
            <NavLink
              to="/treatment-plans"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              Treatment Plans
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add-patient" element={<AddPatientPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/procedures" element={<ProceduresPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/treatment-plans" element={<TreatmentPlansPage />} />
        </Routes>
      </main>
    </div>
  )
}
