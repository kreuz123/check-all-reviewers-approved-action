/**
 * Returns true if a user object represents a bot (by type or login suffix).
 * @param {{ login: string, type?: string }} user
 * @returns {boolean}
 */
function isBot(user) {
  if (!user || !user.login) return false;
  return user.type === "Bot" || user.login.endsWith("[bot]");
}

/**
 * Collapses an array of reviews to the latest review per user (last write wins),
 * matching the YAML's `{ [r.user.login]: r }` reduce semantics.
 *
 * @param {Array} reviews
 * @returns {Object} map of login -> latest review
 */
function collapseToLatestReviewByUser(reviews) {
  return reviews.reduce((acc, r) => {
    acc[r.user.login] = r;
    return acc;
  }, {});
}

/**
 * Core approval-check logic extracted for testability.
 *
 * @param {object} params
 * @param {object} params.pr          - PR object from pulls.get
 * @param {Array}  params.allReviews  - all reviews from pulls.listReviews (paginated)
 * @param {Array}  params.timelineEvents - all timeline events from issues.listEventsForTimeline
 * @returns {{ allApproved: boolean, requestedReviewers: string[], pendingReviewers: string[] }}
 */
function computeApprovalStatus({ pr, allReviews, timelineEvents }) {
  const latestReviewsByUser = collapseToLatestReviewByUser(allReviews);

  // All human reviewers' latest reviews
  const humanReviews = Object.values(latestReviewsByUser).filter(
    (r) => !isBot(r.user),
  );

  // Step 1: Build set of all human reviewers ever requested
  const allEverRequestedReviewers = new Set(
    (pr.requested_reviewers || [])
      .filter((r) => !isBot(r))
      .map((r) => r.login),
  );

  (timelineEvents || []).forEach((e) => {
    if (e.event === "review_requested" && e.requested_reviewer) {
      if (!isBot(e.requested_reviewer)) {
        allEverRequestedReviewers.add(e.requested_reviewer.login);
      }
    }
  });

  // Step 2: If any human reviewer has CHANGES_REQUESTED, not approved
  const hasChangesRequested = humanReviews.some(
    (r) => r.state === "CHANGES_REQUESTED",
  );
  if (hasChangesRequested) {
    const pendingReviewers = (pr.requested_reviewers || [])
      .filter((r) => !isBot(r))
      .map((r) => r.login);
    return {
      allApproved: false,
      requestedReviewers: [...allEverRequestedReviewers],
      pendingReviewers,
    };
  }

  // Step 3: If no human reviewers were ever requested, not approved
  if (allEverRequestedReviewers.size === 0) {
    return {
      allApproved: false,
      requestedReviewers: [],
      pendingReviewers: [],
    };
  }

  // Step 4: Pending human reviewers (still awaiting review)
  const pendingHumanReviewers = (pr.requested_reviewers || []).filter(
    (r) => !isBot(r),
  );

  // Step 5: Restrict reviews to those in the ever-requested set
  const reviewerOnlyReviews = humanReviews.filter((r) =>
    allEverRequestedReviewers.has(r.user.login),
  );

  // Step 6: all-approved = at least one APPROVED review, no pending, all APPROVED
  const allApproved =
    reviewerOnlyReviews.filter((r) => r.state === "APPROVED").length > 0 &&
    pendingHumanReviewers.length === 0 &&
    reviewerOnlyReviews.every((r) => r.state === "APPROVED");

  return {
    allApproved,
    requestedReviewers: [...allEverRequestedReviewers],
    pendingReviewers: pendingHumanReviewers.map((r) => r.login),
  };
}

/**
 * Fetches all required data and returns approval status.
 *
 * @param {object} client   - Octokit client
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<{ allApproved: boolean, requestedReviewers: string[], pendingReviewers: string[] }>}
 */
async function checkAllReviewersApproved(client, owner, repo, prNumber) {
  const { data: pr } = await client.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (!pr || !Array.isArray(pr.requested_reviewers)) {
    throw new Error("Invalid PR data returned from GitHub API.");
  }

  const allReviews = await client.paginate(client.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const timelineEvents = await client.paginate(
    client.rest.issues.listEventsForTimeline,
    {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    },
  );

  return computeApprovalStatus({ pr, allReviews, timelineEvents });
}

module.exports = {
  checkAllReviewersApproved,
  computeApprovalStatus,
  isBot,
  collapseToLatestReviewByUser,
};
