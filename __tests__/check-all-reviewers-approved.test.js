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

  test("latest CHANGES_REQUESTED followed by APPROVED => true", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "CHANGES_REQUESTED"),
        makeReview("alice", "APPROVED"),
      ],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(true);
  });

  test("latest APPROVED followed by CHANGES_REQUESTED => false", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [
        makeReview("alice", "APPROVED"),
        makeReview("alice", "CHANGES_REQUESTED"),
      ],
      timelineEvents: [makeTimelineReviewRequested("alice")],
    });
    expect(result.allApproved).toBe(false);
  });

  test("approval from a non-requested reviewer does not affect the result", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [makeReview("alice", "APPROVED")],
      timelineEvents: [makeTimelineReviewRequested("bob")],
    });
    expect(result.allApproved).toBe(false);
  });

  test("ignores non-review-requested timeline events", () => {
    const result = computeApprovalStatus({
      pr: makePR([]),
      allReviews: [],
      timelineEvents: [
        { event: "labeled", label: { name: "needs-review" } },
      ],
    });
    expect(result.requestedReviewers).toEqual([]);
    expect(result.allApproved).toBe(false);
  });

  test("deduplicates requested reviewers", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
      allReviews: [makeReview("alice", "APPROVED")],
      timelineEvents: [
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("alice"),
      ],
    });
    expect(result.requestedReviewers).toEqual(["alice"]);
  });

  test("ignores bot reviewers in pending output", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("automation[bot]"), makeUser("alice")]),
      allReviews: [makeReview("alice", "APPROVED")],
      timelineEvents: [
        makeTimelineReviewRequested("automation[bot]"),
        makeTimelineReviewRequested("alice"),
      ],
    });
    expect(result.pendingReviewers).toEqual(["alice"]);
  });

  test("allows omitted reviews and timeline events", () => {
    const result = computeApprovalStatus({
      pr: makePR([makeUser("alice")]),
    });
    expect(result.allApproved).toBe(false);
    expect(result.pendingReviewers).toEqual(["alice"]);
  });
});

describe("checkAllReviewersApproved", () => {
  const { checkAllReviewersApproved } = require("../src/check-all-reviewers-approved");

  function makeClient() {
    return {
      rest: {
        pulls: { get: jest.fn(), listReviews: jest.fn() },
        issues: { listEventsForTimeline: jest.fn() },
      },
      paginate: jest.fn(),
    };
  }

  test("fetches PR, paginated reviews, and paginated timeline with correct parameters", async () => {
    const client = makeClient();
    client.rest.pulls.get.mockResolvedValue({
      data: { requested_reviewers: [] },
    });
    client.paginate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await checkAllReviewersApproved(client, "owner", "repo", 42);

    expect(client.rest.pulls.get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 42,
    });
    expect(client.paginate).toHaveBeenNthCalledWith(
      1,
      client.rest.pulls.listReviews,
      { owner: "owner", repo: "repo", pull_number: 42, per_page: 100 },
    );
    expect(client.paginate).toHaveBeenNthCalledWith(
      2,
      client.rest.issues.listEventsForTimeline,
      { owner: "owner", repo: "repo", issue_number: 42, per_page: 100 },
    );
  });

  test("includes data returned from multiple pagination pages", async () => {
    const client = makeClient();
    client.rest.pulls.get.mockResolvedValue({
      data: { requested_reviewers: [] },
    });
    client.paginate
      .mockResolvedValueOnce([
        makeReview("alice", "APPROVED"),
        makeReview("bob", "APPROVED"),
      ])
      .mockResolvedValueOnce([
        makeTimelineReviewRequested("alice"),
        makeTimelineReviewRequested("bob"),
      ]);

    const result = await checkAllReviewersApproved(client, "owner", "repo", 42);

    expect(result.allApproved).toBe(true);
    expect(result.requestedReviewers).toEqual(["alice", "bob"]);
  });

  test.each([
    ["pull request", "get", new Error("PR API error")],
    ["reviews", "reviews", new Error("reviews API error")],
    ["timeline", "timeline", new Error("timeline API error")],
  ])("%s API errors are propagated", async (_name, source, error) => {
    const client = makeClient();
    if (source === "get") {
      client.rest.pulls.get.mockRejectedValue(error);
    } else {
      client.rest.pulls.get.mockResolvedValue({
        data: { requested_reviewers: [] },
      });
      if (source === "reviews") {
        client.paginate.mockRejectedValueOnce(error);
      } else {
        client.paginate.mockResolvedValueOnce([]);
        client.paginate.mockRejectedValueOnce(error);
      }
    }

    await expect(
      checkAllReviewersApproved(client, "owner", "repo", 42),
    ).rejects.toThrow(error);
  });

  test("rejects PR data without requested_reviewers", async () => {
    const client = makeClient();
    client.rest.pulls.get.mockResolvedValue({ data: {} });

    await expect(
      checkAllReviewersApproved(client, "owner", "repo", 42),
    ).rejects.toThrow("Invalid PR data returned from GitHub API.");
  });
});
