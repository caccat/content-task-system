import type { VercelRequest, VercelResponse } from '@vercel/node';

// 鹿推推 API 地址
// channel 系列接口（支持 keyword 搜索）：https://ai.lutuitui.com/api
// mediaList/selfMediaList（不支持 keyword，但返回价格）：https://ai.lutuitui.com/api/api
const LUTUITUI_API = 'https://ai.lutuitui.com/api/api';
const LUTUITUI_CHANNEL = 'https://ai.lutuitui.com/api';

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

/**
 * 使用 channel 接口搜索（支持 keyword，用于有搜索词的场景）
 * 注意：channel 接口不返回 costPrice
 */
async function searchChannel(
  endpoint: '/channel/media' | '/channel/self-media',
  source: 'media' | 'selfMedia',
  params: { page: number; size: number; keyword: string },
  headers: Record<string, string>,
) {
  const resp = await fetch(`${LUTUITUI_CHANNEL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  const rawRecords = data.content?.records || [];
  return {
    records: rawRecords.map((r: any): MediaItem => ({
      id: r.id,
      name: r.name,
      source,
      platformName: r.platformName || r.portalName || '',
      regionName: r.regionName || '',
      costPrice: r.costPrice ?? undefined,
    })),
    total: data.content?.total || 0,
    pages: data.content?.pages || 0,
  };
}

/**
 * 使用 mediaList/selfMediaList 接口（不支持 keyword，但返回 costPrice，用于无搜索词的浏览模式）
 */
async function fetchListPage(
  endpoint: '/media/mediaList' | '/media/selfMediaList',
  source: 'media' | 'selfMedia',
  page: number,
  headers: Record<string, string>,
) {
  const isMedia = endpoint === '/media/mediaList';
  const body = isMedia
    ? { page, perPage: 200 }
    : { current: page, size: 200 };
  const resp = await fetch(`${LUTUITUI_API}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  const rawRecords = data.content?.records || [];
  return {
    records: rawRecords.map((r: any): MediaItem => ({
      id: r.id,
      name: r.name,
      source,
      platformName: r.platformName || r.portalName || '',
      regionName: r.regionName || '',
      costPrice: r.costPrice ?? undefined,
    })),
    total: data.content?.total || 0,
    pages: data.content?.pages || 0,
    perPage: isMedia ? 200 : 200,
  };
}

/**
 * 用 mediaList/selfMediaList 补全搜索结果的价格（channel 接口不返回 costPrice）
 * 通过并发取全列表前几页，按 ID 匹配价格
 */
async function enrichPrices(
  records: MediaItem[],
  headers: Record<string, string>,
): Promise<MediaItem[]> {
  const mediaIds = records.filter(r => r.source === 'media').map(r => r.id);
  const selfIds = records.filter(r => r.source === 'selfMedia').map(r => r.id);
  if (mediaIds.length === 0 && selfIds.length === 0) return records;

  const priceMap = new Map<string, number>();

  // 最多并发取 3 页（每页200条），足够覆盖大多数搜索结果
  const fetchPrices = async (endpoint: '/media/mediaList' | '/media/selfMediaList', ids: number[]) => {
    const idSet = new Set(ids);
    for (let page = 1; page <= 3; page++) {
      const remaining = [...idSet].filter(id => !priceMap.has(`${endpoint}:${id}`));
      if (remaining.length === 0) break;
      try {
        const result = await fetchListPage(endpoint, endpoint === '/media/mediaList' ? 'media' : 'selfMedia', page, headers);
        for (const r of result.records) {
          if (idSet.has(r.id)) {
            priceMap.set(`${endpoint}:${r.id}`, r.costPrice ?? 0);
          }
        }
        if (result.records.length < (result as any).perPage) break; // 最后一页
      } catch { break; }
    }
  };

  await Promise.all([
    mediaIds.length > 0 ? fetchPrices('/media/mediaList', mediaIds) : Promise.resolve(),
    selfIds.length > 0 ? fetchPrices('/media/selfMediaList', selfIds) : Promise.resolve(),
  ]);

  return records.map(r => ({
    ...r,
    costPrice: priceMap.get(`${r.source === 'selfMedia' ? '/media/selfMediaList' : '/media/mediaList'}:${r.id}`) ?? r.costPrice,
  }));
}

/**
 * 搜索 —— 按关键词搜索（每页最多20条），支持多页
 */
async function doSearch(
  endpoint: '/channel/media' | '/channel/self-media',
  source: 'media' | 'selfMedia',
  keyword: string,
  headers: Record<string, string>,
  current: number,
  size: number,
) {
  const kw = keyword.trim();
  console.log(`[鹿推推搜索] 关键词: "${kw}", 来源: ${source}, page=${current}, size=${size}`);

  const result = await searchChannel(endpoint, source, { page: current, size, keyword: kw }, headers);

  const totalPages = result.pages || 1;
  // 如果当前请求的页数超出结果，从请求第1页兜底
  let records = result.records;
  let page = result.pages > 0 ? current : 1;

  if (current > totalPages && records.length === 0) {
    const fallback = await searchChannel(endpoint, source, { page: 1, size, keyword: kw }, headers);
    records = fallback.records;
    page = 1;
  }

  // 补全价格（channel 接口不返回 costPrice）
  records = await enrichPrices(records, headers);

  return {
    records,
    total: result.total,
    page,
    totalPages,
  };
}

/**
 * 并发搜索两个库
 */
async function doSearchBoth(keyword: string, headers: Record<string, string>, current: number, size: number) {
  const [media, self] = await Promise.allSettled([
    searchChannel('/channel/media', 'media', { page: current, size: Math.ceil(size / 2), keyword: keyword.trim() }, headers),
    searchChannel('/channel/self-media', 'selfMedia', { page: current, size: Math.ceil(size / 2), keyword: keyword.trim() }, headers),
  ]);
  let records: MediaItem[] = [
    ...(media.status === 'fulfilled' ? media.value.records : []),
    ...(self.status === 'fulfilled' ? self.value.records : []),
  ];
  // 补全价格
  records = await enrichPrices(records, headers);
  const total = (media.status === 'fulfilled' ? media.value.total : 0)
    + (self.status === 'fulfilled' ? self.value.total : 0);
  return { records, total, page: current, totalPages: 1 };
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

    // 有关键词 → channel API 搜索
    if (keyword && keyword.trim()) {
      let result: { records: MediaItem[]; total: number; page: number; totalPages: number };

      if (source === 'selfMedia') {
        result = await doSearch('/channel/self-media', 'selfMedia', keyword.trim(), headers, current, size);
      } else if (source === 'all') {
        result = await doSearchBoth(keyword.trim(), headers, current, size);
      } else {
        result = await doSearch('/channel/media', 'media', keyword.trim(), headers, current, size);
      }

      console.log(`[鹿推推搜索] 找到 ${result.records.length} 条 / 共 ${result.total}`);

      return res.status(200).json({
        success: true,
        data: {
          records: result.records,
          total: result.total,
          current: result.page,
          pages: result.totalPages,
          isSearchResult: true,
        },
      });
    }

    // 无关键词 → 浏览模式，使用 mediaList/selfMediaList（返回价格）
    const listResult = source === 'selfMedia'
      ? await fetchListPage('/media/selfMediaList', 'selfMedia', current, headers)
      : await fetchListPage('/media/mediaList', 'media', current, headers);

    return res.status(200).json({
      success: true,
      data: {
        records: listResult.records,
        total: listResult.total,
        current,
        pages: listResult.pages,
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
