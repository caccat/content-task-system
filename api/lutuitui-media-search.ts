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

async function fetchMediaPage(page: number, headers: Record<string, string>) {
  const resp = await fetch(`${LUTUITUI_PRODUCTION}/media/mediaList`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ page, perPage: MEDIA_PER_PAGE }),
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

async function fetchSelfMediaPage(page: number, headers: Record<string, string>) {
  const resp = await fetch(`${LUTUITUI_PRODUCTION}/media/selfMediaList`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ current: page, size: 20 }),
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

function matchesKeyword(item: MediaItem, kw: string): boolean {
  return (
    item.name.toLowerCase().includes(kw) ||
    (item.platformName || '').toLowerCase().includes(kw) ||
    (item.regionName || '').toLowerCase().includes(kw) ||
    String(item.id).includes(kw)
  );
}

// 并发加载全部页面并过滤
async function searchAll(keyword: string, headers: Record<string, string>) {
  const kw = keyword.toLowerCase();
  const allResults: MediaItem[] = [];

  // 1. 先搜 mediaList（新闻媒体，262页，快）
  try {
    const first = await fetchMediaPage(1, headers);
    allResults.push(...first.records.filter(r => matchesKeyword(r, kw)));

    const totalPages = first.pages;
    for (let batchStart = 2; batchStart <= totalPages; batchStart += CONCURRENCY) {
      const batchPages: number[] = [];
      for (let p = batchStart; p < Math.min(batchStart + CONCURRENCY, totalPages + 1); p++) {
        batchPages.push(p);
      }
      const results = await Promise.allSettled(
        batchPages.map(p => fetchMediaPage(p, headers))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          allResults.push(...r.value.records.filter(rec => matchesKeyword(rec, kw)));
        }
      }
    }
  } catch (e: any) {
    console.error('[mediaList搜索] 失败:', e.message);
  }

  // 2. 再搜 selfMediaList（自媒体）—— 最多搜 200 页（4k条）避免超时
  try {
    const first = await fetchSelfMediaPage(1, headers);
    allResults.push(...first.records.filter(r => matchesKeyword(r, kw)));

    const maxSelfPages = Math.min(first.pages, 200);
    for (let batchStart = 2; batchStart <= maxSelfPages; batchStart += CONCURRENCY) {
      const batchPages: number[] = [];
      for (let p = batchStart; p < Math.min(batchStart + CONCURRENCY, maxSelfPages + 1); p++) {
        batchPages.push(p);
      }
      const results = await Promise.allSettled(
        batchPages.map(p => fetchSelfMediaPage(p, headers))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          allResults.push(...r.value.records.filter(rec => matchesKeyword(rec, kw)));
        }
      }
    }
  } catch (e: any) {
    console.error('[selfMediaList搜索] 失败:', e.message);
  }

  return allResults;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST 请求' });

  try {
    const { keyword, current = 1, size = 20 } = req.body || {};

    const appId = process.env.LUTUITUI_APP_ID;
    const apiKey = process.env.LUTUITUI_API_KEY;
    if (!appId || !apiKey) {
      return res.status(500).json({ error: '服务端未配置鹿推推凭证' });
    }

    const headers = makeHeaders(appId, apiKey);

    // 有关键词 → 服务端全量搜索
    if (keyword && keyword.trim()) {
      console.log(`[鹿推推搜索] 搜索关键词: "${keyword}"`);
      const results = await searchAll(keyword.trim(), headers);
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

    // 无关键词 → 简单分页（默认用 mediaList）
    const data = await fetchMediaPage(current, headers);
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
