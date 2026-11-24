import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import type { ActionItem, Command, RetroView, TopicView } from '../api'
import { retroToMarkdown } from '../markdown'
import ActionItemRow from './ActionItemRow'

export interface PhaseProps {
  view: RetroView
  send: (command: Command) => Promise<void>
  nameOf: (email: string) => string
}

type CardView = TopicView['cards'][number]

const topicLabel = (t: TopicView) => t.title || t.cards[0]?.text || 'Untitled'

function Columns({ view, children }: { view: RetroView; children: (columnId: string) => ReactNode }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}>
      {view.columns.map((c) => (
        <section key={c.id} className="space-y-2 rounded-lg bg-slate-100/70 p-3">
          <header>
            <h3 className="font-semibold">{c.title}</h3>
            {c.prompt && <p className="text-xs text-slate-500">{c.prompt}</p>}
          </header>
          {children(c.id)}
        </section>
      ))}
    </div>
  )
}

function CardText({ card, editable, send }: { card: CardView; editable: boolean; send: PhaseProps['send'] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(card.text)
  if (editing) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          await send({ type: 'editCard', cardId: card.id, text })
          setEditing(false)
        }}
        className="space-y-1"
      >
        <textarea className="input text-sm" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
        <div className="flex gap-1">
          <button className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    )
  }
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {card.text}
      {editable && card.isMine && (
        <button
          className="ml-2 text-xs text-slate-400 hover:text-slate-700"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setText(card.text)
            setEditing(true)
          }}
        >
          edit
        </button>
      )}
    </p>
  )
}

function PreviousActionItems({ view, send, nameOf }: PhaseProps) {
  if (view.previousActionItems.length === 0) return null
  return (
    <section className="card">
      <h2 className="font-semibold">Open action items from earlier retros</h2>
      <p className="text-xs text-slate-500">Check these off as you review them.</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {view.previousActionItems.map((item) => (
          <ActionItemRow key={item.id} item={item} nameOf={nameOf} showRetro onChange={(patch) => send({ type: 'updateActionItem', id: item.id, patch })} />
        ))}
      </ul>
    </section>
  )
}

export function SetupView(props: PhaseProps) {
  const { view, send } = props
  const [title, setTitle] = useState(view.title)
  return (
    <div className="space-y-4">
      {view.me.isFacilitator ? (
        <form
          className="card flex flex-wrap items-end gap-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            send({ type: 'updateSettings', title })
          }}
        >
          <label className="flex-1">
            Title
            <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </label>
          <label>
            Votes each
            <input
              className="input mt-1 w-20"
              type="number"
              min={1}
              max={20}
              value={view.settings.votesPerMember}
              onChange={(e) => send({ type: 'updateSettings', settings: { votesPerMember: Number(e.target.value) } })}
            />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={view.settings.allowMultipleVotesPerTopic}
              onChange={(e) => send({ type: 'updateSettings', settings: { allowMultipleVotesPerTopic: e.target.checked } })}
            />
            Allow several votes on one topic
          </label>
          <button className="btn">Save title</button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">Waiting for the facilitator to start the retro.</p>
      )}
      <PreviousActionItems {...props} />
      <Columns view={view}>{() => <p className="text-xs text-slate-400">Cards go here once Think starts.</p>}</Columns>
    </div>
  )
}

function AddCard({ columnId, send }: { columnId: string; send: PhaseProps['send'] }) {
  const [text, setText] = useState('')
  const submit = async () => {
    if (!text.trim()) return
    await send({ type: 'addCard', columnId, text })
    setText('')
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        className="input text-sm"
        rows={2}
        value={text}
        maxLength={500}
        placeholder="Add a card… (Enter to save)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
    </form>
  )
}

export function ThinkView(props: PhaseProps) {
  const { view, send } = props
  return (
    <div className="space-y-4">
      <Columns view={view}>
        {(columnId) => {
          const mine = view.topics.filter((t) => t.columnId === columnId).flatMap((t) => t.cards)
          const others = (view.cardCounts[columnId] ?? 0) - mine.length
          return (
            <>
              <AddCard columnId={columnId} send={send} />
              {mine.map((card) => (
                <div key={card.id} className="rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                  <CardText card={card} editable send={send} />
                  <button className="text-xs text-red-500 hover:text-red-700" onClick={() => send({ type: 'deleteCard', cardId: card.id })}>
                    delete
                  </button>
                </div>
              ))}
              {others > 0 && (
                <p className="text-xs text-slate-500">
                  + {others} hidden card{others === 1 ? '' : 's'} from others
                </p>
              )}
            </>
          )
        }}
      </Columns>
      <PreviousActionItems {...props} />
    </div>
  )
}

