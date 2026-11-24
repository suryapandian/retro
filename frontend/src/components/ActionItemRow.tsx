import { useState } from 'react'
import type { ActionItem, ActionItemPatch } from '../api'

interface Props {
  item: ActionItem
  nameOf: (email: string) => string
  onChange: (patch: ActionItemPatch) => Promise<unknown>
  showRetro?: boolean
  readOnly?: boolean
}

export default function ActionItemRow({ item, nameOf, onChange, showRetro, readOnly }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ description: item.description, owner: item.owner ?? '', dueDate: item.dueDate ?? '' })
  const overdue = !item.done && item.dueDate !== null && item.dueDate < new Date().toISOString().slice(0, 10)

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-2">
        <input className="input flex-1" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={500} />
        <input className="input w-48" list="member-list" placeholder="Owner email" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
        <input className="input w-40" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            await onChange({ description: draft.description, owner: draft.owner.trim() || null, dueDate: draft.dueDate || null })
            setEditing(false)
          }}
        >
          Save
        </button>
        <button className="btn btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-indigo-600"
        checked={item.done}
        disabled={readOnly}
        onChange={(e) => onChange({ done: e.target.checked })}
        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
      />
      <div className="flex-1 text-sm">
        <span className={item.done ? 'text-slate-400 line-through' : ''}>{item.description}</span>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
          {item.owner && <span>@{nameOf(item.owner)}</span>}
          {item.dueDate && <span className={overdue ? 'font-medium text-red-600' : ''}>due {item.dueDate}</span>}
          {showRetro && <span>from {item.retroTitle || 'a deleted retro'}</span>}
        </div>
      </div>
      {!readOnly && (
        <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </li>
  )
}
