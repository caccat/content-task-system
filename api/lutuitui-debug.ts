import type { VercelRequest, VercelResponse } from '@vercel/node';

const API = 'https://ai.lutuitui.com/api/api';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  const { names } = req.body || {};
  if (!names || !Array.isArray(names)) {
    return res.status(400).json({ error: '请提供 names 数组' });
  }

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

  const results: Record<string, any> = {};

  for (const name of names) {
    try {
      // 搜 mediaList
      const resp = await fetch(`${API}/media/mediaList`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ page: 1, perPage: 200, keyword: name }),
      });
      const data = await resp.json();
      const records = data?.content?.records || [];

      // 搜 selfMediaList
      const resp2 = await fetch(`${API}/media/selfMediaList`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ current: 1, size: 20, keyword: name }),
      });
      const data2 = await resp2.json();
      const selfRecords = data2?.content?.records || [];

      results[name] = {
        media: records.map((r: any) => ({
          id: r.id,
          name: r.name,
          portalName: r.portalName,
          channelTypeName: r.channelTypeName,
          regionName: r.regionName,
          costPrice: r.costPrice,
          _allFields: Object.keys(r),
        })),
        selfMedia: selfRecords.map((r: any) => ({
          id: r.id,
          name: r.name,
          platformName: r.platformName,
          regionName: r.regionName,
          costPrice: r.costPrice,
          _allFields: Object.keys(r),
        })),
      };
    } catch (e: any) {
      results[name] = { error: e.message };
    }
  }

  return res.status(200).json({ success: true, results });
}
