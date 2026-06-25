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

  async function fetchPage(page: number) {
    const resp = await fetch(`${API}/media/mediaList`, {
      method: 'POST', headers,
      body: JSON.stringify({ page, perPage: 200 }),
    });
    const data = await resp.json();
    return (data.content?.records || []).map((r: any) => ({
      id: r.id, name: r.name, portal: r.portalName || '', region: r.regionName || '', price: r.costPrice,
    }));
  }

  // 搜 "中原融媒" —— 页面 6-60，每批10页
  const found: any[] = [];
  for (let batch = 6; batch <= 60; batch += 10) {
    const pages = Array.from({ length: 10 }, (_, i) => batch + i);
    const settled = await Promise.allSettled(pages.map(p => fetchPage(p)));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        for (const rec of r.value) {
          if (rec.name.includes('中原融媒')) {
            found.push(rec);
          }
        }
      }
    }
    if (found.length > 0) break; // 找到就停
  }

  return res.status(200).json({ success: true, found, searchedPages: '6-60' });
}
