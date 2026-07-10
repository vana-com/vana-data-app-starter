# Vana Data App Starter

A small Next.js app that turns approved `linkedin.profile` data into a LinkedIn profile snapshot.

It gives you two different proofs:

- **Local proof:** the fixture, mapper, and UI work without Vana.
- **Live proof:** a registered app identity requests and reads approved data from a Personal Server.

Passing the local proof does not mean the live path is configured.

## Build the app locally

```bash
git clone https://github.com/vana-com/vana-data-app-starter.git
cd vana-data-app-starter
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The initial profile is a fictional fixture, so this works without a private key, app identity, approval, or Personal Server read.

```bash
pnpm test
pnpm typecheck
```

## Connect it to Vana

Create a registered app identity instead of making a private key by hand:

1. Open the Developers page for the Vana environment you are using.
2. Select the network.
3. Enter the exact App URL the browser will use. For this starter, use `http://localhost:3000`.
4. Create the app identity and approve the wallet signature.
5. Copy the generated environment values immediately. The Developers page shows the private key once.

| Request lane | Create the identity at | Open the starter at |
| --- | --- | --- |
| Production / Mainnet | [account.vana.org/developers](https://account.vana.org/developers), Mainnet | `http://localhost:3000` |
| Production / Moksha | [account.vana.org/developers](https://account.vana.org/developers), Moksha | `http://localhost:3000?network=moksha` |
| Dev / Moksha | [account-dev.vana.org/developers](https://account-dev.vana.org/developers), Moksha | `http://localhost:3000?vana_env=dev&network=moksha` |

Put the generated values in `.env.local`:

```dotenv
VANA_APP_PRIVATE_KEY=0x...
VANA_APP_URL=http://localhost:3000
```

Keep the private key server-only. `VANA_APP_URL` must match the registered App URL; the starter derives `/connect/return` from its origin.

There is no separate callback-registration step.

### Choose the data scopes

A scope is a named category of data that an app requests, such as a LinkedIn profile or work history. Request only what the product needs and what the selected collection path can produce.

| Scope | Data | Collection path |
| --- | --- | --- |
| `linkedin.profile` | Profile identity, headline, summary, and location | Public profile or deep import |
| `linkedin.experience` | Roles, employers, and dates | Public profile or deep import |
| `linkedin.education` | Schools, degrees, and dates | Public profile or deep import |
| `linkedin.skills` | Listed skills | Public profile or deep import |
| `linkedin.languages` | Listed languages | Public profile or deep import |
| `linkedin.connections` | Connection list | Deep authenticated desktop import only |

This starter requests only `linkedin.profile` in `src/lib/vana/constants.ts`. If you change or add scopes, update the capability check, fixture, mapper, and product UI together.

Unity's current scope authority lives in the private `unity-surfaces/packages/app-core/src/platform/source-list.ts` catalog. A public, builder-searchable source and scope catalog does not exist yet; this README lists the LinkedIn scopes so builders do not have to guess.

## Run a live request

Start the app, open the URL matching the registered identity, and select **Connect LinkedIn**. Vana opens in a normal new browser tab, not a popup window.

```text
App tab:  sample -> creating -> waiting -> reading -> approved profile
Vana tab: approve -> deliver data -> wait for the app to acknowledge the read
```

Keep the Vana tab open while it says data is being delivered. It may close after the app confirms the read. If the browser blocks the new tab, show an **Open approval** fallback.

`/connect/return` is a verified fallback and status surface, not the main product UI. It fetches authoritative status instead of trusting browser query parameters.

If **Connect LinkedIn** appears to do nothing, inspect `POST /api/vana/request` first. Missing environment values can fail request creation before the new tab receives its Vana URL.

### Production-readiness blockers

- [unity-surfaces #715](https://github.com/vana-com/unity-surfaces/issues/715): Moksha completion can return `denied` without an authoritative failure reason.
- [unity-surfaces #716](https://github.com/vana-com/unity-surfaces/issues/716): Mainnet requires the protocol's actual fee asset, but the deployed funding surface does not currently expose it correctly.
- [BUI-705](https://linear.app/vana-team/issue/BUI-705/make-the-public-source-scope-catalog-machine-readable-and): the public source-scope catalog is not yet machine-readable or authoritative, so builders cannot reliably discover supported scopes, schemas, and collection paths without private Unity knowledge.

Treat these as production-readiness gates, not optional documentation follow-ups. They do not invalidate the local fixture and mapper proof.

The app operator funds Direct reads. Keep escrow balances, fee assets, funding instructions, and raw server errors out of end-user UI. Show neutral availability and recovery copy instead.

## Adapt the product

Keep the transport and session handling. Replace the app-owned source boundary:

- `src/lib/vana/constants.ts`: request identity, source, and scope
- `src/data/linkedin-profile.fixture.ts`: credential-free sample data
- `src/lib/linkedin-profile.ts`: external payload to app view model
- `src/components/ProfileSnapshot.tsx`: finished product surface
- Product copy in `src/components/LinkedInProfileApp.tsx`

Preserve the product UI and replace only its Direct routes, session handling, fixture, and mapper.

Make `idle`, `waiting`, `reading`, `ready`, and `error` inspectable as pure views without a live request. A development-only fixture browser must branch before the Vana SDK mounts and must not open a tab, poll, read data, or touch escrow. Keep app-tab states separate from `/connect/return` states and label fixtures clearly.

## Add Direct Vana to an existing app

If you already have a TypeScript Next.js App Router project using `src/app` and the `@/*` path alias, install the released transport bundle instead of forking:

```bash
npx shadcn@latest add vana-com/vana-data-app-starter/direct-vana-linkedin-next#v0.1.0
```

This uses `shadcn` only as a file-distribution registry. It does not require Tailwind, shadcn UI components, a `cn` utility, design tokens, or `components.json`.

Review these app-owned collision paths before installing:

```text
src/lib/vana/*.ts
src/lib/linkedin-profile.ts
src/data/linkedin-profile.fixture.ts
src/app/api/vana/{request,status,read}/route.ts
src/app/connect/return/page.tsx
test/contract.test.ts
```

The item installs `@opendatalabs/vana-sdk@3.13.4`, `server-only`, and `tsx`; it does not install Next.js, React, layouts, styles, product UI, environment values, or a `package.json` test script.

```bash
npx tsx --test test/contract.test.ts
```

## Transport boundary

The reusable bundle owns validation, request-session binding, sanitized server responses, and app-local result mapping:

```text
src/lib/vana/{app-url,binding,capability,constants,errors,request,response,return-state,runtime,server}.ts
src/app/api/vana/{request,status,read}/route.ts
src/app/connect/return/page.tsx
useDirectVanaConnect callbacks in src/components/LinkedInProfileApp.tsx
```

Do not add a second payment state machine, retry wrapper, caller-selected return URL, client-side private key, status/read runtime query parameters, raw SDK payload UI contract, or one shared cookie that overwrites concurrent requests. The Vana SDK owns Personal Server retries and `402` settlement.

## Maintaining the registry

`registry.json` is the source manifest. Rebuild and commit `public/r/*.json` whenever it or a transport file changes:

```bash
pnpm registry:build
```

Before creating a release tag, validate from merged `main` and repeat the clean consumer install using the immutable ref.
