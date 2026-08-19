const {
  computeApprovalStatus,
  isBot,
  collapseToLatestReviewByUser,
} = require("../src/check-all-reviewers-approved");

// Helpers
function makeUser(login, type = "User") {
  return { login, type };
}
function makeReview(login, state, type = "User") {
  return { user: makeUser(login, type), state };
}
function makeTimelineReviewRequested(login, type = "User") {
  return { event: "review_requested", requested_reviewer: makeUser(login, type) };
}
function makePR(requestedReviewers = []) {
  return { requested_reviewers: requestedReviewers };
}

describe("isBot", () => {
  test("returns true for Bot type", () => {
    expect(isBot({ login: "mybot", type: "Bot" })).toBe(true);
  });
  test("returns true for [bot] suffix", () => {
    expect(isBot({ login: "github-actions[bot]", type: "User" })).toBe(true);
  });
  test("returns false for normal user", () => {
    expect(isBot({ login: "alice", type: "User" })).toBe(false);
  });
  test("returns false for null", () => {
    expect(isBot(null)).toBe(false);
  });
});

describe("collapseToLatestReviewByUser", () => {
  test("returns last review per user (pagination order)", () => {
    const reviews = [
      makeReview("alice", "APPROVED"),
      makeReview("alice", "CHANGES_REQUESTED"),
    ];
    const result = collapseToLatestReviewByUser(reviews);
    expect(result["alice"].state).toBe("CHANGES_REQUESTED");
  });

  test("handles multiple users", () => {
    const reviews = [makeReview("alice", "APPROVED"), makeReview("bob", "APPROVED")];
    const result = collapseToLatestReviewByUser(reviews);
    expect(Object.keys(result)).toHaveLength(2);
  });
});

describe("computeApprovalStatus", () => {
  test("no human reviewers ever requested => false", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [],
      timelineEvents: [],
    });
    expect(result.allApproved).toBe(false);
    expect(result.requestedReviewers).toHaveLength(0);
  });

  test("latest human review is CHANGES_REQUESTED => false", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
      allReviews: [makeReview("alice", "CHANGES_REQUESTED")],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(false);
  });

  test("latest human review is DISMISSED => false", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "APPROVED"),
        makeReview("alice", "DISMISSED"),
      ],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(false);
  });

  test("latest human review is COMMENTED => false", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "APPROVED"),
        makeReview("alice", "COMMENTED"),
      ],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(false);
  });

  test("CHANGES_REQUESTED takes priority even if another reviewer approved", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "APPROVED"),
        makeReview("bob", "CHANGES_REQUESTED"),
      ],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("bob"),
      ],
    });
    expect(result.allApproved).toBe(false);
  });

  test("pending human reviewer => false", () => {
    // alice is in requested_reviewers (pending), bob approved
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
      allReviews: [makeReview("bob", "APPROVED")],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("bob"),
      ],
    });
    expect(result.allApproved).toBe(false);
    expect(result.pendingReviewers).toContain("alice");
  });

  test("all requested human reviewers approved => true", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [makeReview("alice", "APPROVED"), makeReview("bob", "APPROVED")],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("bob"),
      ],
    });
    expect(result.allApproved).toBe(true);
    expect(result.requestedReviewers).toContain("alice");
    expect(result.requestedReviewers).toContain("bob");
  });

  test("requested human reviewer with no review => false", () => {
    // alice was requested (timeline) but has no review entry
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
      allReviews: [],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    // alice is pending (still in requested_reviewers) and has no review => not approved
    expect(result.allApproved).toBe(false);
  });

  test("previously requested reviewer included from timeline and approved => true when no pending", () => {
    // alice was requested via timeline, approved, and is no longer in requested_reviewers (not pending)
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [makeReview("alice", "APPROVED")],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(true);
  });

  test("bot reviewers excluded from approval decisions", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("bot-reviewer[bot]")]),
      allReviews: [makeReview("bot-reviewer[bot]", "CHANGES_REQUESTED")],
      timelineEvents: [makeTimelineReviewRequested("bot-reviewer[bot]")],
    });
    // bots are excluded, so effectively no human reviewers ever requested => false
    expect(result.allApproved).toBe(false);
    expect(result.requestedReviewers).toHaveLength(0);
  });

  test("bot reviewer with Bot type excluded", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("mybot", "Bot")]),
      allReviews: [makeReview("mybot", "CHANGES_REQUESTED", "Bot")],
      timelineEvents: [makeTimelineReviewRequested("mybot", "Bot")],
    });
    expect(result.allApproved).toBe(false);
    expect(result.requestedReviewers).toHaveLength(0);
  });

  test("bot in reviews does not affect human approval outcome", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "APPROVED"),
        makeReview("mybot[bot]", "CHANGES_REQUESTED"),
      ],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("mybot[bot]"),
      ],
    });
    // mybot[bot] is excluded; alice approved and no pending => true
    expect(result.allApproved).toBe(true);
  });

  test("returns correct requestedReviewers and pendingReviewers", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
      allReviews: [makeReview("bob", "APPROVED")],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("bob"),
      ],
    });
    expect(result.requestedReviewers).toContain("alice");
    expect(result.requestedReviewers).toContain("bob");
    expect(result.pendingReviewers).toContain("alice");
    expect(result.pendingReviewers).not.toContain("bob");
  });
});
