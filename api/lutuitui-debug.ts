import type { VercelRequest, VercelResponse } from '@vercel/node';

const API = 'https://ai.lutuitui.com/api/api';

// 目标媒体特征（名称+价格）用于精确匹配
const TARGETS = [
  { name: '中国教育在线', price: 130 },
  { name: '挖贝网', keyword: 'GEO排名可发' },
  { name: '濮阳市广播电视台', keyword: '官方腾讯号' },
  { name: '邢台网', keyword: '' },
  { name: '博客园', keyword: 'GEO排名可发' },
  { name: '中原融媒', keyword: 'GEO排名可发' },
  { name: '商丘新闻网', keyword: 'GEO排名可发' },
  { name: '指尖视界', keyword: '百家号' },
];

interface MediaRecord {
  id: number; name: string; portalName?: string; channelTypeName?: string;
  regionName?: string; costPrice?: number;
}

async function fetchMediaPage(headers: Record<string, string>, page: number) {
  const resp = await fetch(`${API}/media/mediaList`, {
    method: 'POST', headers,
    body: JSON.stringify({ page, perPage: 200 }),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  return {
    records: (data.content.records || []).map((r: any): MediaRecord => ({
      id: r.id, name: r.name,
      portalName: r.portalName,
      channelTypeName: r.channelTypeName,
      regionName: r.regionName,
      costPrice: r.costPrice,
    })),
    total: data.content.total,
    pages: data.content.pages,
  };
}

async function fetchSelfPage(headers: Record<string, string>, page: number) {
  const resp = await fetch(`${API}/media/selfMediaList`, {
    method: 'POST', headers,
    body: JSON.stringify({ current: page, size: 200 }),
  });
  const data = await resp.json();
  if (data.code !== '200') throw new Error(data.desc || '查询失败');
  return {
    records: (data.content.records || []).map((r: any): MediaRecord => ({
      id: r.id, name: r.name,
      regionName: r.regionName,
      costPrice: r.costPrice,
    })),
    total: data.content.total,
    pages: data.content.pages,
  };
}

function matchTarget(record: MediaRecord, target: typeof TARGETS[0]): boolean {
  const rname = record.name || '';
  const tname = target.name.toLowerCase();
  if (!rname.toLowerCase().includes(tname)) return false;
  if (target.keyword && !rname.includes(target.keyword)) return false;
  if (target.price && record.costPrice !== target.price) return false;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  const appId = process.env.LUTUITUI_APP_ID;
  const apiKey = process.env.LUTUITUI_API_KEY;
  if (!appId || !apiKey) return res.status(500).json({ error: '未配置凭证' });

  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    'Content-Type': 'application/json',
    'x-app-id': appId,
    'x-api-key': apiKey,
    timestamp: String(timestamp),
    'device-type': 'pc',
  };

  const result: any = {};

  try {
    // 1. 搜 mediaList - 只搜前面几页，同时采样中间页看ID范围
    const first = await fetchMediaPage(headers, 1);
    const info = {
      total: first.total,
      pages: first.pages,
      page1_first: first.records[0]?.name,
      page1_last: first.records[first.records.length - 1]?.name,
      page1_minId: first.records[0]?.id,
      page1_maxId: first.records[first.records.length - 1]?.id,
    };

    // 采样中间几页
    const midPage = Math.floor(first.pages / 2);
    const mid = await fetchMediaPage(headers, midPage);
    const lastPage = await fetchMediaPage(headers, first.pages);

    result.mediaList = {
      info,
      midPage: { page: midPage, first_name: mid.records[0]?.name, first_id: mid.records[0]?.id },
      lastPage: { page: first.pages, first_name: lastPage.records[0]?.name, first_id: lastPage.records[0]?.id },
    };

    // 搜前5页找目标
    const found: any = {};
    for (let p = 1; p <= 5; p++) {
      const { records } = p === 1 ? { records: first.records } : await fetchMediaPage(headers, p);
      for (const rec of records) {
        for (const t of TARGETS) {
          if (matchTarget(rec, t)) {
            found[t.name] = { id: rec.id, name: rec.name, portal: rec.portalName, channel: rec.channelTypeName, region: rec.regionName, price: rec.costPrice, page: p };
          }
        }
      }
    }
    result.foundInMedia = found;
    result.remainingTargets = TARGETS.filter(t => !found[t.name]).map(t => t.name);

    // 2. 搜 selfMediaList - 前10页
    const selfFirst = await fetchSelfPage(headers, 1);
    const selfFound: any = {};
    for (let p = 1; p <= 10; p++) {
      const { records } = p === 1 ? { records: selfFirst.records } : await fetchSelfPage(headers, p);
      for (const rec of records) {
        for (const t of TARGETS) {
          if (matchTarget(rec, t)) {
            selfFound[t.name] = { id: rec.id, name: rec.name, region: rec.regionName, price: rec.costPrice, page: p };
          }
        }
      }
    }
    result.foundInSelf = selfFound;
    result.selfInfo = { total: selfFirst.total, pages: selfFirst.pages };

    return res.status(200).json({ success: true, ...result });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
