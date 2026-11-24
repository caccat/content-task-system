import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCorpusEntries, replaceCorpusPlaceholder } from '../../src/utils/corpus.ts';

test('parses independent entries and replaces every corpus placeholder', () => {
  const entries = parseCorpusEntries([
    { key: 'corpus_entry_b', value: JSON.stringify({ title: '学校', content: '学校资料' }) },
    { key: 'other_setting', value: 'ignored' },
    { key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌', content: '品牌资料' }) },
  ]);

  assert.equal(entries.length, 2);
  const result = replaceCorpusPlaceholder('开头\n{{语料}}\n结尾\n{{语料}}', entries);
  assert.equal(result.includes('{{语料}}'), false);
  assert.equal(result.match(/品牌资料/g)?.length, 2);
  assert.equal(result.match(/学校资料/g)?.length, 2);
});

test('keeps prompts without a placeholder unchanged', () => {
  assert.equal(replaceCorpusPlaceholder('原有写作指令', []), '原有写作指令');
});

test('rejects missing and malformed corpus data', () => {
  assert.throws(() => replaceCorpusPlaceholder('{{语料}}', []), /语料库为空/);
  assert.throws(
    () => parseCorpusEntries([{ key: 'corpus_entry_bad', value: '{invalid' }]),
    /格式错误/,
  );
  assert.throws(
    () => parseCorpusEntries([{ key: 'corpus_entry_empty', value: JSON.stringify({ title: '空', content: '  ' }) }]),
    /缺少标题或内容/,
  );
});
