import type { RetroView } from './api'

/** Summary of a retro for pasting into Confluence, Notion or Slack. Never includes card authors. */
export function retroToMarkdown(view: RetroView, nameOf: (email: string) => string): string {
  const columnTitle = (id: string) => view.columns.find((c) => c.id === id)?.title ?? ''
  const lines = [`# ${view.title}`, '']

  lines.push('## Topics', '')
  for (const topic of view.topics) {
    const title = topic.title || topic.cards[0]?.text || 'Untitled'
    const votes = topic.totalVotes ?? 0
    lines.push(`### ${title} (${votes} vote${votes === 1 ? '' : 's'}) · ${columnTitle(topic.columnId)}`)
    for (const card of topic.cards) lines.push(`- ${card.text}`)
    if (topic.note.trim()) lines.push('', `**Notes:** ${topic.note.trim()}`)
    lines.push('')
  }

  lines.push('## Action items', '')
  if (view.actionItems.length === 0) lines.push('_None_')
  for (const item of view.actionItems) {
    const meta = [item.owner && `@${nameOf(item.owner)}`, item.dueDate && `due ${item.dueDate}`].filter(Boolean).join(', ')
    lines.push(`- [${item.done ? 'x' : ' '}] ${item.description}${meta ? ` (${meta})` : ''}`)
  }
  return lines.join('\n') + '\n'
}
