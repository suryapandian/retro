import { cardsInTopic, topicColumnId, topicsByVotes, voteTotals, votesUsed } from "./reducer";
import type { ActionItem, MemberView, RetroState, RetroView, TopicView } from "./types";

const revealsVotes = (state: RetroState) => state.phase === "discuss" || state.phase === "close";

/**
 * Builds what `viewer` is allowed to see. Card authors never appear; during Think
 * other people's cards are reduced to per-column counts; during Vote only the
 * viewer's own votes are visible.
 */
export function projectView(
  state: RetroState,
  viewer: string,
  online: ReadonlySet<string>,
  actionItems: ActionItem[],
  openActionItemsFromOtherRetros: ActionItem[],
): RetroView {
  const totals = voteTotals(state);
  const myVotes = state.votes[viewer] ?? {};

  const cardCounts: Record<string, number> = Object.fromEntries(state.columns.map((c) => [c.id, 0]));
  for (const card of Object.values(state.cards)) cardCounts[card.columnId] = (cardCounts[card.columnId] ?? 0) + 1;

  const ordered = revealsVotes(state)
    ? topicsByVotes(state)
    : Object.values(state.topics).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const topics: TopicView[] = [];
  for (const topic of ordered) {
    const cards = cardsInTopic(state, topic.id).filter((c) => state.phase !== "think" || c.author === viewer);
    if (cards.length === 0) continue;
    topics.push({
      id: topic.id,
      title: topic.title,
      columnId: topicColumnId(state, topic.id),
      note: topic.note,
      discussed: topic.discussed,
      cards: cards.map((c) => ({ id: c.id, text: c.text, isMine: c.author === viewer })),
      myVotes: myVotes[topic.id] ?? 0,
      ...(revealsVotes(state) ? { totalVotes: totals[topic.id] ?? 0 } : {}),
    });
  }

  const emails = new Set([...Object.keys(state.participants), ...online]);
  const members: MemberView[] = [...emails]
    .map((email) => ({
      email,
      name: state.participants[email]?.name ?? email,
      online: online.has(email),
      done: state.done.includes(email),
      isFacilitator: email === state.facilitator,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const showPrevious = state.phase === "setup" || state.phase === "think";

  return {
    id: state.id,
    title: state.title,
    phase: state.phase,
    columns: state.columns,
    settings: state.settings,
    facilitator: state.facilitator,
    me: { email: viewer, isFacilitator: viewer === state.facilitator },
    members,
    cardCounts,
    topics,
    votesRemaining: Math.max(0, state.settings.votesPerMember - votesUsed(state, viewer)),
    membersOutOfVotes: members.filter((m) => votesUsed(state, m.email) >= state.settings.votesPerMember).length,
    timer: state.timer,
    currentTopicId: state.currentTopicId,
    actionItems,
    previousActionItems: showPrevious ? openActionItemsFromOtherRetros : [],
  };
}
