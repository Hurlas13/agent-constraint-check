# Agent Constraint Check

GitHub App that fails a pull request when an agent weakens the quality bar.

One installation covers one repository. The check looks for skipped tests, stripped assertions, silenced lints, and unimplemented stubs.

## Status

The app is registered. It does not post checks yet. That starts when the service and webhook are connected.

Stripe test billing exists. Live charges wait on an Australian Business Number.

## Permissions

- Checks: read and write
- Contents: read-only
- Pull requests: read-only
- Metadata: read-only

Install: https://github.com/apps/agent-constraint-check
