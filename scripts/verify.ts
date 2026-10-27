import type { AntseedRouterPlugin } from '@antseed/node';
import type { PeerInfo, SerializedHttpRequest } from '@antseed/node/types';
import plugin from '../src/index.js';

let passed = 0;
let failed = 0;
function assert(condition: boolean, message: string): void {
  if (condition) { console.log(`PASS: ${message}`); passed += 1; }
  else { console.error(`FAIL: ${message}`); failed += 1; }
}

async function main(): Promise<void> {
  const p = plugin as AntseedRouterPlugin;
  assert(p.type === 'router', 'plugin type is router');
  assert(typeof p.createRouter === 'function', 'plugin exposes createRouter');
  const router = await p.createRouter({ MIN_REPUTATION: '60', MAX_INPUT_USD_PER_MILLION: '10', MAX_OUTPUT_USD_PER_MILLION: '20' });
  assert(typeof router.selectPeer === 'function', 'router exposes selectPeer');
  assert(typeof router.onResult === 'function', 'router exposes onResult');

  const req = { requestId: 'verify-1', method: 'POST', path: '/v1/chat/completions', headers: {}, body: new Uint8Array() } as SerializedHttpRequest;
  assert(router.selectPeer(req, []) === null, 'returns null when no peers are available');

  const peer = (id: string, input: number, output: number, reputation: number) => ({
    peerId: id,
    providers: ['test-provider'],
    defaultInputUsdPerMillion: input,
    defaultOutputUsdPerMillion: output,
    providerPricing: { test: { defaults: { inputUsdPerMillion: input, outputUsdPerMillion: output } } },
    maxConcurrency: 5,
    reputationScore: reputation,
    lastSeen: Date.now(),
  }) as unknown as PeerInfo;

  const cheapTrusted = peer('a'.repeat(40), 2, 5, 90);
  const pricey = peer('b'.repeat(40), 50, 60, 99);
  const lowTrust = peer('c'.repeat(40), 1, 1, 20);
  assert(router.selectPeer(req, [pricey, lowTrust, cheapTrusted])?.peerId === cheapTrusted.peerId, 'chooses an eligible peer and excludes over-cap/low-reputation peers');

  const policy = router as typeof router & { allowsPeerForPolicy?: (req: SerializedHttpRequest, peer: PeerInfo) => boolean };
  assert(policy.allowsPeerForPolicy?.(req, cheapTrusted) === true, 'allows eligible peers through policy');
  assert(policy.allowsPeerForPolicy?.(req, pricey) === false, 'blocks peers above price cap');

  router.onResult(cheapTrusted, { success: false, latencyMs: 100, tokens: 10 });
  router.onResult(cheapTrusted, { success: false, latencyMs: 100, tokens: 10 });
  router.onResult(cheapTrusted, { success: false, latencyMs: 100, tokens: 10 });
  assert(policy.allowsPeerForPolicy?.(req, cheapTrusted) === false, 'blocks a peer after configured consecutive failures');

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
