import { describe, expect, it } from 'vitest';
import { computeQueuedBatchReadyAt } from './catalog';

const MIN = 60 * 1000;

describe('computeQueuedBatchReadyAt（工廠排隊生產遞補用）', () => {
  it('佇列是空的，從現在開始算生產時間', () => {
    const readyAt = computeQueuedBatchReadyAt(null, 0, 15);
    expect(readyAt).toBe(new Date(15 * MIN).toISOString());
  });

  it('佇列最後一批還沒到時間，新一批接在它後面才開始算', () => {
    const latestReadyAt = new Date(20 * MIN).toISOString();
    const readyAt = computeQueuedBatchReadyAt(latestReadyAt, 5 * MIN, 15);
    expect(readyAt).toBe(new Date(35 * MIN).toISOString());
  });

  it('佇列最後一批其實已經到時間了（玩家還沒收成），新一批從現在開始算，不繼承過去的等待時間', () => {
    const latestReadyAt = new Date(5 * MIN).toISOString();
    const readyAt = computeQueuedBatchReadyAt(latestReadyAt, 20 * MIN, 15);
    expect(readyAt).toBe(new Date(35 * MIN).toISOString());
  });

  it('佇列最後一批剛好在此刻完成，等同於從現在開始算', () => {
    const latestReadyAt = new Date(20 * MIN).toISOString();
    const readyAt = computeQueuedBatchReadyAt(latestReadyAt, 20 * MIN, 15);
    expect(readyAt).toBe(new Date(35 * MIN).toISOString());
  });
});