function DraggableCard({ card, multi, send }: { card: CardView; multi: boolean; send: PhaseProps['send'] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`cursor-grab rounded-md border border-slate-200 bg-white p-2 shadow-sm ${isDragging ? 'relative z-10 opacity-80 shadow-lg' : ''}`}
    >
      <CardText card={card} editable send={send} />
      {multi && (
        <button
          className="text-xs text-slate-400 hover:text-slate-700"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => send({ type: 'detachCard', cardId: card.id })}
        >
          ungroup
        </button>
      )}
    </div>
  )
}

function TopicTitle({ topic, send }: { topic: TopicView; send: PhaseProps['send'] }) {
  const [title, setTitle] = useState(topic.title)
  return (
    <input
      className="w-full border-0 border-b border-transparent bg-transparent px-0 text-sm font-medium focus:border-indigo-400 focus:outline-none"
      placeholder="Name this topic…"
      value={title}
      maxLength={100}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => title !== topic.title && send({ type: 'renameTopic', topicId: topic.id, title })}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function DroppableTopic({ topic, send }: { topic: TopicView; send: PhaseProps['send'] }) {
  const { setNodeRef, isOver } = useDroppable({ id: topic.id })
  const multi = topic.cards.length > 1
  return (
    <div
      ref={setNodeRef}
      className={`space-y-1.5 rounded-lg border-2 p-1.5 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50' : multi ? 'border-slate-300 bg-slate-50' : 'border-transparent'
      }`}
    >
      {multi && <TopicTitle key={topic.title} topic={topic} send={send} />}
      {topic.cards.map((card) => (
        <DraggableCard key={card.id} card={card} multi={multi} send={send} />
      ))}
    </div>
  )
}

export function GroupView({ view, send }: PhaseProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const topicOfCard = new Map(view.topics.flatMap((t) => t.cards.map((c) => [c.id, t.id] as const)))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || topicOfCard.get(String(active.id)) === over.id) return
    send({ type: 'moveCard', cardId: String(active.id), targetTopicId: String(over.id) })
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <Columns view={view}>
        {(columnId) =>
          view.topics
            .filter((t) => t.columnId === columnId)
            .map((topic) => <DroppableTopic key={topic.id} topic={topic} send={send} />)
        }
      </Columns>
    </DndContext>
  )
}

function TopicCards({ topic }: { topic: TopicView }) {
  return (
    <ul className="space-y-1">
      {topic.cards.map((c) => (
        <li key={c.id} className="text-sm whitespace-pre-wrap break-words text-slate-700">
          {topic.cards.length > 1 && '• '}
          {c.text}
        </li>
      ))}
    </ul>
  )
}

export function VoteView({ view, send }: PhaseProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        You have <span className="text-indigo-700">{view.votesRemaining}</span> vote{view.votesRemaining === 1 ? '' : 's'} left.
        {view.me.isFacilitator && (
          <span className="ml-2 font-normal text-slate-500">
            {view.membersOutOfVotes} of {view.members.length} have used all their votes.
          </span>
        )}
      </p>
      <Columns view={view}>
        {(columnId) =>
          view.topics
            .filter((t) => t.columnId === columnId)
            .map((topic) => (
              <div key={topic.id} className={`rounded-md border bg-white p-2 shadow-sm ${topic.myVotes ? 'border-indigo-300' : 'border-slate-200'}`}>
                {topic.title && <p className="mb-1 text-sm font-medium">{topic.title}</p>}
                <TopicCards topic={topic} />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="btn btn-sm"
                    disabled={view.votesRemaining === 0 || (!view.settings.allowMultipleVotesPerTopic && topic.myVotes > 0)}
                    onClick={() => send({ type: 'vote', topicId: topic.id })}
                    aria-label="Add vote"
                  >
                    +
                  </button>
                  <span className="text-indigo-600" aria-label={`${topic.myVotes} votes`}>
                    {'●'.repeat(topic.myVotes)}
                  </span>
                  {topic.myVotes > 0 && (
                    <button className="btn btn-sm" onClick={() => send({ type: 'unvote', topicId: topic.id })} aria-label="Remove vote">
                      −
                    </button>
                  )}
                </div>
              </div>
            ))
        }
      </Columns>
    </div>
  )
}

function AddActionItem({ topicId, send }: { topicId: string | null; send: PhaseProps['send'] }) {
  const [description, setDescription] = useState('')
  const [owner, setOwner] = useState('')
  const [dueDate, setDueDate] = useState('')
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        await send({ type: 'addActionItem', topicId, description, owner: owner.trim() || null, dueDate: dueDate || null })
        setDescription('')
        setOwner('')
        setDueDate('')
      }}
    >
      <input className="input min-w-48 flex-1" placeholder="New action item…" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} required />
      <input className="input w-44" list="member-list" placeholder="Owner (optional)" value={owner} onChange={(e) => setOwner(e.target.value)} />
      <input className="input w-40" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button className="btn btn-primary">Add</button>
    </form>
  )
}

