import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { api, type Member } from './api'
import Home from './pages/Home'
import Retro from './pages/Retro'

interface MeContextValue {
  me: Member
  setMe: (m: Member) => void
}

const MeContext = createContext<MeContextValue | null>(null)

export function useMe() {
  const ctx = useContext(MeContext)
  if (!ctx) throw new Error('useMe outside provider')
  return ctx
}

function NameEditor() {
  const { me, setMe } = useMe()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(me.name)
  const [error, setError] = useState<string | null>(null)

  if (!editing) {
    return (
      <button className="text-sm text-slate-600 hover:text-slate-900" onClick={() => setEditing(true)} title="Change display name">
        {me.name} ✎
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          setMe(await api.setName(name))
          setEditing(false)
          setError(null)
        } catch (err) {
          setError((err as Error).message)
        }
      }}
    >
      <input className="input w-48" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus />
      <button className="btn btn-primary btn-sm">Save</button>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  )
}

function FirstVisitName() {
  const { me, setMe } = useMe()
  const [name, setName] = useState('')
  return (
    <div className="mx-auto mt-24 max-w-sm card">
      <h1 className="text-lg font-semibold">Welcome to Retro</h1>
      <p className="mt-1 text-sm text-slate-600">What should teammates call you? You can change this later.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (name.trim()) setMe(await api.setName(name.trim()))
        }}
      >
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={me.email} maxLength={50} autoFocus />
        <button className="btn btn-primary">Continue</button>
      </form>
    </div>
  )
}

export default function App() {
  const [me, setMe] = useState<Member | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.me().then(setMe, (e: Error) => setError(e.message))
  }, [])

  if (error === 'unauthenticated') {
    return (
      <div className="mx-auto mt-24 max-w-sm card space-y-3">
        <h1 className="text-lg font-semibold">Your session has expired</h1>
        <p className="text-sm text-slate-600">Sign in again to continue.</p>
        <a className="btn btn-primary" href="/cdn-cgi/access/logout">
          Sign in again
        </a>
      </div>
    )
  }
  if (error) return <p className="p-8 text-red-600">Couldn’t load your profile: {error}</p>
  if (!me) return <p className="p-8 text-slate-500">Loading…</p>

  return (
    <MeContext.Provider value={{ me, setMe }}>
      {me.name === me.email ? (
        <FirstVisitName />
      ) : (
        <>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <Link to="/" className="font-semibold text-indigo-700">
                Retro
              </Link>
              <NameEditor />
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/retro/:id" element={<Retro />} />
            </Routes>
          </main>
        </>
      )}
    </MeContext.Provider>
  )
}
