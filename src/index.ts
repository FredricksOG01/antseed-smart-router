import type { AntseedRouterPlugin } from '@antseed/node';
import { SmartRouter, type SmartRouterConfig } from './router.js';

function numberFrom(config: Record<string, string>, key: string, fallback: number): number {
  const raw = config[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const plugin: AntseedRouterPlugin = {
  name: 'smart-router',
  displayName: 'Smart Router',
  version: '0.1.0',
  type: 'router',
  description: 'Filters peers by reputation and price, then balances cost, latency, and observed reliability.',
  configSchema: [
    {
      key: 'MIN_REPUTATION',
      label: 'Minimum reputation',
      type: 'number',
      required: false,
      default: 60,
      description: 'Reject peers below this reputation score (0–100).',
    },
    {
      key: 'MAX_INPUT_USD_PER_MILLION',
      label: 'Maximum input price',
      type: 'number',
      required: false,
      default: 25,
      description: 'Reject peers above this input price in USD per million tokens.',
    },
    {
      key: 'MAX_OUTPUT_USD_PER_MILLION',
      label: 'Maximum output price',
      type: 'number',
      required: false,
      default: 100,
      description: 'Reject peers above this output price in USD per million tokens.',
    },
    {
      key: 'MAX_CONSECUTIVE_FAILURES',
      label: 'Maximum consecutive failures',
      type: 'number',
      required: false,
      default: 3,
      description: 'Temporarily exclude a peer after this many consecutive failed requests.',
    },
  ],
  createRouter(config: Record<string, string>) {
    const injectedMinReputation = numberFrom(config, 'ANTSEED_MIN_REPUTATION', 0);
    const configuredMinReputation = numberFrom(config, 'MIN_REPUTATION', 60);
    const routerConfig: SmartRouterConfig = {
      minReputation: Math.max(injectedMinReputation, configuredMinReputation),
      maxInputUsdPerMillion: Math.max(0, numberFrom(config, 'MAX_INPUT_USD_PER_MILLION', 25)),
      maxOutputUsdPerMillion: Math.max(0, numberFrom(config, 'MAX_OUTPUT_USD_PER_MILLION', 100)),
      maxConsecutiveFailures: Math.max(1, Math.floor(numberFrom(config, 'MAX_CONSECUTIVE_FAILURES', 3))),
    };
    return new SmartRouter(routerConfig);
  },
};

export default plugin;
