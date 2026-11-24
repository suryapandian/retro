import { describe, expect, it } from "vitest";
import type { RetroView } from "../src/domain/types";
import { advanceTo, api, connect, createRetro, eventually, retroWith } from "./helpers";

const ALICE = "alice@team.test";
const BOB = "bob@team.test";
const CAROL = "carol@team.test";

const allCards = (view: RetroView) => view.topics.flatMap((t) => t.cards);

describe("access", () => {
  it("rejects requests without an identity", async () => {
    const res = await api("", "/api/retros");
    expect(res.status).toBe(401);
  });

  it("lets members set a display name", async () => {
    await api(ALICE, "/api/me", { method: "PUT", body: JSON.stringify({ name: "Alice" }) });
    const me = await (await api(ALICE, "/api/me")).json();
    expect(me).toEqual({ email: ALICE, name: "Alice" });
  });
});

describe("creating retros", () => {
  it("creates a retro from a template and lists it", async () => {
    const { id } = await createRetro(ALICE, { title: "Sprint 42", templateId: "mad-sad-glad" });
    const list = (await (await api(BOB, "/api/retros")).json()) as { id: string; title: string; phase: string }[];
    expect(list).toContainEqual(expect.objectContaining({ id, title: "Sprint 42", phase: "setup", facilitator: ALICE }));

    const view = (await (await api(BOB, `/api/retros/${id}`)).json()) as RetroView;
    expect(view.columns.map((c) => c.title)).toEqual(["Mad", "Sad", "Glad"]);
    expect(view.settings).toEqual({ votesPerMember: 3, allowMultipleVotesPerTopic: true });
  });

  it("creates a retro with custom columns and settings", async () => {
    const { id } = await createRetro(ALICE, {
      templateId: undefined,
      columns: [{ id: "a", title: "Kudos" }, { id: "b", title: "Puzzles", prompt: "What confused you?" }],
      settings: { votesPerMember: 5, allowMultipleVotesPerTopic: false },
    });
    const view = (await (await api(ALICE, `/api/retros/${id}`)).json()) as RetroView;
    expect(view.columns).toEqual([{ id: "a", title: "Kudos" }, { id: "b", title: "Puzzles", prompt: "What confused you?" }]);
    expect(view.settings).toEqual({ votesPerMember: 5, allowMultipleVotesPerTopic: false });
  });

  it("rejects invalid input", async () => {
    const res = await api(ALICE, "/api/retros", { method: "POST", body: JSON.stringify({ title: "", templateId: "4ls" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown retros", async () => {
    expect((await api(ALICE, "/api/retros/nope")).status).toBe(404);
  });

  it("lets the facilitator edit settings during setup only", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    expect(await bob.send({ type: "updateSettings", title: "Hijacked" })).toEqual({ ok: false, reason: expect.any(String) });
    await alice.do({ type: "updateSettings", title: "Renamed", settings: { votesPerMember: 2 } });
    await eventually(() => expect(bob.view.title).toBe("Renamed"));
    expect(bob.view.settings.votesPerMember).toBe(2);
    await alice.do({ type: "advancePhase" });
    expect((await alice.send({ type: "updateSettings", title: "Late" })).ok).toBe(false);
  });

  it("only lets the facilitator delete a retro", async () => {
    const { id } = await createRetro(ALICE);
    expect((await api(BOB, `/api/retros/${id}`, { method: "DELETE" })).status).toBe(403);
    expect((await api(ALICE, `/api/retros/${id}`, { method: "DELETE" })).status).toBe(204);
    expect((await api(ALICE, `/api/retros/${id}`)).status).toBe(404);
    const list = (await (await api(ALICE, "/api/retros")).json()) as { id: string }[];
    expect(list.map((r) => r.id)).not.toContain(id);
  });
});

describe("presence", () => {
  it("shows who is connected and updates when someone leaves", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    expect(alice.view.members.map((m) => [m.email, m.online])).toEqual([[ALICE, true], [BOB, true]]);
    bob.close();
    await eventually(() => expect(alice.view.members.find((m) => m.email === BOB)?.online).toBe(false));
  });

  it("gives a reconnecting client the current view", async () => {
    const { id, clients: [alice, bob] } = await retroWith(ALICE, BOB);
    await alice.do({ type: "advancePhase" });
    await bob.do({ type: "addCard", columnId: "went-well", text: "CI is fast" });
    bob.close();
    const bobAgain = await connect(BOB, id);
    expect(bobAgain.view.phase).toBe("think");
    expect(allCards(bobAgain.view).map((c) => c.text)).toEqual(["CI is fast"]);
  });
});

describe("think phase", () => {
  it("hides other people's cards but shows per-column counts", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "went-well", text: "CI is fast" });
    await bob.do({ type: "addCard", columnId: "to-improve", text: "Flaky tests" });

    await eventually(() => expect(bob.view.cardCounts).toEqual({ "went-well": 1, "to-improve": 1, ideas: 0 }));
    expect(allCards(bob.view)).toEqual([{ id: expect.any(String), text: "Flaky tests", isMine: true }]);
    expect(allCards(alice.view).map((c) => c.text)).toEqual(["CI is fast"]);
  });

  it("lets authors edit and delete only their own cards", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "went-well", text: "Typo" });
    const cardId = allCards(alice.view)[0].id;

    expect((await bob.send({ type: "editCard", cardId, text: "Mine now" })).ok).toBe(false);
    expect((await bob.send({ type: "deleteCard", cardId })).ok).toBe(false);
    await alice.do({ type: "editCard", cardId, text: "Fixed" });
    expect(allCards(alice.view)[0].text).toBe("Fixed");
    await alice.do({ type: "deleteCard", cardId });
    expect(alice.view.cardCounts["went-well"]).toBe(0);
  });

  it("rejects empty cards, unknown columns and cards outside Think", async () => {
    const { clients: [alice] } = await retroWith(ALICE);
    expect((await alice.send({ type: "addCard", columnId: "went-well", text: "early" })).ok).toBe(false);
    await advanceTo(alice, "think");
    expect((await alice.send({ type: "addCard", columnId: "went-well", text: "   " })).ok).toBe(false);
    expect((await alice.send({ type: "addCard", columnId: "nope", text: "x" })).ok).toBe(false);
    await advanceTo(alice, "group");
    expect((await alice.send({ type: "addCard", columnId: "went-well", text: "late" })).ok).toBe(false);
  });

  it("tracks who is done, resetting on phase change", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    await advanceTo(alice, "think");
    await bob.do({ type: "setDone", done: true });
    await eventually(() => expect(alice.view.members.find((m) => m.email === BOB)?.done).toBe(true));
    await alice.do({ type: "advancePhase" });
    expect(alice.view.members.every((m) => !m.done)).toBe(true);
  });
});

