import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/useAuth'
import { AddPatientPage } from './pages/AddPatientPage'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { FinancePage } from './pages/FinancePage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PatientsPage } from './pages/PatientsPage'
import { ProceduresPage } from './pages/ProceduresPage'
import { SettingsModal } from './pages/SettingsPage'
import { TreatmentPlansPage } from './pages/TreatmentPlansPage'
import { Button } from './ui/components'
import { AppLogo } from './ui/AppLogo'
import { ApiStatusBanner } from './ui/ApiStatusBanner'

const APP_VERSION = 'v4.0.1'

const linkBase =
  'px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'

function FinanceNavLink() {
  const { canViewFinance, promptFinanceDenied } = useAuth()
  return (
    <NavLink
      to="/finance"
      onClick={(e) => {
        if (!canViewFinance) {
          e.preventDefault()
          promptFinanceDenied()
        }
      }}
      className={({ isActive }) =>
        `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
      }
    >
      Finance
    </NavLink>
  )
}

function AppShell() {
  const { user, roleLabel, logout } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <div className="leading-tight">
              <div className="text-base font-semibold text-slate-900">Dente</div>
              <div className="text-xs text-slate-500">Offline dental clinic manager · {APP_VERSION}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              <FinanceNavLink />
              <NavLink
                to="/treatment-plans"
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                Treatment Plans
              </NavLink>
            </nav>

            <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  user?.role === 'admin'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
                title={`Signed in as ${user?.username}`}
              >
                {roleLabel}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                Settings
              </Button>
              <Button variant="secondary" size="sm" onClick={() => logout()}>
                Log out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <ApiStatusBanner />
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

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <AppShell />
}
