const core = require("@actions/core");
const github = require("@actions/github");
const {
  checkAllReviewersApproved,
} = require("./src/check-all-reviewers-approved");

async function run() {
  try {
    const token = core.getInput("token");
    const prNumberInput = core.getInput("pr-number").trim();
    const prNumber = Number(prNumberInput);

    if (
      !/^\d+$/.test(prNumberInput) ||
      !Number.isSafeInteger(prNumber) ||
      prNumber <= 0
    ) {
      core.setFailed(
        `Input "pr-number" must be a positive integer. Received: "${prNumberInput}"`,
      );
      return;
    }

    const client = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    core.info(`Checking approval status for PR #${prNumber} in ${owner}/${repo}`);

    const { allApproved, requestedReviewers, pendingReviewers } =
      await checkAllReviewersApproved(client, owner, repo, prNumber);

    core.info(`All-ever-requested reviewers: ${requestedReviewers.join(", ") || "(none)"}`);
    core.info(`Pending reviewers: ${pendingReviewers.join(", ") || "(none)"}`);
    core.info(`All approved: ${allApproved}`);

    core.setOutput("all-approved", allApproved.toString());
    core.setOutput("requested-reviewers", JSON.stringify(requestedReviewers));
    core.setOutput("pending-reviewers", JSON.stringify(pendingReviewers));
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

module.exports = { run };

if (require.main === module) {
  run();
}
