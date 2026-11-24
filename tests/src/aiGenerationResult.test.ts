import assert from 'node:assert/strict';
import test from 'node:test';
import { getAiGenerationError } from '../../src/utils/aiGenerationResult.ts';

test('keeps the prior single-task success response compatible', () => {
  assert.equal(getAiGenerationError({ success: false, results: [{ success: true }] }, 200), null);
});

test('surfaces corpus and transport failures with useful details', () => {
  assert.match(
    getAiGenerationError({ success: false, results: [{ success: false, error: '语料库为空' }] }, 200) || '',
    /语料库为空/,
  );
  assert.equal(getAiGenerationError({ error: '数据库不可用' }, 503), '数据库不可用');
  assert.equal(getAiGenerationError({}, 502), 'AI 接口返回 HTTP 502');
});
