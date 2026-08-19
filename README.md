# check-all-reviewers-approved-action

A Node.js GitHub Action that checks whether all requested human reviewers have approved a pull request.

## Usage

```yaml
- name: Check all reviewers approved
  id: approvals
  uses: kreuz123/check-all-reviewers-approved-action@v1
  with:
    token: ${{ github.token }}
    pr-number: ${{ github.event.pull_request.number }}

- name: Proceed only when approved
  if: steps.approvals.outputs.all-approved == 'true'
  run: echo "All reviewers approved!"
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | No | `${{ github.token }}` | GitHub token for API access |
| `pr-number` | Yes | — | Pull request number to check |

## Outputs

| Output | Description |
|--------|-------------|
| `all-approved` | `"true"` or `"false"` — whether all requested human reviewers approved |
| `requested-reviewers` | JSON array of all human reviewers ever requested on the PR |
| `pending-reviewers` | JSON array of current pending human reviewers (awaiting review) |

## Behavior

1. Fetches the PR and all reviews (with pagination).
2. Collapses reviews to the latest per user.
3. Excludes bot reviewers (by `user.type === 'Bot'` or login ending with `[bot]`).
4. If any human reviewer's latest review is `CHANGES_REQUESTED`, outputs `false`.
5. Fetches all issue timeline events (with pagination) to discover all reviewers ever requested.
6. If no human reviewers were ever requested, outputs `false`.
7. If any currently requested human reviewer has not yet reviewed (pending), outputs `false`.
8. Outputs `true` only when at least one reviewer approved and every reviewer-only latest review is `APPROVED`.

## Development

```bash
npm install
npm test
npm run build
```

## License

MIT
