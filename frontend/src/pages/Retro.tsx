import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, PHASE_HINTS, PHASE_LABELS, type Phase, type RetroView } from '../api'
import { CloseView, DiscussView, GroupView, SetupView, ThinkView, VoteView, type PhaseProps } from '../components/phases'
import { useRetro } from '../useRetro'

const PHASES: Phase[] = ['setup', 'think', 'group', 'vote', 'discuss', 'close']

function PhaseBar({ phase }: { phase: Phase }) {
  const current = PHASES.indexOf(phase)
  return (
    <ol className="flex flex-wrap gap-1 text-xs">
      {PHASES.map((p, i) => (
        <li
          key={p}
          className={`rounded-full px-2.5 py-1 ${
            i === current ? 'bg-indigo-600 font-medium text-white' : i < current ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {PHASE_LABELS[p]}
        </li>
      ))}
    </ol>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

function Timer({ view, send }: PhaseProps) {
  const now = useNow(view.timer !== null)
  const facilitator = view.me.isFacilitator
  const remaining = view.timer ? Math.max(0, Math.round((view.timer.endsAt - now) / 1000)) : null
  if (view.phase === 'close') return null
  return (
    <div className="flex items-center gap-2">
      {remaining !== null && (
        <span className={`font-mono text-lg tabular-nums ${remaining === 0 ? 'animate-pulse text-red-600' : remaining <= 30 ? 'text-amber-600' : ''}`}>
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      )}
      {facilitator &&
        (view.timer ? (
          <button className="btn btn-sm" onClick={() => send({ type: 'stopTimer' })}>
            Stop timer
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            Timer
            {[1, 3, 5, 10].map((m) => (
              <button key={m} className="btn btn-sm" onClick={() => send({ type: 'startTimer', seconds: m * 60 })}>
                {m}m
              </button>
            ))}
          </span>
        ))}
    </div>
  )
}

function Members({ view, send }: PhaseProps) {
  const facilitator = view.members.find((m) => m.isFacilitator)
  const canClaim = !view.me.isFacilitator && !facilitator?.online
  const showDone = view.phase === 'think' || view.phase === 'group' || view.phase === 'vote'
  return (
    <aside className="card h-fit space-y-3">
      <h2 className="text-sm font-semibold">
        Participants <span className="font-normal text-slate-500">({view.members.filter((m) => m.online).length} online)</span>
      </h2>
      <ul className="space-y-1.5 text-sm">
        {view.members.map((m) => (
          <li key={m.email} className="group flex items-center gap-2">
            <span className={`size-2 rounded-full ${m.online ? 'bg-emerald-500' : 'bg-slate-300'}`} title={m.online ? 'Online' : 'Offline'} />
            <span className={`flex-1 truncate ${m.online ? '' : 'text-slate-400'}`} title={m.email}>
              {m.name}
              {m.email === view.me.email && ' (you)'}
            </span>
            {m.isFacilitator && <span title="Facilitator">⭐</span>}
            {showDone && m.done && <span className="text-emerald-600" title="Done">✓</span>}
            {view.me.isFacilitator && !m.isFacilitator && view.phase !== 'close' && (
              <button
                className="hidden text-xs text-slate-500 hover:text-indigo-700 group-hover:inline"
                onClick={() => confirm(`Make ${m.name} the facilitator?`) && send({ type: 'transferFacilitator', to: m.email })}
              >
                Make facilitator
              </button>
            )}
          </li>
        ))}
      </ul>
      {showDone && (
        <button
          className="btn btn-sm w-full justify-center"
          onClick={() => send({ type: 'setDone', done: !view.members.find((m) => m.email === view.me.email)?.done })}
        >
          {view.members.find((m) => m.email === view.me.email)?.done ? 'Not done yet' : 'I’m done'}
        </button>
      )}
      {canClaim && view.phase !== 'close' && (
        <button className="btn btn-sm w-full justify-center" onClick={() => send({ type: 'claimFacilitator' })}>
          Take over as facilitator
        </button>
      )}
    </aside>
  )
}

function FacilitatorControls({ view, send }: PhaseProps) {
  const navigate = useNavigate()
  if (!view.me.isFacilitator) return null
  const i = PHASES.indexOf(view.phase)
  const next = PHASES[i + 1]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {view.phase !== 'setup' && view.phase !== 'close' && (
        <button className="btn" onClick={() => send({ type: 'revertPhase' })}>
          ← {PHASE_LABELS[PHASES[i - 1]]}
        </button>
      )}
      {next && (
        <button
          className="btn btn-primary"
          onClick={() => (next !== 'close' || confirm('Close the retro? It becomes read-only.')) && send({ type: 'advancePhase' })}
        >
          {next === 'close' ? 'Close retro' : `Start ${PHASE_LABELS[next]} →`}
        </button>
      )}
      <button
        className="btn text-red-600"
        onClick={async () => {
          if (!confirm(`Delete “${view.title}” and its action items? This can’t be undone.`)) return
          await api.deleteRetro(view.id)
          navigate('/')
        }}
      >
        Delete
      </button>
    </div>
  )
}

export default function Retro() {
  const { id } = useParams()
  const { view, status, error, clearError, send } = useRetro(id!)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(clearError, 4000)
    return () => clearTimeout(t)
  }, [error, clearError])

  const title = view?.title
  useEffect(() => {
    if (title) document.title = `${title} · Retro`
  }, [title])

  if (status === 'gone') return <p className="text-slate-600">This retro has been deleted.</p>
  if (!view) return <p className="text-slate-500">{status === 'reconnecting' ? 'Couldn’t connect. Retrying…' : 'Connecting…'}</p>

  const props: PhaseProps = { view, send, nameOf: nameLookup(view) }
  const Body = { setup: SetupView, think: ThinkView, group: GroupView, vote: VoteView, discuss: DiscussView, close: CloseView }[view.phase]

  return (
    <div className="space-y-4">
      <datalist id="member-list">
        {view.members.map((m) => (
          <option key={m.email} value={m.email}>
            {m.name}
          </option>
        ))}
      </datalist>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{view.title}</h1>
          <PhaseBar phase={view.phase} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Timer {...props} />
          <FacilitatorControls {...props} />
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(location.href)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-600">{PHASE_HINTS[view.phase]}</p>
      {status === 'reconnecting' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Connection lost. Reconnecting…</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <Body {...props} />
        </div>
        <Members {...props} />
      </div>
      {error && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}

function nameLookup(view: RetroView) {
  const names = new Map(view.members.map((m) => [m.email, m.name]))
  return (email: string) => names.get(email) ?? email
}
