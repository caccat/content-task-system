export const CORPUS_KEY_PREFIX: string;
export const CORPUS_PLACEHOLDER: string;

export interface CorpusEntry {
  key: string;
  title: string;
  content: string;
  updated_at?: string | null;
}

export interface CorpusRow {
  key: string;
  value: string | null;
  updated_at?: string | null;
}

export function parseCorpusEntries(rows: CorpusRow[]): CorpusEntry[];
export function buildCorpusText(entries: CorpusEntry[]): string;
export function replaceCorpusPlaceholder(prompt: string, entries: CorpusEntry[]): string;