describe("group phase", () => {
  async function groupWithCards() {
    const ctx = await retroWith(ALICE, BOB);
    const [alice, bob] = ctx.clients;
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "to-improve", text: "Flaky tests" });
    await bob.do({ type: "addCard", columnId: "to-improve", text: "Tests fail randomly" });
    await bob.do({ type: "addCard", columnId: "went-well", text: "Good pairing" });
    await advanceTo(alice, "group");
    await eventually(() => expect(bob.view.phase).toBe("group"));
    return ctx;
  }

  it("reveals all cards to everyone, flagging only the viewer's own", async () => {
    const { clients: [alice, bob] } = await groupWithCards();
    expect(allCards(bob.view).map((c) => [c.text, c.isMine])).toEqual([
      ["Flaky tests", false],
      ["Tests fail randomly", true],
      ["Good pairing", true],
    ]);
    expect(allCards(alice.view).filter((c) => c.isMine).map((c) => c.text)).toEqual(["Flaky tests"]);
  });

  it("groups cards into topics, renames them, and detaches cards", async () => {
    const { clients: [alice, bob] } = await groupWithCards();
    const [flaky, random] = bob.view.topics;
    await bob.do({ type: "moveCard", cardId: random.cards[0].id, targetTopicId: flaky.id });
    await bob.do({ type: "renameTopic", topicId: flaky.id, title: "Test reliability" });

    await eventually(() => expect(alice.view.topics).toHaveLength(2));
    const merged = alice.view.topics.find((t) => t.id === flaky.id)!;
    expect(merged.title).toBe("Test reliability");
    expect(merged.columnId).toBe("to-improve");
    expect(merged.cards.map((c) => c.text)).toEqual(["Flaky tests", "Tests fail randomly"]);

    await alice.do({ type: "detachCard", cardId: random.cards[0].id });
    expect(alice.view.topics).toHaveLength(3);
  });

  it("still lets authors fix typos, but not delete", async () => {
    const { clients: [alice] } = await groupWithCards();
    const mine = allCards(alice.view).find((c) => c.isMine)!;
    await alice.do({ type: "editCard", cardId: mine.id, text: "Flaky e2e tests" });
    expect(allCards(alice.view).find((c) => c.id === mine.id)?.text).toBe("Flaky e2e tests");
    expect((await alice.send({ type: "deleteCard", cardId: mine.id })).ok).toBe(false);
  });
});

