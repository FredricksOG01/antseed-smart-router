import type { Router } from '@antseed/node';
import type { PeerInfo, SerializedHttpRequest } from '@antseed/node/types';

export interface SmartRouterConfig {
  minReputation: number;
  maxInputUsdPerMillion: number;
  maxOutputUsdPerMillion: number;
  maxConsecutiveFailures: number;
}

interface PeerHistory {
  latencyEmaMs?: number;
  consecutiveFailures: number;
  successes: number;
  failures: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * SmartRouter chooses a peer using price, observed latency, reputation, and
 * recent outcomes. The buyer still owns discovery, transport, and payments.
 */
export class SmartRouter implements Router {
  private readonly history = new Map<string, PeerHistory>();

  constructor(private readonly config: SmartRouterConfig) {}

  private historyFor(peerId: string): PeerHistory {
    let item = this.history.get(peerId);
    if (!item) {
      item = { consecutiveFailures: 0, successes: 0, failures: 0 };
      this.history.set(peerId, item);
    }
    return item;
  }

  private rejectionReason(peer: PeerInfo): string | null {
    const reputation = finiteOr(peer.reputationScore, -1);
    if (reputation < this.config.minReputation) {
      return reputation < 0
        ? `peer has no usable reputation score (minimum ${this.config.minReputation})`
        : `reputation ${reputation} is below minimum ${this.config.minReputation}`;
    }

    const input = finiteOr(peer.defaultInputUsdPerMillion, Number.POSITIVE_INFINITY);
    const output = finiteOr(peer.defaultOutputUsdPerMillion, Number.POSITIVE_INFINITY);
    if (input > this.config.maxInputUsdPerMillion) {
      return `input price ${input} exceeds cap ${this.config.maxInputUsdPerMillion} USD per million tokens`;
    }
    if (output > this.config.maxOutputUsdPerMillion) {
      return `output price ${output} exceeds cap ${this.config.maxOutputUsdPerMillion} USD per million tokens`;
    }

    const history = this.history.get(peer.peerId);
    if (history && history.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      return `peer has ${history.consecutiveFailures} consecutive failures`;
    }
    return null;
  }

  /** Used by Antseed's buyer proxy as an additional policy filter. */
  allowsPeerForPolicy(_req: SerializedHttpRequest, peer: PeerInfo): boolean {
    return this.rejectionReason(peer) === null;
  }

  /** Show a useful explanation in route previews when a peer is rejected. */
  explainPolicyRejection(_req: SerializedHttpRequest, peer: PeerInfo): string | null {
    return this.rejectionReason(peer);
  }

  selectPeer(_req: SerializedHttpRequest, peers: PeerInfo[]): PeerInfo | null {
    const eligible = peers.filter((peer) => this.rejectionReason(peer) === null);
    if (eligible.length === 0) return null;

    const inputs = eligible.map((p) => finiteOr(p.defaultInputUsdPerMillion, this.config.maxInputUsdPerMillion));
    const outputs = eligible.map((p) => finiteOr(p.defaultOutputUsdPerMillion, this.config.maxOutputUsdPerMillion));
    const maxInput = Math.max(...inputs, 0.000001);
    const maxOutput = Math.max(...outputs, 0.000001);

    const score = (peer: PeerInfo): number => {
      const peerHistory = this.historyFor(peer.peerId);
      const input = finiteOr(peer.defaultInputUsdPerMillion, this.config.maxInputUsdPerMillion);
      const output = finiteOr(peer.defaultOutputUsdPerMillion, this.config.maxOutputUsdPerMillion);
      const reputation = clamp(finiteOr(peer.reputationScore, 0), 0, 100) / 100;

      // Lower price scores better. Normalize against the currently eligible set.
      const priceScore = 1 - ((input / maxInput) * 0.6 + (output / maxOutput) * 0.4);
      // Unknown latency is neutral rather than assumed to be fast.
      const latencyScore = peerHistory.latencyEmaMs === undefined
        ? 0.5
        : 1 / (1 + peerHistory.latencyEmaMs / 1000);
      const totalResults = peerHistory.successes + peerHistory.failures;
      const observedReliability = totalResults === 0
        ? 0.75
        : peerHistory.successes / totalResults;
      const recentFailurePenalty = Math.min(peerHistory.consecutiveFailures * 0.12, 0.48);

      return (priceScore * 0.35)
        + (latencyScore * 0.25)
        + (reputation * 0.25)
        + (observedReliability * 0.15)
        - recentFailurePenalty;
    };

    return [...eligible].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  onResult(peer: PeerInfo, result: { success: boolean; latencyMs: number; tokens: number }): void {
    const history = this.historyFor(peer.peerId);
    if (result.success) {
      history.successes += 1;
      history.consecutiveFailures = 0;
      if (Number.isFinite(result.latencyMs) && result.latencyMs >= 0) {
        history.latencyEmaMs = history.latencyEmaMs === undefined
          ? result.latencyMs
          : history.latencyEmaMs * 0.7 + result.latencyMs * 0.3;
      }
    } else {
      history.failures += 1;
      history.consecutiveFailures += 1;
    }
  }
}
