import type { VercelRequest, VercelResponse } from '@vercel/node';

const LUTUITUI_PRODUCTION = 'https://ai.lutuitui.com/api/api';
const MEDIA_PER_PAGE = 200; // mediaList 每页最大
const CONCURRENCY = 20; // 并发数

interface MediaItem {
  id: number;
  name: string;
  source: 'media' | 'selfMedia';
  platformName?: string;
  regionName?: string;
  costPrice?: number;
}

function makeHeaders(appId: string, apiKey: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    'Content-Type': 'application/json',
    'x-app-id': appId,
    'x-api-key': apiKey,
    timestamp: String(timestamp),
    'device-type': 'pc',
  };
}

async function fetchMediaPage(page: number, headers: Record<string, string>, keyword = '') {
  const body: any = { page, perPage: MEDIA_PER_PAGE };
  if (keyword) body.name = keyword; // 鹿推推 API 支持 name 搜索
  const resp = await fetch(`${LUTUITUI_PRODUCTION}/media/mediaList`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  return {
    records: (data.content.records || []).map((r: any): MediaItem => ({
      id: r.id,
      name: r.name,
      source: 'media' as const,
      platformName: r.portalName || r.channelTypeName || '',
      regionName: r.regionName || '',
      costPrice: r.costPrice ?? undefined,
    })),
    total: data.content.total || 0,
    pages: data.content.pages || 0,
  };
}

async function fetchSelfMediaPage(page: number, headers: Record<string, string>, keyword = '') {
  const body: any = { current: page, size: 20 };
  if (keyword) body.name = keyword;
  const resp = await fetch(`${LUTUITUI_PRODUCTION}/media/selfMediaList`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  return {
    records: (data.content.records || []).map((r: any): MediaItem => ({
      id: r.id,
      name: r.name,
      source: 'selfMedia' as const,
      platformName: r.platformName || '',
      regionName: r.regionName || '',
      costPrice: r.costPrice ?? undefined,
    })),
    total: data.content.total || 0,
    pages: data.content.pages || 0,
  };
}

// 兜底：万一 API 不支持 name 参数，客户端过滤
function matches(item: MediaItem, kw: string) {
  const s = `${item.name} ${item.platformName} ${item.regionName}`.toLowerCase();
  return s.includes(kw);
}

// 搜媒体库 —— 直接传 name 参数给鹿推推 API，又快又准
async function searchMediaList(keyword: string, headers: Record<string, string>) {
  const kw = keyword.toLowerCase();
  const results: MediaItem[] = [];
  const first = await fetchMediaPage(1, headers, keyword);
  // 如果 API 返回很多记录说明 name 参数没有生效，兜底客户端过滤
  results.push(...(first.total > 500 ? first.records.filter(r => matches(r, kw)) : first.records));

  const totalPages = first.pages;
  const useClientFilter = first.total > 500;
  for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY) {
    const batchEnd = Math.min(batchStart + CONCURRENCY - 1, totalPages);
    const batchPages = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);
    const settled = await Promise.allSettled(
      batchPages.map(p => fetchMediaPage(p, headers, keyword))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        const recs = useClientFilter ? r.value.records.filter(x => matches(x, kw)) : r.value.records;
        results.push(...recs);
      }
    }
  }
  return results;
}

// 搜自媒体库 —— 直接传 name 参数给鹿推推 API
async function searchSelfMediaList(keyword: string, headers: Record<string, string>) {
  const kw = keyword.toLowerCase();
  const results: MediaItem[] = [];
  const DEADLINE = Date.now() + 50_000;

  const first = await fetchSelfMediaPage(1, headers, keyword);
  const useClientFilter = first.total > 500;
  results.push(...(useClientFilter ? first.records.filter(r => matches(r, kw)) : first.records));

  const totalPages = first.pages;
  for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY) {
    if (Date.now() > DEADLINE - 5000) {
      console.log(`[selfMediaList] 接近超时，已搜到第 ${batchStart - 1}/${totalPages} 页`);
      break;
    }
    const batchEnd = Math.min(batchStart + CONCURRENCY - 1, totalPages);
    const batchPages = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);
    const settled = await Promise.allSettled(
      batchPages.map(p => fetchSelfMediaPage(p, headers, keyword))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        const recs = useClientFilter ? r.value.records.filter(x => matches(x, kw)) : r.value.records;
        results.push(...recs);
      }
    }
  }
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST 请求' });

  try {
    const { keyword, source = 'media', current = 1, size = 20 } = req.body || {};

    const appId = process.env.LUTUITUI_APP_ID;
    const apiKey = process.env.LUTUITUI_API_KEY;
    if (!appId || !apiKey) {
      return res.status(500).json({ error: '服务端未配置鹿推推凭证' });
    }

    const headers = makeHeaders(appId, apiKey);

    // 有关键词 → 服务端全量搜索
    if (keyword && keyword.trim()) {
      console.log(`[鹿推推搜索] 关键词: "${keyword.trim()}", 来源: ${source}`);
      let results: MediaItem[];

      if (source === 'selfMedia') {
        results = await searchSelfMediaList(keyword.trim(), headers);
      } else if (source === 'all') {
        // 并发搜两个库
        const [mediaResults, selfResults] = await Promise.allSettled([
          searchMediaList(keyword.trim(), headers),
          searchSelfMediaList(keyword.trim(), headers),
        ]);
        results = [
          ...(mediaResults.status === 'fulfilled' ? mediaResults.value : []),
          ...(selfResults.status === 'fulfilled' ? selfResults.value : []),
        ];
      } else {
        // 默认搜媒体库
        results = await searchMediaList(keyword.trim(), headers);
      }

      console.log(`[鹿推推搜索] 找到 ${results.length} 条匹配`);

      return res.status(200).json({
        success: true,
        data: {
          records: results,
          total: results.length,
          current: 1,
          pages: 1,
          isSearchResult: true,
        },
      });
    }

    // 无关键词 → 简单分页
    const data = source === 'selfMedia'
      ? await fetchSelfMediaPage(current, headers)
      : await fetchMediaPage(current, headers);
    return res.status(200).json({
      success: true,
      data: {
        records: data.records,
        total: data.total,
        current,
        pages: data.pages,
        isSearchResult: false,
      },
    });
  } catch (error: any) {
    console.error('[鹿推推媒体搜索] 请求失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '网络请求失败',
    });
  }
}
