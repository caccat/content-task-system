import type { VercelRequest, VercelResponse } from '@vercel/node';

// 鹿推推 API 配置（文档：https://ai.lutuitui.com/api）
const LUTUITUI_PRODUCTION = 'https://ai.lutuitui.com/api';

/** mediaSource: 'media' 调 createMediaOrder，'selfMedia' 调 createSelfMediaOrder */
function getOrderEndpoint(source: string): string {
  return source === 'media'
    ? `${LUTUITUI_PRODUCTION}/order/createMediaOrder`
    : `${LUTUITUI_PRODUCTION}/order/createSelfMediaOrder`;
}

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
    const { title, content, mediaId, outOrderNo, mediaSource } = req.body || {};

    if (!title || !content) {
      return res.status(400).json({ error: '缺少必填参数: title, content' });
    }

    // 从环境变量读取凭证
    const appId = process.env.LUTUITUI_APP_ID;
    const apiKey = process.env.LUTUITUI_API_KEY;
    // mediaId 优先用请求传入的，其次用环境变量默认值
    const finalMediaId = mediaId || process.env.LUTUITUI_MEDIA_ID;

    if (!appId || !apiKey) {
      return res.status(500).json({ error: '服务端未配置鹿推推凭证 (LUTUITUI_APP_ID / LUTUITUI_API_KEY)' });
    }

    if (!finalMediaId) {
      return res.status(400).json({ error: '未配置 mediaId，请在请求中传入或设置环境变量 LUTUITUI_MEDIA_ID' });
    }

    const endpoint = getOrderEndpoint(mediaSource || 'media');
    const timestamp = Math.floor(Date.now() / 1000);

    console.log('[鹿推推] 正在创建订单...', {
      endpoint,
      title: title.substring(0, 30),
      mediaId: finalMediaId,
      mediaSource: mediaSource || 'media',
      outOrderNo,
      contentLength: content.length,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId,
        'x-api-key': apiKey,
        'timestamp': String(timestamp),
      },
      body: JSON.stringify({
        title,
        content,
        mediaId: Number(finalMediaId),
        outOrderNo: outOrderNo || '',
      }),
    });

    const result = await response.json();
    console.log('[鹿推推] 响应:', result);

    if (result.code === '200') {
      return res.status(200).json({ success: true, data: result });
    }

    // 业务错误（如 mediaId 不存在）
    return res.status(200).json({
      success: false,
      error: result.desc || result.message || '未知错误',
      code: result.code,
    });

  } catch (error: any) {
    console.error('[鹿推推] 请求失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '网络请求失败',
    });
  }
}
