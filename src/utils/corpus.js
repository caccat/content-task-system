export const CORPUS_KEY_PREFIX = 'corpus_entry_';
export const CORPUS_PLACEHOLDER = '{{语料}}';

export function parseCorpusEntries(rows) {
  return rows
    .filter((row) => row.key.startsWith(CORPUS_KEY_PREFIX))
    .map((row) => {
      let value;
      try {
        value = JSON.parse(row.value || '');
      } catch {
        throw new Error(`语料记录 ${row.key} 的内容格式错误`);
      }

      if (
        !value ||
        typeof value !== 'object' ||
        !('title' in value) ||
        !('content' in value) ||
        typeof value.title !== 'string' ||
        typeof value.content !== 'string' ||
        !value.title.trim() ||
        !value.content.trim()
      ) {
        throw new Error(`语料记录 ${row.key} 缺少标题或内容`);
      }

      return {
        key: row.key,
        title: value.title.trim(),
        content: value.content.trim(),
        updated_at: row.updated_at,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.key.localeCompare(b.key));
}

export function buildCorpusText(entries) {
  return entries.map((entry) => `【${entry.title}】\n${entry.content}`).join('\n\n');
}

export function replaceCorpusPlaceholder(prompt, entries) {
  if (!prompt.includes(CORPUS_PLACEHOLDER)) return prompt;
  if (entries.length === 0) {
    throw new Error('提示词包含 {{语料}}，但语料库为空。请先在内容生成者 → 语料库中添加语料，然后重试本次生成');
  }
  return prompt.split(CORPUS_PLACEHOLDER).join(buildCorpusText(entries));
}
