import type { VercelRequest, VercelResponse } from '@vercel/node';

const API = 'https://ai.lutuitui.com/api/api';

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

  async function fetchMediaPage(page: number) {
    const resp = await fetch(`${API}/media/mediaList`, {
      method: 'POST', headers,
      body: JSON.stringify({ page, perPage: 200 }),
    });
    const data = await resp.json();
    return (data.content?.records || []).map((r: any) => ({
      id: r.id, name: r.name, portal: r.portalName || '', region: r.regionName || '', price: r.costPrice,
    }));
  }

  async function fetchSelfPage(page: number) {
    const resp = await fetch(`${API}/media/selfMediaList`, {
      method: 'POST', headers,
      body: JSON.stringify({ current: page, size: 200 }),
    });
    const data = await resp.json();
    return (data.content?.records || []).map((r: any) => ({
      id: r.id, name: r.name, region: r.regionName || '', price: r.costPrice,
    }));
  }

  const foundMedia: any[] = [];
  const foundSelf: any[] = [];

  // 搜 mediaList 61-200 页
  for (let batch = 61; batch <= 200; batch += 20) {
    const pages = Array.from({ length: 20 }, (_, i) => batch + i).filter(p => p <= 263);
    const settled = await Promise.allSettled(pages.map(p => fetchMediaPage(p)));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        for (const rec of r.value) {
          if (rec.name.includes('中原')) foundMedia.push(rec);
        }
      }
    }
    if (foundMedia.length > 0) break;
  }

  // 搜 selfMediaList 1-20 页
  for (let batch = 1; batch <= 20; batch += 10) {
    const pages = Array.from({ length: 10 }, (_, i) => batch + i).filter(p => p <= 372);
    const settled = await Promise.allSettled(pages.map(p => fetchSelfPage(p)));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        for (const rec of r.value) {
          if (rec.name.includes('中原')) foundSelf.push(rec);
        }
      }
    }
    if (foundSelf.length > 0) break;
  }

  return res.status(200).json({ success: true, foundMedia, foundSelf });
}
