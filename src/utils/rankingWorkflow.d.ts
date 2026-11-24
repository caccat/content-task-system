export const RANKING_REGIONS: string[];
export const RANKING_BATCH_PREFIX: string;
export const RANKING_SOURCE_PREFIX: string;
export const RANKING_TASK_PREFIX: string;
export type RankingCandidate = {
  id: string; sourceRow: number; keyword: string; answer: string; rank: number | null;
  regions: string[]; title: string; scenario: string; objective: string;
  quantity: number; websites: string[]; promptId: string; deadline: string;
  state: 'pending' | 'analyzing' | 'ready' | 'failed' | 'creating' | 'generating' | 'completed';
  lastError: string | null; taskId: string | null;
};
export function detectRegions(keyword: string): string[];
export function parseRankingRows(rows: unknown[][]): { canonicalRows: string[][]; candidates: RankingCandidate[] };
export function hashRankingRows(rows: string[][]): Promise<string>;
export function rankingTaskMarker(hash: string, candidateId: string): string;
export function isRankingLeaseActive(lease: { updatedAt: string } | null | undefined, now?: number): boolean;
export function validateRankingTitle(title: string, regions: string[]): string | null;
export function extractRankingArticle(text: string, regions: string[]): { title: string; content: string };
