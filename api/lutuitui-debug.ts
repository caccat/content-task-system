import type { VercelRequest, VercelResponse } from '@vercel/node';

const API = 'https://ai.lutuitui.com/api/api';

// 依次尝试不同参数名，看哪个生效（生效 = total 显著变小）
async function tryParam(headers: Record<string, string>, paramName: string) {
  const body: any = { page: 1, perPage: 5 };
  body[paramName] = '中国教育在线';
  const resp = await fetch(`${API}/media/mediaList`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  const records = data?.content?.records || [];
  return { paramName, total: data?.content?.total, firstRecord: records[0]?.name || '', count: records.length };
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

  // 先看无参数的总数
  const baseResp = await fetch(`${API}/media/mediaList`, {
    method: 'POST', headers,
    body: JSON.stringify({ page: 1, perPage: 5 }),
  });
  const baseData = await baseResp.json();
  const baseTotal = baseData?.content?.total || 0;

  // 试各种参数名
  const params = ['name', 'keyword', 'search', 'mediaName', 'title', 'q', 'filter', 'query', 'channelName', 'portalName'];
  const results = [{ paramName: '(无参数)', total: baseTotal, firstRecord: baseData?.content?.records?.[0]?.name || '' }];

  for (const p of params) {
    try {
      results.push(await tryParam(headers, p));
    } catch (e: any) {
      results.push({ paramName: p, total: -1, firstRecord: e.message });
    }
  }

  // 再搜 selfMedia
  const selfBase = await fetch(`${API}/media/selfMediaList`, {
    method: 'POST', headers,
    body: JSON.stringify({ current: 1, size: 5 }),
  });
  const selfData = await selfBase.json();
  const selfResults = [{ paramName: '(无参数)', total: selfData?.content?.total || 0 }];
  for (const p of params) {
    try {
      const body: any = { current: 1, size: 5 };
      body[p] = '中国教育在线';
      const resp = await fetch(`${API}/media/selfMediaList`, {
        method: 'POST', headers,
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      selfResults.push({ paramName: p, total: data?.content?.total || 0 });
    } catch (e: any) {
      selfResults.push({ paramName: p, total: -1, firstRecord: e.message });
    }
  }

  return res.status(200).json({
    success: true,
    baseTotal,
    baseTotalSelf: selfData?.content?.total || 0,
    mediaList: results,
    selfMediaList: selfResults,
  });
}
