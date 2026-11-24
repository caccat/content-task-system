export const RANKING_REGIONS = [
  '上海', '北京', '广州', '南京', '香港', '新加坡', '英国', '美国', '澳洲',
  '深圳', '重庆', '苏州', '成都', '杭州', '武汉', '宁波', '天津', '青岛',
  '无锡', '长沙', '郑州', '济南', '合肥', '福州', '泉州',
];

export const RANKING_BATCH_PREFIX = 'ranking_batch_';
export const RANKING_SOURCE_PREFIX = 'ranking_source_';
export const RANKING_TASK_PREFIX = 'ranking:';

export function detectRegions(keyword) {
  return RANKING_REGIONS.filter(region => String(keyword).includes(region));
}

export function parseRankingRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('表格没有可读取的数据行');
  const header = rows[0].map(value => String(value ?? '').trim());
  if (header[0] !== '关键词' || header[1] !== 'AI回答' || header[2] !== '排名') {
    throw new Error('前三列必须依次为“关键词”“AI回答”“排名”');
  }
  const canonicalRows = rows.slice(1).map(row => [0, 1, 2].map(index => String(row?.[index] ?? '').trim()));
  const candidates = [];
  canonicalRows.forEach(([keyword, answer, rankText], index) => {
    if (!rankText) return; // 本次导入永久跳过：第三列为空
    const rank = Number(rankText);
    if (!Number.isFinite(rank)) throw new Error(`第 ${index + 2} 行排名不是数字：${rankText}`);
    if (rank === 1) return; // 本次导入永久跳过：指南者已排第 1
    if (!keyword || !answer) throw new Error(`第 ${index + 2} 行缺少关键词或 AI 回答`);
    candidates.push({
      id: `row-${index + 2}`,
      sourceRow: index + 2,
      keyword,
      answer,
      rank,
      regions: detectRegions(keyword),
      title: '',
      scenario: '',
      objective: '',
      quantity: 1,
      websites: [],
      promptId: '',
      deadline: '',
      state: 'pending',
      lastError: null,
      taskId: null,
    });
  });
  return { canonicalRows, candidates };
}

export async function hashRankingRows(canonicalRows) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalRows));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function rankingTaskMarker(hash, candidateId) {
  return `${RANKING_TASK_PREFIX}${hash}:${candidateId}`;
}

export function isRankingLeaseActive(lease, now = Date.now()) {
  return Boolean(lease && Number.isFinite(Date.parse(lease.updatedAt)) && now - Date.parse(lease.updatedAt) < 30 * 60 * 1000);
}

export function validateRankingTitle(title, regions) {
  const clean = String(title ?? '').replace(/^#+\s*/, '').trim();
  if (!clean) return 'AI 未生成文章标题';
  if (regions.length === 0) {
    const unexpected = detectRegions(clean);
    if (unexpected.length) return `无地区任务的文章标题出现地区：${unexpected.join('、')}`;
    if (clean.includes('无地区')) return '文章标题不能包含“无地区”';
  } else {
    const missing = regions.filter(region => !clean.includes(region));
    if (missing.length) return `文章标题缺少地区：${missing.join('、')}`;
  }
  return null;
}

export function extractRankingArticle(text, regions) {
  const clean = String(text ?? '').trim().replace(/^```(?:markdown|md|html)?\s*/i, '').replace(/\s*```$/, '').trim();
  const lines = clean.split(/\r?\n/);
  const heading = lines[0];
  if (!/^#\s+\S/.test(heading)) throw new Error('AI 返回内容的第一行必须是 Markdown 一级标题');
  const title = heading.replace(/^#\s+/, '').trim();
  const titleError = validateRankingTitle(title, regions);
  if (titleError) throw new Error(titleError);
  if (clean.replace(heading, '').trim().length < 100) throw new Error('AI 返回的文章正文过短');
  return { title, content: clean };
}
