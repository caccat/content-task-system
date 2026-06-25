import type { VercelRequest, VercelResponse } from '@vercel/node';

// 鹿推推 API 配置
const LUTUITUI_PRODUCTION = 'https://ai.lutuitui.com/api/api';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { current = 1, size = 50 } = req.body || {};

    const appId = process.env.LUTUITUI_APP_ID;
    const apiKey = process.env.LUTUITUI_API_KEY;

    if (!appId || !apiKey) {
      return res.status(500).json({ error: '服务端未配置鹿推推凭证' });
    }

    const timestamp = Math.floor(Date.now() / 1000);

    const response = await fetch(`${LUTUITUI_PRODUCTION}/media/selfMediaList`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'x-api-key': apiKey,
        'timestamp': String(timestamp),
      },
      body: JSON.stringify({
        current,
        size: Math.min(size, 50),
      }),
    });

    const result = await response.json();

    if (result.code === '200') {
      return res.status(200).json({
        success: true,
        data: {
          records: result.content.records || [],
          total: result.content.total || 0,
          current: result.content.current || 1,
          pages: result.content.pages || 0,
        },
      });
    }

    return res.status(200).json({
      success: false,
      error: result.desc || '查询失败',
    });

  } catch (error: any) {
    console.error('[鹿推推媒体搜索] 请求失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '网络请求失败',
    });
  }
}