describe("vote phase", () => {
  async function voting(settings?: Record<string, unknown>) {
    const { id } = await createRetro(ALICE, settings ? { settings } : {});
    const alice = await connect(ALICE, id);
    const bob = await connect(BOB, id);
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "went-well", text: "One" });
    await alice.do({ type: "addCard", columnId: "went-well", text: "Two" });
    await advanceTo(alice, "vote");
    await eventually(() => expect(bob.view.phase).toBe("vote"));
    return { alice, bob, topics: alice.view.topics.map((t) => t.id) };
  }

  it("enforces the vote limit and reports remaining votes", async () => {
    const { bob, topics } = await voting();
    expect(bob.view.votesRemaining).toBe(3);
    await bob.do({ type: "vote", topicId: topics[0] });
    await bob.do({ type: "vote", topicId: topics[0] });
    await bob.do({ type: "vote", topicId: topics[1] });
    expect(bob.view.votesRemaining).toBe(0);
    expect(await bob.send({ type: "vote", topicId: topics[1] })).toEqual({ ok: false, reason: "no votes left" });
    await bob.do({ type: "unvote", topicId: topics[0] });
    expect(bob.view.votesRemaining).toBe(1);
    expect(bob.view.topics.find((t) => t.id === topics[0])?.myVotes).toBe(1);
  });

  it("can forbid stacking votes on one topic", async () => {
    const { bob, topics } = await voting({ allowMultipleVotesPerTopic: false });
    await bob.do({ type: "vote", topicId: topics[0] });
    expect((await bob.send({ type: "vote", topicId: topics[0] })).ok).toBe(false);
  });

  it("hides totals until Discuss, then orders topics by votes", async () => {
    const { alice, bob, topics } = await voting();
    await bob.do({ type: "vote", topicId: topics[1] });
    await bob.do({ type: "vote", topicId: topics[1] });
    await eventually(() => expect(alice.view.membersOutOfVotes).toBe(0));
    expect(alice.view.topics.every((t) => t.totalVotes === undefined && t.myVotes === 0)).toBe(true);

    await alice.do({ type: "advancePhase" });
    expect(alice.view.phase).toBe("discuss");
    expect(alice.view.topics.map((t) => [t.id, t.totalVotes])).toEqual([[topics[1], 2], [topics[0], 0]]);
    expect(alice.view.currentTopicId).toBe(topics[1]);
  });

  it("counts members who have used all their votes", async () => {
    const { alice, bob, topics } = await voting({ votesPerMember: 1 });
    await bob.do({ type: "vote", topicId: topics[0] });
    await eventually(() => expect(alice.view.membersOutOfVotes).toBe(1));
  });
});

