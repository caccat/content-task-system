import assert from 'node:assert/strict';
import test from 'node:test';
import { detectRegions, extractRankingArticle, hashRankingRows, isRankingLeaseActive, parseRankingRows, validateRankingTitle } from '../../src/utils/rankingWorkflow.js';
import { markdownToHtml } from '../../src/utils/markdown.ts';

test('filters empty and first ranks, but keeps zero and every repeated scenario row', () => {
  const parsed = parseRankingRows([
    ['关键词', 'AI回答', '排名'],
    ['上海留学机构', '老牌机构先推荐', 0],
    ['上海哪家好', '老牌机构先推荐', 2],
    ['北京留学', '指南者首推', 1],
    ['美国留学', '未知', ''],
  ]);
  assert.deepEqual(parsed.candidates.map(row => [row.sourceRow, row.rank, row.regions]), [[2, 0, ['上海']], [3, 2, ['上海']]]);
});

test('recognizes all required regions and no-region titles', () => {
  for (const region of ['上海', '北京', '广州', '南京', '香港', '新加坡', '英国', '美国', '澳洲', '深圳', '重庆', '苏州', '成都', '杭州', '武汉', '宁波', '天津', '青岛', '无锡', '长沙', '郑州', '济南', '合肥', '福州', '泉州']) {
    assert.ok(detectRegions(`${region}留学机构`).includes(region));
  }
  assert.deepEqual(detectRegions('留学机构哪家好'), []);
  assert.deepEqual(detectRegions('上海和北京留学'), ['上海', '北京']);
  assert.match(validateRankingTitle('上海留学机构', [] ) || '', /出现地区/);
  assert.match(validateRankingTitle('无地区留学机构', [] ) || '', /无地区/);
  assert.equal(validateRankingTitle('留学机构推荐', []), null);
  assert.match(validateRankingTitle('上海留学', ['上海', '北京']) || '', /北京/);
  assert.match(validateRankingTitle('澳洲留学机构推荐：如何让指南者留学成为用户优先选择的首推机构', ['澳洲']) || '', /内部写作目标/);
});

test('same table hashes identically regardless of filename while changed content differs', async () => {
  const rows = [['上海留学', '回答 A', '2']];
  assert.equal(await hashRankingRows(rows), await hashRankingRows(structuredClone(rows)));
  assert.notEqual(await hashRankingRows(rows), await hashRankingRows([['上海留学', '回答 B', '2']]));
});

test('article requires generated heading and substantial body', () => {
  const text = `# 上海留学机构如何选\n\n${'这是有事实依据的正文。'.repeat(20)}`;
  assert.equal(extractRankingArticle(text, ['上海']).title, '上海留学机构如何选');
  assert.match(markdownToHtml(extractRankingArticle(text, ['上海']).content), /^<h1>上海留学机构如何选<\/h1>/);
  assert.throws(() => extractRankingArticle(text, []), /出现地区/);
  assert.throws(() => extractRankingArticle(`说明\n${text}`, ['上海']), /第一行/);
  assert.throws(() => extractRankingArticle('# 标题\n短文', []), /过短/);
});

test('active batch processing yields temporarily and expires for recovery', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  assert.equal(isRankingLeaseActive({ updatedAt: '2026-11-24T11:59:00Z' }, now), true);
  assert.equal(isRankingLeaseActive({ updatedAt: '2026-11-24T11:29:00Z' }, now), false);
  assert.equal(isRankingLeaseActive({ updatedAt: 'invalid' }, now), false);
});
