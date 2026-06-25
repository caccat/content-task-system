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

  const foundMedia: any[] = [];
  const foundRongmei: any[] = [];

  // 搜 mediaList 第1-263页，找"融媒"
  for (let batch = 1; batch <= 260; batch += 20) {
    const pages = Array.from({ length: 20 }, (_, i) => batch + i).filter(p => p <= 263);
    const settled = await Promise.allSettled(pages.map(p => fetchPage(p)));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        for (const rec of r.value) {
          if (rec.name.includes('中原融媒')) foundMedia.push(rec);
          if (rec.name.includes('融媒')) foundRongmei.push({ id: rec.id, name: rec.name, price: rec.price });
        }
      }
    }
  }

  return res.status(200).json({ 
    success: true, 
    foundZhongyuan: foundMedia, 
    allRongmei: foundRongmei.slice(0, 30),
    rongmeiCount: foundRongmei.length,
  });
}
