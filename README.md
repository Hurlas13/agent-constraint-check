# Agent Constraint Check

Apex Nexus Australis Pty Ltd

GitHub App that fails a pull request when an agent weakens the quality bar.

One installation covers one repository. The check looks for skipped tests, stripped assertions, silenced lints, and unimplemented stubs.

## Status

The app is installed on this repository. A pull request gets a check named Agent Constraint Check. The check fails when the diff skips a test, strips an assertion, silences a lint, or leaves a stub.

The webhook runs at https://agent-constraint-check.fly.dev. It stays up when this computer sleeps.

Stripe test checkout is the page GitHub opens after install. Live charges follow Stripe's review of the Apex Nexus Australis Pty Ltd account.

## Permissions

- Checks: read and write
- Contents: read-only
- Pull requests: read-only
- Metadata: read-only

Install: https://github.com/apps/agent-constraint-check
