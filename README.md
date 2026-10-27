# Antseed Smart Router

A beginner-friendly contribution project for the Antseed network. This router plugin adds a configurable reputation and price gate, then ranks eligible peers using a blend of listed prices, observed latency, reputation, and locally observed success/failure history.

**Status:** starter implementation. It has not yet been installed against a live Antseed buyer or tested against live providers. The verification script uses mock peer records; it does not claim to measure live network performance.

## Why this contributes

Antseed already has a built-in local router and a shared model-route planner. This project explores an alternative policy that is explicit about hard limits and uses request outcomes observed by the current buyer. It is intended as a community experiment, not a claim that it is better than Antseed's default router.

Official references checked:

- Router plugin API: https://antseed.com/docs/router-api/
- Routing and catalog: https://antseed.com/docs/api/routing/
- Official repository and starter template: https://github.com/AntSeed/antseed
- SDK package: https://www.npmjs.com/package/@antseed/node

## What it does

1. Rejects peers below a configurable minimum reputation score.
2. Rejects peers above configurable input/output price caps.
3. Excludes a peer after a configurable number of consecutive failed requests.
4. Ranks remaining peers using price, observed latency, reputation, and observed success rate.
5. Explains policy rejection in route previews where the Antseed buyer calls the optional explanation hook.

Latency and success/failure history are kept in memory for the lifetime of the router. They are not a global reputation system and reset when the process restarts.

## Requirements

- Node.js 20 or newer; use Node.js 24 if following the current Antseed repository's development runtime.
- npm
- An Antseed CLI/buyer for end-to-end use (not required for the mock verification script).

## Install dependencies and verify

From this folder, run:

```bash
npm install
npm run verify
npm run build
```

The verification script uses fake peers to test plugin shape, basic selection, policy filtering, and consecutive-failure handling. A successful mock test does not prove compatibility with every Antseed release; the build step checks against the installed `@antseed/node` type definitions.

## Try it with Antseed

After `npm run build`, install this local package using the Antseed CLI version you have installed:

```bash
antseed plugin add ./
antseed buyer start --router antseed-smart-router
```

If your CLI does not accept a local path, check `antseed plugin add --help` for the syntax supported by that release. Do not publish this package or use it for production routing until you have tested it end-to-end.

The router plugin name is `smart-router`; the package name is `antseed-smart-router`.

## Configuration

The plugin exposes these optional configuration fields:

| Key | Default | Meaning |
| --- | ---: | --- |
| `MIN_REPUTATION` | `60` | Minimum peer reputation, 0–100 |
| `MAX_INPUT_USD_PER_MILLION` | `25` | Maximum input-token price |
| `MAX_OUTPUT_USD_PER_MILLION` | `100` | Maximum output-token price |
| `MAX_CONSECUTIVE_FAILURES` | `3` | Exclude a peer after this many consecutive failures |

`ANTSEED_MIN_REPUTATION`, when supplied by Antseed, is also respected as a lower-bound policy. Actual route eligibility can additionally be affected by the buyer's own configuration, allow/block lists, model compatibility, pinned sellers, and gateway policy.

## How scoring works

Eligible peers receive a local score combining:

- 35% price (lower listed input/output prices score better relative to the current eligible set)
- 25% observed latency (unknown latency starts neutral, not assumed fast)
- 25% reported reputation
- 15% observed success rate
- an additional penalty for consecutive failures

This is a transparent starting heuristic, not a benchmark-proven optimal formula. It can be tuned after repeatable tests.

## Beginner roadmap

1. Install Node.js, download/unzip this folder, and open a terminal in it.
2. Run the three verification/build commands above.
3. Share any error output before changing dependencies or config.
4. Install locally and run against a test buyer.
5. Compare it with the built-in router using the same models and requests; record price, latency, success rate, and failures.
6. If the tests are sound, open a GitHub issue or discussion before proposing it as a contribution. Follow Antseed's current contribution instructions and licensing requirements.

## Safety notes

- The plugin does not handle keys, wallets, payments, or prompts beyond the request object Antseed passes to it.
- It does not query a third-party endpoint or send telemetry.
- Price caps are based on the peer's advertised default prices; per-service prices or non-token billing may require extra logic before using this in production.
- A router can influence which provider receives a prompt. Use only routing code you trust.
