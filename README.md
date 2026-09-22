# Agent Constraint Check

Apex Nexus Australis Pty Ltd

GitHub App that fails a pull request when an agent weakens the quality bar.

One installation covers one repository. The check looks for skipped tests, stripped assertions, silenced lints, and unimplemented stubs.

## Status

The app is installed on this repository. A pull request gets a check named Agent Constraint Check. The check fails when the diff skips a test, strips an assertion, silences a lint, or leaves a stub.

The webhook is running on this computer through a temporary public address. It stops when the computer sleeps. A permanent host has to replace that address before anyone else installs the app.

Stripe test checkout is the page GitHub opens after install. Live charges follow Stripe's review of the Apex Nexus Australis Pty Ltd account.

## Permissions

- Checks: read and write
- Contents: read-only
- Pull requests: read-only
- Metadata: read-only

Install: https://github.com/apps/agent-constraint-check
