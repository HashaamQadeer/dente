import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../ui/components'

export function HomePage() {
  const nav = useNavigate()
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 px-6 py-7 text-white shadow-sm">
        <div className="text-sm/6 text-white/80">Welcome to</div>
        <div className="mt-1 text-2xl font-semibold">Dente</div>
        <div className="mt-2 max-w-2xl text-sm/6 text-white/90">
          Manage patients, appointments, and procedures
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => nav('/add-patient')}>
            Add a patient
          </Button>
          <Button variant="secondary" onClick={() => nav('/patients')}>
            View patients
          </Button>
          <Button variant="secondary" onClick={() => nav('/appointments')}>
            Appointments
          </Button>
          <Button variant="secondary" onClick={() => nav('/procedures')}>
            Procedures
          </Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card
          title="Quick actions"
          subtitle="Use these buttons to navigate faster."
        >
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => nav('/add-patient')}>Add Patient</Button>
            <Button variant="secondary" onClick={() => nav('/patients')}>
              Patients
            </Button>
            <Button variant="secondary" onClick={() => nav('/appointments')}>
              Appointments
            </Button>
            <Button variant="secondary" onClick={() => nav('/procedures')}>
              Procedures
            </Button>
          </div>
        </Card>
        <Card
          title="Offline-first"
          subtitle="No internet required."
        >
          <div className="text-sm text-slate-700">
            The app talks to a local SQLite database using Electron IPC.
          </div>
        </Card>
      </div>
    </div>
  )
}

