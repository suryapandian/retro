import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, PHASE_LABELS, type ActionItem, type Member, type RetroSummary, type Template } from '../api'
import ActionItemRow from '../components/ActionItemRow'

function NewRetroForm({ templates }: { templates: Template[] }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('start-stop-continue')
  const [customColumns, setCustomColumns] = useState('')
  const [votes, setVotes] = useState(3)
  const [stacking, setStacking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const custom = templateId === 'custom'
  const template = templates.find((t) => t.id === templateId)

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          const columns = custom
            ? customColumns
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, i) => {
                  const [colTitle, ...prompt] = line.split(':')
                  return { id: `c${i + 1}`, title: colTitle.trim(), ...(prompt.length ? { prompt: prompt.join(':').trim() } : {}) }
                })
            : undefined
          const retro = await api.createRetro({
            title,
            ...(custom ? { columns } : { templateId }),
            settings: { votesPerMember: votes, allowMultipleVotesPerTopic: stacking },
          })
          navigate(`/retro/${retro.id}`)
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
        }
      }}
    >
      <h2 className="font-semibold">New retro</h2>
      <label className="block text-sm">
        Title
        <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sprint 42" maxLength={100} required />
      </label>
      <label className="block text-sm">
        Template
        <select className="input mt-1" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="custom">Custom columns…</option>
        </select>
      </label>
      {custom ? (
        <label className="block text-sm">
          Columns, one per line (optionally <code>Title: prompt</code>)
          <textarea
            className="input mt-1 font-mono"
            rows={4}
            value={customColumns}
            onChange={(e) => setCustomColumns(e.target.value)}
            placeholder={'Kudos: Who helped you?\nPuzzles\nRisks'}
            required
          />
        </label>
      ) : (
        template && <p className="text-xs text-slate-500">Columns: {template.columns.map((c) => c.title).join(' · ')}</p>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Votes each
          <input className="input w-16" type="number" min={1} max={20} value={votes} onChange={(e) => setVotes(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-indigo-600" checked={stacking} onChange={(e) => setStacking(e.target.checked)} />
          Allow several votes on one topic
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        Create retro
      </button>
    </form>
  )
}

function ActionItems({ members }: { members: Member[] }) {
  const [mine, setMine] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [items, setItems] = useState<ActionItem[] | null>(null)
  const nameOf = (email: string) => members.find((m) => m.email === email)?.name ?? email

  const load = useCallback(() => {
    api.actionItems({ mine, all: showDone }).then(setItems)
  }, [mine, showDone])
  useEffect(load, [load])

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Action items</h2>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-indigo-600" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" className="accent-indigo-600" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
          </label>
        </div>
      </div>
      {items === null ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing open. 🎉</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <ActionItemRow
              key={item.id}
              item={item}
              nameOf={nameOf}
              showRetro
              onChange={async (patch) => {
                await api.updateActionItem(item.id, patch)
                load()
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Home() {
  const [retros, setRetros] = useState<RetroSummary[] | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    api.retros().then(setRetros)
    api.templates().then(setTemplates)
    api.members().then(setMembers)
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <datalist id="member-list">
        {members.map((m) => (
          <option key={m.email} value={m.email}>
            {m.name}
          </option>
        ))}
      </datalist>
      <div className="space-y-6">
        <section className="card">
          <h2 className="font-semibold">Retros</h2>
          {retros === null ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : retros.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No retros yet. Create one to get started.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {retros.map((r) => (
                <li key={r.id}>
                  <Link to={`/retro/${r.id}`} className="flex items-center justify-between py-2 hover:text-indigo-700">
                    <span className="font-medium">{r.title}</span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 ${r.phase === 'close' ? 'bg-slate-100' : 'bg-indigo-50 text-indigo-700'}`}>
                        {PHASE_LABELS[r.phase]}
                      </span>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <ActionItems members={members} />
      </div>
      <NewRetroForm templates={templates} />
    </div>
  )
}
