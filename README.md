# Vana Data App Starter

A small Next.js app that turns approved `linkedin.profile` data into a LinkedIn profile snapshot.

It gives you two different proofs:

- **Local proof:** the fixture, mapper, and UI work without Vana.
- **Live proof:** a registered app identity requests and reads approved data from a Personal Server.

Passing the local proof does not mean the live path is configured.

## Build the app locally

Use Node.js 22 or newer. This starter runs its backend routes in the Node.js
runtime; it does not support the Edge runtime.

```bash
git clone https://github.com/vana-com/vana-data-app-starter.git
cd vana-data-app-starter
pnpm install
pnpm dev
```

Open the **Local** URL printed by Next.js. This is normally
[http://localhost:3000](http://localhost:3000). If that port is occupied and
you did not set `PORT` or pass `--port`, Next.js uses the next available port.
Use the exact printed origin throughout setup. The initial profile is a
fictional fixture, so this works without a private key, app identity, approval,
or Personal Server read.

```bash
pnpm test
pnpm typecheck
```

## Connect it to Vana

Create a registered app identity instead of making a private key by hand:

1. Open the Developers page for the Vana environment you are using.
2. Select the network.
3. Enter the exact App URL the browser will use. For this starter, use the local origin printed by `pnpm dev`.
4. Create the app identity and approve the wallet signature.
5. Copy the generated environment values immediately. The Developers page shows the private key once.

| Request lane | Create the identity at | Open the starter at |
| --- | --- | --- |
| Production / Mainnet | [account.vana.org/developers](https://account.vana.org/developers), Mainnet | `<local-origin>` |
| Production / Moksha | [account.vana.org/developers](https://account.vana.org/developers), Moksha | `<local-origin>?network=moksha` |
| Dev / Moksha | [account-dev.vana.org/developers](https://account-dev.vana.org/developers), Moksha | `<local-origin>?vana_env=dev&network=moksha` |

Put the generated values in `.env.local`:

```dotenv
VANA_APP_PRIVATE_KEY=0x...
VANA_APP_URL=http://localhost:3000
```

Replace the example origin with the exact local or deployed origin the browser
uses, including a non-default port. Keep the private key server-only.
`VANA_APP_URL` is server runtime configuration: the starter uses it for the app
homepage, `/connect/return`, and signed request/session binding. It must match
the registered App URL; never use a placeholder URL.

There is no separate callback-registration step.

### Deploy the server

Deploy this as one long-lived Node.js 22+ process. Set
`VANA_APP_PRIVATE_KEY` and `VANA_APP_URL` in the host's project environment for
every deployed environment you use; `.env.local` is not uploaded. Set
`VANA_APP_URL` to the fixed public origin that users open, then redeploy after
adding or changing either value.

The starter's consume-once guarantee is process-local. Within one uninterrupted
Node.js process, overlapping reads share one attempt and later repeats reuse the
accepted result. It retains at most 100 active request entries and refuses new
distinct reads at capacity rather than evicting charge protection. A restart or
cold start loses retained results. Serverless isolates, workers, multiple
processes, or multiple regions therefore require a shared atomic
consume-once/result store before they can safely serve paid reads.

### Choose the data scopes

A scope is a named category of data that an app requests, such as a LinkedIn profile or work history. Request only what the product needs and what the selected collection path can produce.

Browse the public [Scope Coverage Registry](https://github.com/vana-com/data-connectors/blob/main/SCOPES.md) to find other sources, their exact scope IDs, Web and Desktop availability, and connector maturity. Use the linked JSON schemas to inspect each scope's payload shape; for example, see the [LinkedIn scope schemas](https://github.com/vana-com/data-connectors/tree/main/connectors/linkedin/schemas).

| Scope | Data | Collection path |
| --- | --- | --- |
| `linkedin.profile` | Profile identity, headline, summary, and location | Public profile or deep import |
| `linkedin.experience` | Roles, employers, and dates | Public profile or deep import |
| `linkedin.education` | Schools, degrees, and dates | Public profile or deep import |
| `linkedin.skills` | Listed skills | Public profile or deep import |
| `linkedin.languages` | Listed languages | Public profile or deep import |
| `linkedin.connections` | Connection list | Deep authenticated desktop import only |

This starter requests only `linkedin.profile` in `src/lib/vana/constants.ts`. If you change or add scopes, update the capability check, fixture, mapper, and product UI together.

The local fictional fixture previews profile, Work, Education, and Skills, but
the current live request reads only `linkedin.profile`. The local preview is not
a public protocol fixture and does not prove that richer live shape.
[BUI-727](https://linear.app/vana-team/issue/BUI-727/support-a-real-multi-scope-linkedin-profile-snapshot-in-the-data-app)
owns the multi-scope transport, public fixtures, mapper, and product alignment.
Until then, keep local product proof distinct from live protocol proof.

The public Scope Coverage Registry is generated from the machine-readable
catalog owned by `vana-com/data-connectors`. Use it and its schemas as the
discovery surface instead of inventing starter-local public fixture rules.

## Run a live request

Start the app, open the URL matching the registered identity, and select **Connect LinkedIn**. Vana opens in a normal new browser tab, not a popup window.

```text
App tab:  sample -> creating -> waiting -> reading -> approved profile
Vana tab: approve -> deliver data -> wait for the app to acknowledge the read
```

Keep the Vana tab open while it says data is being delivered. It may close after the app confirms the read. If the browser blocks the new tab, show an **Open approval** fallback.

`/connect/return` is a verified fallback and status surface, not the main product UI. It fetches authoritative status instead of trusting browser query parameters.

If **Connect LinkedIn** appears to do nothing, inspect `POST /api/vana/request` first. Missing environment values can fail request creation before the new tab receives its Vana URL.

### Repeatable Moksha smoke

Moksha is Vana's public Testnet. This smoke drives the same starter request,
status, read, and acknowledgement routes as the product while keeping the
request-session cookie in the command. It does not require Mainnet funds.

Prerequisites:

1. `.env.local` contains the existing team-owned Moksha app identity and the
   exact registered `VANA_APP_URL`. These values contain a private key and must
   come through the team's approved secret-sharing surface, never this README,
   Git, Slack, or a run record. The owner and location of that shared test
   credential are not yet documented, so the README-only clean-checkout gate
   remains open.
2. That URL is reachable. For a local identity, start the starter at the exact
   registered origin in one terminal:

   ```bash
   pnpm dev
   ```

3. The test user is signed into [app.vana.org](https://app.vana.org), has
   **Protocol network: Testnet** selected, and has `linkedin.profile` data on
   their Personal Server.

Run the proof from a second terminal:

```bash
pnpm smoke:moksha
```

The command prints one Vana approval URL. Open it, approve the ordinary
LinkedIn request, and keep that tab open while the Personal Server delivers the
data. There is no wallet, network-addition, token-acquisition, bridge, or
Mainnet step for the approving user.

The command then:

1. accepts external `approved` or canonical `ready_for_read` as read-ready;
2. reads exactly once through the starter's charge-safe route;
3. rejects the fictional fixture and empty fallback profile;
4. waits for final `completed` status to prove consumer acknowledgement; and
5. writes a redacted record under `.scratch/bui-702/runs/`.

The record contains request/status metadata, commit and SDK versions, mapped
field names, a payload hash, and safe payment evidence. It resolves the SDK
release tag to a commit when the adjacent SDK checkout or GitHub is available;
an unresolved commit is recorded honestly as `unknown`. It never contains the
request cookie, app private key, Personal Server URL, auth headers, or LinkedIn
payload. `.scratch/` is ignored by Git.

Because the command owns the request cookie, the browser's `/connect/return`
page may say the request is unavailable. That browser page is not the smoke
oracle; the command's signed status call is. A successful command ends with
`completed` and exits zero.

SDK 3.13.4 exposes only lifecycle statuses to the starter and discards Vana
Web's `/fail` `errorCode`. Therefore a terminal `denied` can be attributed only
to the broad approval/readiness boundary by this command. Inspect the Vana tab
for `grant_registration_conflict` or `missing_external_completion_routing`
until the SDK status contract preserves that safe failure code. The smoke does
not invent a more precise owner than its observable API provides.

The first live author proof on 14 July 2026 used deployed Career Quest on
Moksha. It rendered the real `linkedin.profile` payload, returned
`status=completed`, and included no payment receipt. That specific read settled
zero Moksha tokens and consumed no faucet-funded Testnet balance. Do not infer
from one receipt-free read that every possible Moksha scope or Personal Server
is permanently unpriced.

### Mainnet funding limitation

The app operator funds Direct reads. A supported zero-crypto, self-service
Mainnet path is not yet proven; [BUI-703](https://linear.app/vana-team/issue/BUI-703/unblock-mainnet-direct-reads-with-self-service-usdce-escrow-funding)
owns that funding product and its live proof. Do not invent a manual acquisition
or bridging workflow in this starter. Keep escrow balances, fee assets, funding
instructions, and raw server errors out of end-user UI. Show neutral
availability and recovery copy instead.

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
src/components/linkedin-profile-copy.ts
src/app/api/vana/{request,status,read}/route.ts
src/app/connect/return/page.tsx
test/contract.test.ts
```

The item installs `@opendatalabs/vana-sdk@3.13.4`, `server-only`, `tsx`, and
the safe consumer-copy helper exercised by its contract test. It does not
install Next.js, React, layouts, styles, product components, environment values,
or a `package.json` test script.

```bash
npx tsx --test test/contract.test.ts test/consume-once.test.ts
```

## Transport boundary

The reusable bundle owns validation, request-session binding, sanitized server responses, and app-local result mapping:

```text
src/lib/vana/{app-url,binding,capability,constants,consume-once,errors,payment,request,response,return-state,runtime,server}.ts
src/app/api/vana/{request,status,read}/route.ts
src/app/connect/return/page.tsx
useDirectVanaConnect callbacks in src/components/LinkedInProfileApp.tsx
```

Do not add a second payment state machine, retry wrapper, caller-selected return URL, client-side private key, status/read runtime query parameters, raw SDK payload UI contract, or one shared cookie that overwrites concurrent requests. The Vana SDK owns Personal Server retries and `402` settlement.

## Maintaining the registry

`registry.json` is the source manifest. Rebuild `public/r/*.json` whenever it or a transport file changes, then run the registry parity test:

```bash
pnpm registry:build
pnpm exec tsx --test test/registry.test.ts
```

Publication and tagging are a fresh post-merge task. Before creating a release
tag, validate from merged `main` and repeat the clean consumer install using the
immutable ref.