describe("discuss phase and action items", () => {
  async function discussing() {
    const ctx = await retroWith(ALICE, BOB);
    const [alice, bob] = ctx.clients;
    await advanceTo(alice, "think");
    await bob.do({ type: "addCard", columnId: "to-improve", text: "Flaky tests" });
    await bob.do({ type: "addCard", columnId: "ideas", text: "Mob on Fridays" });
    await advanceTo(alice, "vote");
    await eventually(() => expect(bob.view.phase).toBe("vote"));
    await bob.do({ type: "vote", topicId: bob.view.topics[0].id });
    await advanceTo(alice, "discuss");
    await eventually(() => expect(bob.view.phase).toBe("discuss"));
    return ctx;
  }

  it("lets the facilitator move through topics in vote order", async () => {
    const { clients: [alice, bob] } = await discussing();
    const [first, second] = alice.view.topics;
    expect(alice.view.currentTopicId).toBe(first.id);
    expect((await bob.send({ type: "nextTopic" })).ok).toBe(false);
    await alice.do({ type: "nextTopic" });
    expect(alice.view.currentTopicId).toBe(second.id);
    expect(alice.view.topics.find((t) => t.id === first.id)?.discussed).toBe(true);
    await alice.do({ type: "setCurrentTopic", topicId: first.id });
    await eventually(() => expect(bob.view.currentTopicId).toBe(first.id));
  });

  it("records notes and action items, which appear on the team list", async () => {
    const { id, clients: [alice, bob] } = await discussing();
    const topicId = alice.view.currentTopicId!;
    await bob.do({ type: "setTopicNote", topicId, note: "Quarantine flaky specs" });
    await bob.do({ type: "addActionItem", topicId, description: "Set up test quarantine", owner: BOB, dueDate: "2026-12-01" });

    await eventually(() => expect(alice.view.actionItems).toHaveLength(1));
    expect(alice.view.topics.find((t) => t.id === topicId)?.note).toBe("Quarantine flaky specs");
    expect(alice.view.actionItems[0]).toMatchObject({ description: "Set up test quarantine", owner: BOB, dueDate: "2026-12-01", done: false });

    const open = (await (await api(CAROL, "/api/action-items")).json()) as { retroId: string; retroTitle: string }[];
    expect(open).toContainEqual(expect.objectContaining({ retroId: id, retroTitle: "Sprint 1", description: "Set up test quarantine" }));
    const mine = (await (await api(BOB, "/api/action-items?owner=me")).json()) as { description: string }[];
    expect(mine.map((a) => a.description)).toContain("Set up test quarantine");
  });

  it("pushes dashboard edits of action items to the live retro", async () => {
    const { clients: [alice, bob] } = await discussing();
    await bob.do({ type: "addActionItem", description: "Write ADR" });
    const item = bob.view.actionItems[0];
    const res = await api(CAROL, `/api/action-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ done: true }) });
    expect(res.status).toBe(200);
    await eventually(() => expect(bob.view.actionItems[0].done).toBe(true));
  });

  it("rejects invalid action items", async () => {
    const { clients: [alice] } = await discussing();
    expect((await alice.send({ type: "addActionItem", description: "" })).ok).toBe(false);
    expect((await alice.send({ type: "addActionItem", description: "x", dueDate: "next week" })).ok).toBe(false);
  });
});

describe("previous action items", () => {
  it("shows open items from earlier retros at the start of the next retro and lets them be closed", async () => {
    const earlier = await retroWith(ALICE);
    const [alice] = earlier.clients;
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "ideas", text: "Idea" });
    await advanceTo(alice, "discuss");
    await alice.do({ type: "addActionItem", description: "Carry me over" });

    const next = await retroWith(BOB);
    const [bob] = next.clients;
    const carried = bob.view.previousActionItems.find((a) => a.description === "Carry me over");
    expect(carried).toMatchObject({ retroId: earlier.id, done: false });

    await bob.do({ type: "updateActionItem", id: carried!.id, patch: { done: true } });
    expect(bob.view.previousActionItems.find((a) => a.id === carried!.id)).toBeUndefined();
    await eventually(() => expect(alice.view.actionItems[0].done).toBe(true));

    await advanceTo(bob, "group");
    expect(bob.view.previousActionItems).toEqual([]);
  });
});

describe("facilitation", () => {
  it("only lets the facilitator change phase, and allows going back", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    expect((await bob.send({ type: "advancePhase" })).ok).toBe(false);
    await advanceTo(alice, "vote");
    await alice.do({ type: "revertPhase" });
    expect(alice.view.phase).toBe("group");
  });

  it("returns votes when a voted topic disappears after going back to Group", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    await advanceTo(alice, "think");
    await bob.do({ type: "addCard", columnId: "ideas", text: "A" });
    await bob.do({ type: "addCard", columnId: "ideas", text: "B" });
    await advanceTo(alice, "vote");
    await eventually(() => expect(bob.view.phase).toBe("vote"));
    const [a, b] = bob.view.topics;
    await bob.do({ type: "vote", topicId: b.id });
    await alice.do({ type: "revertPhase" });
    await eventually(() => expect(bob.view.phase).toBe("group"));
    await bob.do({ type: "moveCard", cardId: b.cards[0].id, targetTopicId: a.id });
    await alice.do({ type: "advancePhase" });
    await eventually(() => expect(bob.view.phase).toBe("vote"));
    expect(bob.view.votesRemaining).toBe(3);
  });

  it("shares a server-side timer", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    expect((await bob.send({ type: "startTimer", seconds: 60 })).ok).toBe(false);
    const before = Date.now();
    await alice.do({ type: "startTimer", seconds: 300 });
    await eventually(() => expect(bob.view.timer).not.toBeNull());
    expect(bob.view.timer!.endsAt).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    await alice.do({ type: "stopTimer" });
    await eventually(() => expect(bob.view.timer).toBeNull());
  });

  it("hands the facilitator role to another participant", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    expect((await alice.send({ type: "transferFacilitator", to: CAROL })).ok).toBe(false);
    await alice.do({ type: "transferFacilitator", to: BOB });
    await eventually(() => expect(bob.view.me.isFacilitator).toBe(true));
    await bob.do({ type: "advancePhase" });
    expect((await alice.send({ type: "advancePhase" })).ok).toBe(false);
  });

  it("doesn't let others claim the role while the facilitator is connected", async () => {
    const { clients: [, bob] } = await retroWith(ALICE, BOB);
    expect(await bob.send({ type: "claimFacilitator" })).toEqual({ ok: false, reason: "the facilitator is still connected" });
  });

  it("doesn't let others claim the role right after the facilitator disconnects", async () => {
    const { clients: [alice, bob] } = await retroWith(ALICE, BOB);
    alice.close();
    await eventually(() => expect(bob.view.members.find((m) => m.email === ALICE)?.online).toBe(false));
    expect(await bob.send({ type: "claimFacilitator" })).toEqual({ ok: false, reason: "the facilitator has only just disconnected" });
  });
});

describe("close", () => {
  it("makes the retro read-only but keeps action items editable", async () => {
    const { clients: [alice] } = await retroWith(ALICE);
    await advanceTo(alice, "think");
    await alice.do({ type: "addCard", columnId: "ideas", text: "Idea" });
    await advanceTo(alice, "discuss");
    await alice.do({ type: "addActionItem", description: "Follow up" });
    await alice.do({ type: "advancePhase" });
    expect(alice.view.phase).toBe("close");

    expect(await alice.send({ type: "revertPhase" })).toEqual({ ok: false, reason: "retro is closed" });
    expect((await alice.send({ type: "advancePhase" })).ok).toBe(false);
    await alice.do({ type: "updateActionItem", id: alice.view.actionItems[0].id, patch: { done: true } });
    expect(alice.view.actionItems[0].done).toBe(true);
    expect(alice.view.topics[0].totalVotes).toBe(0);
  });
});

describe("anonymity", () => {
  it("never exposes card authors to anyone, in any phase", async () => {
    await api(BOB, "/api/me", { method: "PUT", body: JSON.stringify({ name: "Bobby Tables" }) });
    const { id, clients: [alice, bob, carol] } = await retroWith(ALICE, BOB, CAROL);
    await advanceTo(alice, "think");
    await bob.do({ type: "addCard", columnId: "to-improve", text: "Secret opinion" });
    await carol.do({ type: "addCard", columnId: "ideas", text: "Another idea" });

    const leaksAuthor = (view: RetroView, viewer: string) => {
      const others = view.members.filter((m) => m.email !== viewer);
      const topicsJson = JSON.stringify({ topics: view.topics, cardCounts: view.cardCounts });
      return others.some((m) => topicsJson.includes(m.email) || topicsJson.includes(m.name));
    };

    for (const phase of ["think", "group", "vote", "discuss", "close"] as const) {
      await advanceTo(alice, phase);
      for (const client of [alice, bob, carol]) {
        await eventually(() => expect(client.view.phase).toBe(phase));
        expect(leaksAuthor(client.view, client.email)).toBe(false);
        expect(JSON.stringify(client.view)).not.toMatch(/"author"/);
      }
      const snapshot = await (await api(ALICE, `/api/retros/${id}`)).text();
      expect(snapshot).not.toMatch(/"author"/);
    }
    expect(alice.view.members.find((m) => m.email === BOB)?.name).toBe("Bobby Tables");
  });
});
