# Vana Data App Starter

A small Next.js reference app that turns approved `linkedin.profile` data into a LinkedIn profile snapshot. The transport is reusable; the LinkedIn source, sample fixture, mapper, and rendered snapshot are app-local examples.

## Requirements

- Node.js 22 or newer
- pnpm
- A Vana app private key for live requests
- A browser-accessible app URL for live return redirects

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Set both values in `.env.local`:

```dotenv
VANA_APP_PRIVATE_KEY=0x...
VANA_APP_URL=http://localhost:3000
```

`VANA_APP_PRIVATE_KEY` is read only by server modules. `VANA_APP_URL` is the sole source of the app homepage and fixed `/connect/return` origin. The app does not accept a caller-provided return URL.

Run the app:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local Proof Without Credentials

The first screen always renders the fictional fixture from `src/data/linkedin-profile.fixture.ts`. This proves the app-local mapper and snapshot without a Vana request, private key, or Personal Server.

Run the local contract checks:

```bash
pnpm test
pnpm typecheck
VANA_APP_PRIVATE_KEY="0x$(printf '1%.0s' {1..64})" \
  VANA_APP_URL=http://localhost:3000 \
  pnpm build
git diff --check
```

The environment values in the build command are dummy values. Configuration is loaded lazily, so module evaluation and compilation do not require real credentials.

## Live Vana Proof

1. Set a real `VANA_APP_PRIVATE_KEY` and the exact browser-visible `VANA_APP_URL`.
2. Start the app with `pnpm dev`.
3. Open the runtime that matches the Vana host:
   - production/mainnet: `http://localhost:3000`
   - production/moksha: `http://localhost:3000?network=moksha`
   - dev/moksha: `http://localhost:3000?vana_env=dev&network=moksha`
4. Select **Connect LinkedIn**. Approve `linkedin.profile` in the Vana tab and keep it open while the Personal Server read completes.
5. Confirm the original tab moves through waiting, reading, and ready, and replaces the sample fixture with the approved profile snapshot.
6. Confirm the return tab reports server-fetched request status. Changing its `status`, `errorCode`, or `errorMessage` query parameters must not change the displayed result.

Invalid or duplicated `vana_env` and `network` values fail at request creation. Status and read routes accept only `requestId`; they recover env/network from the signed HTTP-only request cookie.

## Source Replacement Boundary

Replace these app-local files when adapting the starter to another source or product:

- `src/lib/vana/constants.ts`: app identity, source, and scope
- `src/data/linkedin-profile.fixture.ts`: credential-free sample data
- `src/lib/linkedin-profile.ts`: external payload to app-owned view model
- `src/components/ProfileSnapshot.tsx`: rendered product surface
- Product wording in `src/components/LinkedInProfileApp.tsx`

Keep the source, fixture, mapper, and UI in the app. Do not move them into a shared runtime package.

## Transport Bundle Boundary

The reusable direct request/status/read/return bundle is:

- `src/lib/vana/app-url.ts`
- `src/lib/vana/binding.ts`
- `src/lib/vana/capability.ts`
- `src/lib/vana/errors.ts`
- `src/lib/vana/request.ts`
- `src/lib/vana/runtime.ts`
- `src/lib/vana/server.ts`
- `src/app/api/vana/request/route.ts`
- `src/app/api/vana/status/route.ts`
- `src/app/api/vana/read/route.ts`
- `src/app/connect/return/page.tsx`
- The `useDirectVanaConnect` transport callbacks in `src/components/LinkedInProfileApp.tsx`

Do not add a second payment state machine, retry wrapper, caller-selected return URL, client-side private key, query-param runtime on status/read, raw SDK payload UI contract, or one shared cookie that overwrites concurrent requests. `@opendatalabs/vana-sdk` owns Personal Server transport retries and `402` settlement; this bundle owns only validation, session binding, sanitized errors, and app-local mapping.
