import type { ActionItem, ActionItemPatch, Column, Phase, Settings } from '../../worker/src/domain/types'

export type {
  ActionItem,
  ActionItemPatch,
  Column,
  Command,
  Phase,
  RetroView,
  ServerMessage,
  Settings,
  TopicView,
} from '../../worker/src/domain/types'

export interface Member {
  email: string
  name: string
}

export interface RetroSummary {
  id: string
  title: string
  phase: Phase
  facilitator: string
  createdAt: number
  createdBy: string
}

export interface Template {
  id: string
  name: string
  columns: Column[]
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  me: () => request<Member>('/me'),
  setName: (name: string) => request<Member>('/me', { method: 'PUT', body: JSON.stringify({ name }) }),
  members: () => request<Member[]>('/members'),
  templates: () => request<Template[]>('/templates'),
  retros: () => request<RetroSummary[]>('/retros'),
  createRetro: (body: { title: string; templateId?: string; columns?: Column[]; settings?: Partial<Settings> }) =>
    request<RetroSummary>('/retros', { method: 'POST', body: JSON.stringify(body) }),
  deleteRetro: (id: string) => request<void>(`/retros/${id}`, { method: 'DELETE' }),
  actionItems: (opts: { all?: boolean; mine?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (opts.all) q.set('status', 'all')
    if (opts.mine) q.set('owner', 'me')
    return request<ActionItem[]>(`/action-items?${q}`)
  },
  updateActionItem: (id: string, patch: ActionItemPatch) =>
    request<ActionItem>(`/action-items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
}

export const PHASE_LABELS: Record<Phase, string> = {
  setup: 'Setup',
  think: 'Think',
  group: 'Group',
  vote: 'Vote',
  discuss: 'Discuss',
  close: 'Close',
}

export const PHASE_HINTS: Record<Phase, string> = {
  setup: 'Waiting to start. Review last time’s action items while everyone joins.',
  think: 'Add your thoughts. Nobody else can see your cards yet.',
  group: 'Cards are revealed anonymously. Drag cards onto each other to group them into topics.',
  vote: 'Spend your votes on the topics you most want to discuss. Votes stay hidden until voting ends.',
  discuss: 'Discuss topics in vote order and capture action items.',
  close: 'This retro is closed. Copy the summary to share it.',
}
