jest.mock("@actions/core", () => ({
  getInput: jest.fn(),
  info: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
}));

jest.mock("@actions/github", () => ({
  context: {},
  getOctokit: jest.fn(),
}));

jest.mock("../src/check-all-reviewers-approved", () => ({
  checkAllReviewersApproved: jest.fn(),
}));

const core = require("@actions/core");
const github = require("@actions/github");
const {
  checkAllReviewersApproved,
} = require("../src/check-all-reviewers-approved");
const { run } = require("../index");

describe("run", () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();

    client = {
      paginate: jest.fn(),
      rest: {
        pulls: { get: jest.fn(), listReviews: jest.fn() },
        issues: { listEventsForTimeline: jest.fn() },
      },
    };

    github.context = {
      repo: { owner: "owner", repo: "repo" },
    };

    core.getInput.mockImplementation((name) => {
      if (name === "token") return "test-token";
      if (name === "pr-number") return "42";
      return "";
    });

    github.getOctokit.mockReturnValue(client);

    checkAllReviewersApproved.mockResolvedValue({
      allApproved: true,
      requestedReviewers: ["alice"],
      pendingReviewers: [],
    });
  });

  test("outputs all-approved=true when checkAllReviewersApproved returns true", async () => {
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("all-approved", "true");
    expect(core.setOutput).toHaveBeenCalledWith(
      "requested-reviewers",
      JSON.stringify(["alice"]),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "pending-reviewers",
      JSON.stringify([]),
    );
  });

  test("outputs all-approved=false when checkAllReviewersApproved returns false", async () => {
    checkAllReviewersApproved.mockResolvedValue({
      allApproved: false,
      requestedReviewers: ["alice"],
      pendingReviewers: ["alice"],
    });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith("all-approved", "false");
  });

  test("calls checkAllReviewersApproved with correct args", async () => {
    await run();

    expect(checkAllReviewersApproved).toHaveBeenCalledWith(
      client,
      "owner",
      "repo",
      42,
    );
  });

  test("fails for non-numeric pr-number", async () => {
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "test-token";
      if (name === "pr-number") return "abc";
      return "";
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("pr-number"),
    );
    expect(checkAllReviewersApproved).not.toHaveBeenCalled();
  });

  test("fails for zero pr-number", async () => {
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "test-token";
      if (name === "pr-number") return "0";
      return "";
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("pr-number"),
    );
  });

  test("fails for negative pr-number", async () => {
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "test-token";
      if (name === "pr-number") return "-1";
      return "";
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("pr-number"),
    );
  });

  test("accepts whitespace around a valid pr-number", async () => {
    core.getInput.mockImplementation((name) => {
      if (name === "token") return "test-token";
      if (name === "pr-number") return " 42 ";
      return "";
    });

    await run();

    expect(checkAllReviewersApproved).toHaveBeenCalledWith(
      client,
      "owner",
      "repo",
      42,
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test.each(["", "1.5", "9007199254740992"])(
    "fails for invalid pr-number %j",
    async (prNumber) => {
      core.getInput.mockImplementation((name) => {
        if (name === "token") return "test-token";
        if (name === "pr-number") return prNumber;
        return "";
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("pr-number"),
      );
      expect(checkAllReviewersApproved).not.toHaveBeenCalled();
    },
  );

  test("passes token to getOctokit", async () => {
    await run();

    expect(github.getOctokit).toHaveBeenCalledWith("test-token");
  });

  test("does not fail on successful execution", async () => {
    await run();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("calls setFailed on API error", async () => {
    checkAllReviewersApproved.mockRejectedValue(new Error("API error"));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith("Action failed: API error");
  });
});
