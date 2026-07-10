# Vana Data App Starter

A small Next.js reference app that turns approved `linkedin.profile` data into a LinkedIn profile snapshot. The transport is reusable; the LinkedIn source, sample fixture, mapper, and rendered snapshot are app-local examples.

## Requirements

- Node.js 22 or newer
- pnpm
- A Vana app private key for live requests
- A browser-accessible app URL for live return redirects

## Install the Direct LinkedIn registry item

Install the composite source-specific reference directly from this public GitHub registry:

```bash
npx shadcn@latest add vana-com/vana-data-app-starter/direct-vana-linkedin-next
```

No `components.json` is required. The item uses explicit root-relative targets. For a reproducible public release, replace the mutable default-branch command with an immutable ref after that ref exists:

```bash
npx shadcn@latest add vana-com/vana-data-app-starter/direct-vana-linkedin-next#<full-commit-sha>
```

The consumer must already be a TypeScript Next.js App Router project using `src/app` and the `@/*` to `./src/*` TypeScript path alias. The item installs `@opendatalabs/vana-sdk@3.13.4`, `server-only@0.0.1`, and the `tsx` test runner. It does not install Next.js, React, a page shell, layout, global styles, or product UI.

> **Note on shadcn.** We use `shadcn` purely as a file-distribution registry — a versioned way to `add` and later re-sync the Vana transport files. This repo has **nothing to do with Tailwind or the shadcn UI component system**; the registry ships `registry:file` items (plain `.ts`/`.tsx` transport code), not `registry:ui` components. A consumer needs no Tailwind, no `cn` util, and no design tokens to install it. `components.json` is optional and only used to register the `@vana` namespace; the GitHub-shorthand install above needs none.

Review these collision paths before installing; resolving existing files is app-owned:

```text
src/lib/vana/{app-url,binding,capability,constants,errors,request,response,return-state,runtime,server}.ts
src/lib/linkedin-profile.ts
src/data/linkedin-profile.fixture.ts
src/app/api/vana/{request,status,read}/route.ts
src/app/connect/return/page.tsx
test/contract.test.ts
```

Set environment values manually in the consumer. The registry does not copy them:

```dotenv
VANA_APP_PRIVATE_KEY=0x...
VANA_APP_URL=https://your-app.example
```

`VANA_APP_URL` fixes the return origin and `/connect/return` URL. Keep the private key server-only.

After installation, the app owns identity/source/scope changes in `constants.ts`, the LinkedIn mapper and fixture, the return-page presentation, all UI/copy/pages/styles, environment values, package scripts, and collision resolution. Real user-facing UI stays app-owned. App operators fund Direct reads; end-user copy must describe availability or recovery without exposing builder payment mechanics.

The registry can add the test file and `tsx` dev dependency, but it cannot merge a test script into the consumer's `package.json`. Run the shipped contract directly:

```bash
npx tsx --test test/contract.test.ts
```

This manifest tracks the transport files on released starter `main`, including the final builder escrow message from starter PR #5. Sync from `main` and repeat registry validation plus a clean consumer install before creating any release tag. Until an immutable ref exists and passes that gate, the default-branch command is a development install, not a versioned release.

### Maintaining the registry (maintainers only)

`registry.json` is the source manifest. Built, content-inlined items are emitted to `public/r/` and committed so they resolve over both the deployed app (`/r/{name}.json`) and raw GitHub. Rebuild whenever a transport file or `registry.json` changes:

```bash
pnpm registry:build   # shadcn build --output public/r
```

Commit the regenerated `public/r/*.json` in the same change as the source edit so the two never drift.

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
- `src/lib/vana/return-state.ts`
- `src/lib/vana/runtime.ts`
- `src/lib/vana/server.ts`
- `src/app/api/vana/request/route.ts`
- `src/app/api/vana/status/route.ts`
- `src/app/api/vana/read/route.ts`
- `src/app/connect/return/page.tsx`
- The `useDirectVanaConnect` transport callbacks in `src/components/LinkedInProfileApp.tsx`

Do not add a second payment state machine, retry wrapper, caller-selected return URL, client-side private key, query-param runtime on status/read, raw SDK payload UI contract, or one shared cookie that overwrites concurrent requests. `@opendatalabs/vana-sdk` owns Personal Server transport retries and `402` settlement; this bundle owns only validation, session binding, sanitized errors, and app-local mapping.
