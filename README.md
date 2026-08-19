# Check All Reviewers Approved

A GitHub Action that checks whether all requested human reviewers have approved a pull request, making it easy to gate workflows on full reviewer consensus.

## Features

- ✅ Tracks all human reviewers and evaluates their latest review
- ✅ Excludes bot reviewers from all approval decisions
- ✅ Treats pending reviewers (awaiting review) as blocking
- ✅ Handles pagination for reviews and timeline events

## How it works

1. Fetches the pull request and all its reviews (with pagination).
2. Collapses reviews to the **latest per user** — earlier reviews from the same person are ignored.
3. Excludes bot reviewers (by `user.type === 'Bot'` or login ending with `[bot]`).
4. If any human reviewer's latest review is `CHANGES_REQUESTED`, outputs `false` immediately.
5. Fetches all timeline events (with pagination) to build the complete set of human reviewers ever requested, including those no longer in the current request list.
6. If no human reviewers were ever requested, outputs `false`.
7. If any currently requested human reviewer has not yet reviewed (pending), outputs `false`.
8. Outputs `true` only when at least one reviewer has approved and every reviewer's latest review is `APPROVED`.

## Usage

### Basic usage

```yaml
name: Check Approvals

on:
  pull_request_review:
    types: [submitted]

permissions:
  contents: read
  pull-requests: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check all reviewers approved
        id: approvals
        uses: kreuz123/check-all-reviewers-approved-action@main
        with:
          pr-number: ${{ github.event.pull_request.number }}

      - name: Proceed only when all approved
        if: steps.approvals.outputs.all-approved == 'true'
        run: echo "All reviewers have approved!"
```

### Using the output in a dependent job

```yaml
jobs:
  check-approvals:
    runs-on: ubuntu-latest
    outputs:
      all-approved: ${{ steps.approvals.outputs.all-approved }}
    steps:
      - id: approvals
        uses: kreuz123/check-all-reviewers-approved-action@main
        with:
          pr-number: ${{ github.event.pull_request.number }}

  next-job:
    needs: check-approvals
    if: needs.check-approvals.outputs.all-approved == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "All reviewers approved, continuing..."
```

## Inputs

| Name         | Required | Default               | Description                                                                         |
| ------------ | -------- | --------------------- | ----------------------------------------------------------------------------------- |
| `token`      | No       | `${{ github.token }}` | Token used to read the PR and reviews. Override only for a PAT or GitHub App token. |
| `pr-number`  | Yes      | —                     | Pull request number to check.                                                       |

## Outputs

| Name                   | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `all-approved`         | `"true"` or `"false"` — whether all requested human reviewers have approved. Use `== 'true'` in `if:` conditions. |
| `requested-reviewers`  | JSON array of all human reviewers ever requested on the PR.                 |
| `pending-reviewers`    | JSON array of current pending human reviewers (awaiting review).            |

## Required permissions

The workflow's `GITHUB_TOKEN` needs:

- `pull-requests: read` — to read the PR, its reviews, and timeline events.

## License

This project is licensed under the [MIT License](LICENSE).
