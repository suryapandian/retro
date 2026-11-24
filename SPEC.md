# Spec: Lightweight team retrospective app (Retrium-lite) on Cloudflare

Labels: `ready-for-agent`

## Problem Statement

Our team runs regular retrospectives and wants the structured, facilitated experience that Retrium offers: private brainstorming, anonymous cards, grouping, dot voting, a focused discussion and action items that carry over to the next retro. A paid SaaS seat-based product is overkill for one internal team, and generic whiteboards or docs don't enforce the flow. Without that flow, people anchor on each other's cards, louder voices dominate, votes get gamed, and action items are forgotten by the next retro.

## Solution

Build a small, internal-only web app, hosted on Cloudflare Pages, that runs a facilitated retrospective in real time:

- Anyone on the team opens the app (protected by Cloudflare Access, so there's no sign-up), creates a retro from a template, and shares the link.
- The retro moves through fixed **phases** controlled by the **facilitator**: **Think** (everyone writes cards privately), **Group** (cards are revealed anonymously and clustered into **topics**), **Vote** (each participant has a limited number of dot votes, hidden until the phase ends), **Discuss** (topics in vote order, one at a time, with a timer, notes and **action items**), and **Close** (summary and export).
- Every participant sees updates live. Card authorship is never shown to anyone else.
- Open action items from earlier retros are shown at the start of the next retro and on a team-wide action item list, so they get followed up.

## Glossary

The spec and the code should use these terms consistently.

- **Team**: the single group of people allowed through Cloudflare Access. There is exactly one team.
- **Member**: a person identified by their Access email address.
- **Retro**: one retrospective session, with a title, a template, settings, a phase, and its contents.
- **Facilitator**: the member who controls phase changes and the timer in a retro. By default this is the creator, and the role can be handed over.
- **Participant**: a member currently connected to, or who has contributed to, a retro.
- **Template**: a named set of **columns** (prompts), such as "Start / Stop / Continue".
- **Card**: one piece of text written by a participant in a column.
- **Topic**: a group of one or more cards that are discussed and voted on together. Every card belongs to exactly one topic. A card that hasn't been grouped is a single-card topic.
- **Vote**: a dot that a participant places on a topic.
- **Action item**: a follow-up task with a description, an optional owner (a member) and an optional due date, raised in a retro and tracked across retros.
- **Phase**: one of Setup, Think, Group, Vote, Discuss, Close.
- **View**: the copy of a retro's state that the server builds for a specific participant, with hidden information removed.

## User Stories

### Access and identity
1. As a team member, I want to reach the app through our company SSO via Cloudflare Access, so that I don't need another account or password.
2. As a team member, I want the app to know who I am automatically from my Access identity, so that my votes and action items are attributed correctly without typing my name.
3. As a team member, I want to set a display name the first time I use the app, so that teammates see a friendly name instead of my email.
4. As a team admin, I want anyone outside the Access policy to be blocked before reaching the app or its API, so that retro contents stay internal.
5. As a team admin, I want preview deployments to be protected by the same Access policy, so that test builds don't leak data.

### Home and team dashboard
6. As a team member, I want a home page listing recent retros, newest first, with their phase and date, so that I can join the current one or review past ones.
7. As a team member, I want to see all open action items across all retros on the home page, so that I know what the team has committed to.
8. As a team member, I want to filter action items to the ones assigned to me, so that I can see my own commitments.
9. As a team member, I want to mark an action item done, or reopen it, from the home page, so that the list stays current between retros.
10. As a team member, I want to edit an action item's description, owner or due date from the home page, so that I can fix mistakes after a retro.

### Creating a retro
11. As a facilitator, I want to create a retro with a title, so that it can be found later (for example "Sprint 42").
12. As a facilitator, I want to choose a template (Start/Stop/Continue, Mad/Sad/Glad, 4Ls, Went Well/To Improve/Ideas, or Sailboat), so that I can vary the format.
13. As a facilitator, I want to define custom columns (a name and an optional prompt) instead of a template, so that I can run a themed retro.
14. As a facilitator, I want to set the number of votes per participant (default 3), so that voting is scaled to the size of the board.
15. As a facilitator, I want to choose whether a participant may put more than one vote on the same topic (default: yes), so that I can tune voting behaviour.
16. As a facilitator, I want a shareable link to the retro, so that I can drop it into our meeting chat.
17. As a facilitator, I want to edit the title, columns and settings while the retro is in Setup, so that I can fix mistakes before we start.

### Joining and presence
18. As a participant, I want to open the retro link and land directly in the live board, so that joining is one click.
19. As a participant, I want to see who is currently connected, so that the facilitator knows when everyone has arrived.
20. As a participant, I want to see during Think how many cards each column has (but not their content), so that I can sense progress without being influenced.
21. As a participant, I want to see which participants have marked themselves "done" in the current phase, so that the facilitator knows when to move on.
22. As a participant, I want my connection to recover automatically after a network blip or laptop sleep, without losing anything, so that the session isn't disrupted.
23. As a participant who joins late, I want to see the board as it currently stands for my phase, so that I can catch up.

### Think phase (private brainstorming)
24. As a participant, I want to add cards to any column, so that I can share my thoughts.
25. As a participant, I want my cards to be visible only to me during Think, so that I'm not influenced by others and others aren't influenced by me.
26. As a participant, I want to edit and delete my own cards during Think, so that I can refine what I wrote.
27. As a participant, I want my cards saved on the server as soon as I add them, so that a refresh doesn't lose them.
28. As a participant, I want to mark myself as done thinking, so that the facilitator can see I'm ready.
29. As a facilitator, I want to start a countdown timer for the phase, so that the group keeps to time.
30. As a participant, I want to see the same timer countdown as everyone else, so that I know how long remains.

### Group phase
31. As a participant, I want all cards to be revealed anonymously when Group starts, so that ideas are judged on their merit.
32. As a participant, I want to drag one card onto another to put them in a topic together, so that duplicates and related ideas are clustered.
33. As a participant, I want to drag a card out of a topic, so that I can undo a wrong grouping.
34. As a participant, I want to give a topic a short title, so that clustered cards are easy to refer to.
35. As a participant, I want to see other people's grouping changes live, so that we don't fight over the same cards.
36. As a participant, I want topics to keep the column of the first card in them, so that the board stays organised.
37. As a participant, I want to be unable to see who wrote any card, including in groups, so that anonymity is preserved.
38. As the author of a card, I want to still be able to fix a typo in my own card during Group, so that the meaning is clear.

### Vote phase
39. As a participant, I want to put my votes on topics, so that we prioritise what to discuss.
40. As a participant, I want to see how many votes I have left, so that I can plan my votes.
41. As a participant, I want to remove a vote I placed, so that I can change my mind.
42. As a participant, I want other people's votes hidden until the Vote phase ends, so that I'm not swayed by the crowd.
43. As a participant, I want the app to stop me from going over my vote limit (or stacking votes when that is turned off), so that voting is fair.
44. As a facilitator, I want to see how many participants have used all of their votes, so that I know when to close voting.

### Discuss phase
45. As a participant, I want topics sorted by total votes, highest first, so that we discuss what matters most.
46. As a facilitator, I want to choose which topic is being discussed now, and everyone's screen highlights it, so that we stay focused.
47. As a facilitator, I want to move to the next topic in vote order with one click, so that the meeting flows.
48. As a facilitator, I want a timer for each topic, so that discussions are time-boxed.
49. As a participant, I want to add free-text discussion notes to a topic, so that key points are recorded.
50. As a participant, I want to add an action item linked to the topic being discussed, so that decisions turn into follow-ups.
51. As a participant, I want to assign an action item to a member and give it an optional due date, so that ownership is clear.
52. As a participant, I want to mark a topic as discussed, so that we can see progress through the list.

### Reviewing previous action items
53. As a facilitator, I want the open action items from earlier retros shown at the start of a new retro (in Setup and Think), so that we review follow-through before brainstorming.
54. As a participant, I want to mark earlier action items done during the retro, so that the review happens in the meeting.

### Close phase
55. As a facilitator, I want to close the retro, so that it becomes read-only.
56. As a participant, I want a summary of a closed retro showing topics, votes, notes and action items, so that I can refer back to it.
57. As a participant, I want to copy the summary as Markdown, so that I can paste it into Confluence, Notion or Slack.
58. As a team member, I want action items from closed retros to remain editable on the dashboard, so that follow-up continues after the retro.

### Facilitation controls
59. As a facilitator, I want to move to the next phase, so that I control the pace.
60. As a facilitator, I want to go back one phase (for example from Vote back to Group), so that I can recover if we moved on too soon.
61. As a facilitator, I want to hand the facilitator role to another participant, so that someone else can take over if I drop off.
62. As a participant, I want any member to be able to claim the facilitator role if the facilitator has been disconnected for more than 2 minutes, so that a retro is never stuck.
63. As a facilitator, I want to delete a retro, so that test or mistaken retros don't clutter history.
64. As a participant, I want controls I'm not allowed to use (facilitator-only actions, or actions invalid in the current phase) to be hidden or disabled, and rejected by the server if attempted, so that the flow can't be broken.

### General usability
65. As a participant, I want the board to work in current desktop browsers at common laptop widths, so that I can use it in a video call.
66. As a participant, I want it to be usable on a phone for adding cards and voting, so that I can join from anywhere.
67. As a participant, I want clear feedback when an action fails (for example "out of votes"), so that I understand what happened.
68. As a participant, I want the app to load quickly and feel instant, so that it doesn't slow the meeting down.

## Implementation Decisions

### Platform and hosting
This follows the setup of the user's existing Roster project on the same Cloudflare account, and stays entirely on the **Workers Free plan**.

- **Repository shape (same as Roster)**:
  - a frontend package and a worker package side by side;
  - a justfile with `dev`, `frontend`, `worker` and `kill` recipes, using tmux to run `wrangler dev` and `vite` together;
  - GitHub Actions CI that lints, builds and tests both packages on pushes to `main`/`develop` and on PRs. On pushes to `main` it deploys the worker (`wrangler deploy`; there is only one environment, so no `--env production` as in Roster) and then the frontend (`wrangler pages deploy dist --project-name retro-truelayer`), using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
- **Frontend**: TypeScript, React, Vite, React Router and Tailwind CSS (the same stack as Roster). It's deployed to a Cloudflare Pages project called `retro-truelayer`, at `retro-truelayer.pages.dev`. Drag and drop for grouping uses dnd-kit. Styling is plain and functional.
- **Backend worker** (`retro-worker`): a separate Cloudflare Worker, like Roster's `roster-worker`, that holds all the API logic and the Durable Object classes. It's written in **TypeScript, not Rust** as Roster is, because Durable Objects, the WebSocket Hibernation API and `@cloudflare/vitest-plugin` are first-class in TypeScript and immature in `worker-rs`.
- **One origin for the browser (differs from Roster)**: in Roster the browser calls the worker's `*.workers.dev` URL directly with CORS. Here the Pages project has a single catch-all Pages Function under `/api/*`. It forwards every request, including WebSocket upgrades, to `retro-worker` through a **service binding**. The worker's `workers.dev` route is turned off, so it can't be reached from the internet. As a result:
  - only one hostname needs Cloudflare Access protection;
  - there's no CORS;
  - WebSockets carry the Access cookie automatically;
  - the frontend calls relative `/api` URLs, so it doesn't need a `VITE_API_URL` build variable.
- **Storage**: Durable Objects with SQLite-backed storage, which is available on the Workers Free plan. There is no D1 database, unlike Roster, and no migrations step.
  - **Retro Room DO**, one per retro, keyed by retro id. It is the single source of truth for that retro's columns, cards, topics, votes, notes, phase, timer and facilitator.
  - **Team DO**, a single instance. It holds the retro index (id, title, created at, phase, facilitator), all action items, and member display names. Action items live here, not in the Retro Room, so that they can be listed and edited across retros. Retro Rooms call the Team DO when action items are created or changed and when their phase changes.
- **Real-time transport**: WebSockets from the browser go to the Pages Function, then to `retro-worker`, then to the Retro Room DO. The DO uses the WebSocket Hibernation API, so idle retros cost nothing.

### Identity and access
- The `retro-truelayer.pages.dev` hostname and its preview hostnames (`*.retro-truelayer.pages.dev`) sit behind a Cloudflare Access (Zero Trust Free plan, up to 50 users) self-hosted application. Its policy allows the company email domain, using either the company identity provider or Access's built-in one-time PIN by email.
- The forwarding Pages Function validates the `Cf-Access-Jwt-Assertion` JWT against the team's Access certificates and audience tag (both configured as Pages environment variables). It rejects requests that aren't authenticated with 401, and forwards the verified email to the worker in an internal identity header. Because the worker can only be reached through the service binding, it trusts that header. Clients can never set their identity themselves, because the function overwrites the header.
- For local development, `wrangler dev` on the worker runs with a dev-only setting that accepts the identity header straight from the Vite dev proxy, so you can act as different members by setting a value in local storage. The setting is off in the production environment.
- Display names are stored per member in the Team DO, and the email is the default.

### Retro Room module (the core)
- It's a deep module with a small interface: it accepts **commands** from an identified member and broadcasts a **view** to each connected participant.
- Internally it's split into:
  - A **pure reducer**: `(state, command, actor, now) -> new state | rejection with reason`. All phase rules, permission checks (facilitator-only commands), vote limits and anonymity-sensitive rules live here.
  - A **view projection**: `(state, member) -> view`. It removes hidden information. During Think, other people's card text is removed and only counts per column remain. Card authors are never included, but cards carry an `isMine` flag. During Vote, only the viewer's own votes are included, with no totals. Totals appear from Discuss onwards.
  - A thin DO shell that persists state, manages sockets and presence, and sends a fresh projected view to every socket after each accepted command.
- **Protocol**: the client sends JSON commands with a client-generated request id. The server replies with `ack` or `rejected {reason}` for that request id, then broadcasts the full projected view. Boards are small (fewer than a few hundred cards), so we send full views instead of diffs. This keeps clients simple and makes reconnecting trivial: the client reconnects and receives the current view.
- **Commands** (initial set): update settings, add card, edit card, delete card, mark done, move card to topic, detach card into its own topic, rename topic, add vote, remove vote, set current topic, mark topic discussed, add or edit topic note, add action item, update action item, start timer, stop timer, advance phase, revert phase, transfer facilitator, claim facilitator, close.
- **Phase rules**:
  - Phases move in order: Setup → Think → Group → Vote → Discuss → Close.
  - Only the facilitator can move forward or back. Reverting from Discuss to Vote keeps existing votes.
  - Close is final, and the retro becomes read-only.
  - Cards can be added only in Think. They can be edited by their author in Think and Group, and deleted by their author only in Think.
  - Grouping is allowed only in Group, voting only in Vote, notes and action items only in Discuss. Action items can also be edited at any time through the Team DO.
- **Topics**: every card belongs to exactly one topic, and a new card creates a single-card topic. Merging moves the card into the target topic. A topic left with no cards is removed. A topic's column is the column of its earliest card.
- **Votes** belong to topics. If grouping changes after votes are cast (possible only after reverting a phase), votes on removed topics are given back to their voters.
- **Timer**: the server stores the end time, and clients count down locally from it. Expiry is informational only and doesn't advance the phase automatically.
- **Facilitator fallback**: presence tracks when the facilitator was last connected. A claim command succeeds only if the facilitator has been disconnected for more than 2 minutes.
- Authorship is stored on the server (so authors can edit their own cards) but never leaves the server in a view, or in exports or summaries. This is a hard rule.

### HTTP API (served by `retro-worker` under `/api`, reached through the Pages Function)
- List retros. Create a retro (template or custom columns, settings). Delete a retro (facilitator only).
- Get a retro summary (read-only and anonymised, used for Close and for history).
- List and update action items (any member). Get and set your own display name.
- Open a WebSocket to a retro.
- Templates are static data shipped with the code. They aren't stored.

### Export
- Markdown export is generated on the client from the summary view: topics in vote order with their cards, vote counts, notes and action items. No author information is included.

### Operational
- Data is kept indefinitely. Volume is tiny.
- **Free-plan budget**: the Workers Free plan allows about 100k requests per day. For Durable Objects, incoming WebSocket messages are billed at 20 messages per request, and the hibernation API means idle sockets use no duration. A weekly retro for 10–15 people uses a tiny fraction of the daily allowance. The client must not send heartbeats more often than every 30 seconds, and must not send per-keystroke messages. Card text is sent when the user saves the card, not while typing.
- Deployment is done by CI on `main`, as in Roster, or by hand from a laptop through just recipes.
- **One-off manual setup**, documented in the README:
  - create the `retro-truelayer` Pages project;
  - add the service binding from Pages to `retro-worker`;
  - create the Access application and policy;
  - set the Access audience and team-domain environment variables on Pages;
  - add the two GitHub secrets, if the repo doesn't already share them with Roster.
- The worker enables Workers observability logs, as Roster does.

## Testing Decisions

- **One seam**: the `retro-worker`'s fetch interface, meaning the HTTP API plus the Retro Room WebSocket protocol. It runs in-process with Vitest and `@cloudflare/vitest-plugin` against real local Durable Objects. Tests act as several members by setting the internal identity header, which is what the Pages Function does in production. They send commands and assert on each member's **view** and on ack/rejection responses.
- The forwarding Pages Function is deliberately tiny: verify the JWT, set the header, forward. It gets a couple of tests: a missing or invalid JWT gives 401, and a client-supplied identity header gets overwritten. Its JWT verification uses a library rather than custom crypto.
- A good test describes behaviour a user would recognise, for example:
  - "Bob can't see Alice's card text during Think."
  - "After Group starts, Bob sees Alice's card with no author."
  - "A fourth vote is rejected when the limit is 3."
  - "Vote totals are hidden until Discuss."
  - "Only the facilitator can advance the phase."
  - "An action item created in Discuss shows up in the team action item list."
  - "A reconnecting client receives the current view."
- Tests must not reach into the reducer's state shape, storage layout or internal helpers. The reducer and projection are implementation details behind the seam. If a rule is awkward to test through the protocol, that's a sign the protocol is missing something.
- Anonymity is the property that matters most. Every phase gets a test that serialises each participant's view and the summary or export and asserts that no other member's email or display name appears as a card author.
- The frontend has no automated tests in the first iteration. It's a thin renderer of views and sender of commands, and it is checked by hand with `just dev`. A small Playwright smoke test (create retro → add card → advance through all phases → export) can be added later if regressions appear.
- CI runs the worker test suite before any deploy step, which is stricter than Roster's CI, which only builds and lints.
- Prior art: this repository is empty. The sibling Roster project uses Vitest with Testing Library for its frontend but has no worker tests, so these tests set the pattern for the worker.

## Out of Scope

- Multiple teams, workspaces or organisations, and in-app user or role management. Access policy membership is the team list.
- Any authentication other than Cloudflare Access.
- Retrium's team health radar and health checks, analytics and trend reports, and the "Lean Coffee" and other non-retro formats.
- Integrations (Jira, Slack, Confluence). Markdown copy and paste is the integration.
- Built-in video or audio, chat, emoji reactions, card colours, or images on cards.
- Card authorship reveal or a non-anonymous mode.
- Offline editing, and undo/redo beyond the specific reversals listed above.
- Fine-grained per-retro permissions (for example private retros).
- Data retention policies or automated deletion.
- Visual polish beyond clean and functional, internationalisation, and formal accessibility certification. The app should still use semantic HTML and be keyboard-operable for core actions.

## Further Notes

- **Cost**: $0. It uses the Workers Free plan (Pages, Workers, SQLite-backed Durable Objects) and the Zero Trust Free plan (Access, up to 50 users). It runs on the same Cloudflare account as Roster. Zero Trust onboarding may ask for a payment method even on the Free plan, so check this during the one-off setup.
- **Order of deployment**: deploy the worker first, because the Pages service binding needs the worker to exist. CI already does this.
- **Suggested build order** (each step is a vertical slice that can be shipped):
  1. Deployable skeleton: frontend on Pages, `retro-worker` behind the service binding, Access, CI deploy, and create and list retros.
  2. Retro Room with Think and Group, live views.
  3. Vote and Discuss.
  4. Action items and the Team DO dashboard.
  5. Close, summary and Markdown export.
  6. Facilitator handover and fallback, timer polish.
- **Data sensitivity**: retro content may contain candid feedback about people and processes. Access protection on all routes, including previews, and the anonymity guarantee are the two non-negotiable requirements.
