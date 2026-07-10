# Agent instructions

## Keep consumer and builder audiences separate

The product UI serves the person connecting their data. API responses, server logs, tests, and operator documentation serve the builder running the app. Do not move copy across that boundary.

- Never render raw `Error.message`, SDK errors, `ClientError.error`, or API error strings in product UI.
- Never show escrow balances, fee assets, funding instructions, private-key setup, gateway failures, or app-identity configuration to the consumer.
- Consumer copy must describe what the person can do: wait, retry, or return later.
- Builder surfaces may preserve structured diagnostics such as `payment_required`, HTTP status, request ID, and the server-side cause.
- Derive consumer copy from an explicit UI state or safe app-owned error kind. Do not pass an arbitrary error object or message into the view-copy function.
- Apply the same boundary to the main app tab and `/connect/return`.

The nearest regression oracle is `keeps builder diagnostics out of consumer error copy` in `test/contract.test.ts`.

```bash
mise exec node@24.14.1 -- pnpm test
mise exec node@24.14.1 -- pnpm typecheck
```

This rule does not prevent detailed diagnostics in server logs, `/api/vana/*` responses, contract tests, or builder-facing README troubleshooting.
