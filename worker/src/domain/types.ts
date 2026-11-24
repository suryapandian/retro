export const PHASES = ["setup", "think", "group", "vote", "discuss", "close"] as const;
export type Phase = (typeof PHASES)[number];

export interface Column {
  id: string;
  title: string;
  prompt?: string;
}

export interface Settings {
  votesPerMember: number;
  allowMultipleVotesPerTopic: boolean;
}

export interface Card {
  id: string;
  columnId: string;
  topicId: string;
  text: string;
  // Never leaves the server: views only expose `isMine`.
  author: string;
  createdAt: number;
}

export interface Topic {
  id: string;
  title: string;
  note: string;
  discussed: boolean;
  createdAt: number;
}

export interface Participant {
  name: string;
}

export interface RetroState {
  id: string;
  title: string;
  createdAt: number;
  createdBy: string;
  facilitator: string;
  facilitatorLastSeenAt: number;
  phase: Phase;
  columns: Column[];
  settings: Settings;
  participants: Record<string, Participant>;
  cards: Record<string, Card>;
  topics: Record<string, Topic>;
  // member email -> topic id -> number of votes
  votes: Record<string, Record<string, number>>;
  // members who marked themselves done in the current phase
  done: string[];
  timer: { endsAt: number } | null;
  currentTopicId: string | null;
}

export interface ActionItem {
  id: string;
  retroId: string;
  retroTitle: string;
  topicId: string | null;
  description: string;
  owner: string | null;
  dueDate: string | null;
  done: boolean;
  createdAt: number;
  createdBy: string;
}

export interface ActionItemPatch {
  description?: string;
  owner?: string | null;
  dueDate?: string | null;
  done?: boolean;
}

export type Command =
  | { type: "updateSettings"; title?: string; columns?: Column[]; settings?: Partial<Settings> }
  | { type: "addCard"; columnId: string; text: string }
  | { type: "editCard"; cardId: string; text: string }
  | { type: "deleteCard"; cardId: string }
  | { type: "setDone"; done: boolean }
  | { type: "moveCard"; cardId: string; targetTopicId: string }
  | { type: "detachCard"; cardId: string }
  | { type: "renameTopic"; topicId: string; title: string }
  | { type: "vote"; topicId: string }
  | { type: "unvote"; topicId: string }
  | { type: "setCurrentTopic"; topicId: string | null }
  | { type: "nextTopic" }
  | { type: "setTopicDiscussed"; topicId: string; discussed: boolean }
  | { type: "setTopicNote"; topicId: string; note: string }
  | { type: "addActionItem"; description: string; topicId?: string | null; owner?: string | null; dueDate?: string | null }
  | { type: "updateActionItem"; id: string; patch: ActionItemPatch }
  | { type: "startTimer"; seconds: number }
  | { type: "stopTimer" }
  | { type: "advancePhase" }
  | { type: "revertPhase" }
  | { type: "transferFacilitator"; to: string }
  | { type: "claimFacilitator" };

// Side effects the Retro Room shell performs after a command is accepted.
export type Effect =
  | { type: "createActionItem"; topicId: string | null; description: string; owner: string | null; dueDate: string | null }
  | { type: "updateActionItem"; id: string; patch: ActionItemPatch };

export interface CommandContext {
  actor: string;
  now: number;
  online: ReadonlySet<string>;
  newId: () => string;
}

export type CommandResult =
  | { ok: true; state: RetroState; effects: Effect[] }
  | { ok: false; reason: string };

export interface CardView {
  id: string;
  text: string;
  isMine: boolean;
}

export interface TopicView {
  id: string;
  title: string;
  columnId: string;
  note: string;
  discussed: boolean;
  cards: CardView[];
  myVotes: number;
  // Only present from the Discuss phase onwards.
  totalVotes?: number;
}

export interface MemberView {
  email: string;
  name: string;
  online: boolean;
  done: boolean;
  isFacilitator: boolean;
}

export interface RetroView {
  id: string;
  title: string;
  phase: Phase;
  columns: Column[];
  settings: Settings;
  facilitator: string;
  me: { email: string; isFacilitator: boolean };
  members: MemberView[];
  // Total cards per column, including other people's hidden cards during Think.
  cardCounts: Record<string, number>;
  topics: TopicView[];
  votesRemaining: number;
  membersOutOfVotes: number;
  timer: { endsAt: number } | null;
  currentTopicId: string | null;
  actionItems: ActionItem[];
  previousActionItems: ActionItem[];
}

export type ClientMessage = { requestId: string; command: Command };

export type ServerMessage =
  | { type: "view"; view: RetroView }
  | { type: "ack"; requestId: string }
  | { type: "rejected"; requestId: string; reason: string };