function Notes({ topic, send }: { topic: TopicView; send: PhaseProps['send'] }) {
  const [note, setNote] = useState(topic.note)
  return (
    <textarea
      className="input text-sm"
      rows={3}
      placeholder="Discussion notes (saved when you click away)"
      value={note}
      maxLength={5000}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => note !== topic.note && send({ type: 'setTopicNote', topicId: topic.id, note })}
    />
  )
}

function ActionItemList({ items, props, readOnly }: { items: ActionItem[]; props: PhaseProps; readOnly?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No action items yet.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <ActionItemRow
          key={item.id}
          item={item}
          nameOf={props.nameOf}
          readOnly={readOnly}
          onChange={(patch) => props.send({ type: 'updateActionItem', id: item.id, patch })}
        />
      ))}
    </ul>
  )
}

export function DiscussView(props: PhaseProps) {
  const { view, send } = props
  const current = view.topics.find((t) => t.id === view.currentTopicId) ?? null
  const columnTitle = (id: string) => view.columns.find((c) => c.id === id)?.title
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_2fr]">
      <ol className="space-y-1.5">
        {view.topics.map((topic) => (
          <li key={topic.id}>
            <button
              disabled={!view.me.isFacilitator}
              onClick={() => send({ type: 'setCurrentTopic', topicId: topic.id })}
              className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm disabled:cursor-default ${
                topic.id === view.currentTopicId ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'
              } ${topic.discussed ? 'opacity-60' : ''}`}
            >
              <span className="min-w-6 rounded bg-slate-100 px-1 text-center font-mono text-xs leading-5">{topic.totalVotes}</span>
              <span className="flex-1">
                {topicLabel(topic)}
                <span className="block text-xs text-slate-400">{columnTitle(topic.columnId)}</span>
              </span>
              {topic.discussed && <span className="text-emerald-600">✓</span>}
            </button>
          </li>
        ))}
      </ol>
      <div className="space-y-4">
        {current ? (
          <section className="card space-y-3" key={current.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">
                  {columnTitle(current.columnId)} · {current.totalVotes} vote{current.totalVotes === 1 ? '' : 's'}
                </p>
                <h2 className="text-lg font-semibold">{topicLabel(current)}</h2>
              </div>
              <div className="flex shrink-0 gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    className="accent-indigo-600"
                    checked={current.discussed}
                    onChange={(e) => send({ type: 'setTopicDiscussed', topicId: current.id, discussed: e.target.checked })}
                  />
                  Discussed
                </label>
                {view.me.isFacilitator && (
                  <button className="btn btn-primary btn-sm" onClick={() => send({ type: 'nextTopic' })}>
                    Next topic →
                  </button>
                )}
              </div>
            </div>
            <TopicCards topic={current} />
            <Notes key={current.note} topic={current} send={send} />
            <AddActionItem topicId={current.id} send={send} />
          </section>
        ) : (
          <section className="card space-y-3">
            <p className="text-sm text-slate-600">
              {view.topics.every((t) => t.discussed) ? 'All topics discussed. 🎉' : 'No topic selected.'}
            </p>
            <AddActionItem topicId={null} send={send} />
          </section>
        )}
        <section className="card">
          <h2 className="mb-2 font-semibold">Action items</h2>
          <ActionItemList items={view.actionItems} props={props} />
        </section>
      </div>
    </div>
  )
}

export function CloseView(props: PhaseProps) {
  const { view, nameOf } = props
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-4">
      <button
        className="btn btn-primary"
        onClick={async () => {
          await navigator.clipboard.writeText(retroToMarkdown(view, nameOf))
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied!' : 'Copy summary as Markdown'}
      </button>
      <section className="card">
        <h2 className="mb-2 font-semibold">Action items</h2>
        <ActionItemList items={view.actionItems} props={props} />
      </section>
      <section className="space-y-2">
        {view.topics.map((topic) => (
          <div key={topic.id} className="card">
            <p className="text-xs text-slate-500">
              {view.columns.find((c) => c.id === topic.columnId)?.title} · {topic.totalVotes} vote{topic.totalVotes === 1 ? '' : 's'}
            </p>
            {topic.title && <h3 className="font-medium">{topic.title}</h3>}
            <TopicCards topic={topic} />
            {topic.note && <p className="mt-2 text-sm whitespace-pre-wrap text-slate-600">📝 {topic.note}</p>}
          </div>
        ))}
      </section>
    </div>
  )
}
