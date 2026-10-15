import type { VercelRequest, VercelResponse } from '@vercel/node';

// 测活端点：发一个 10 token 的极小请求验证 baseUrl + apiKey + model 是否可用
// 用于【系统设置 → AI 模型设置】的"测试连接"按钮

interface TestAiBody {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: '只支持 POST 请求' });

  const { baseUrl, apiKey, model } = (req.body || {}) as TestAiBody;

  if (!baseUrl || !apiKey || !model) {
    return res.status(200).json({ ok: false, message: 'baseUrl / apiKey / model 都必填' });
  }

  // 基础 URL 校验
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return res.status(200).json({ ok: false, message: `Base URL 格式错误：${baseUrl}` });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return res.status(200).json({ ok: false, message: `Base URL 协议必须是 http/https：${url.protocol}` });
  }

  const start = Date.now();
  let ac: AbortController | null = null;
  const timeoutId = setTimeout(() => { ac?.abort(); }, 15000);

  try {
    ac = new AbortController();
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '说"ok"' }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: ac.signal,
    });

    const elapsed = Date.now() - start;
    const text = await response.text();

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        status: response.status,
        elapsedMs: elapsed,
        host: url.host,
        message: `HTTP ${response.status}：${text.slice(0, 400)}`,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(200).json({
        ok: false,
        elapsedMs: elapsed,
        host: url.host,
        message: '返回的不是合法 JSON（可能不是 OpenAI 兼容端点）',
      });
    }

    const reply = parsed?.choices?.[0]?.message?.content;
    if (reply == null) {
      return res.status(200).json({
        ok: false,
        elapsedMs: elapsed,
        host: url.host,
        message: '返回 JSON 缺少 choices[0].message.content（不是标准 chat/completions 格式）',
      });
    }

    return res.status(200).json({
      ok: true,
      status: response.status,
      elapsedMs: elapsed,
      host: url.host,
      model,
      reply: String(reply).slice(0, 100),
    });
  } catch (error: any) {
    const elapsed = Date.now() - start;
    let message = error?.message || '请求失败';
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      message = `连接超时（${elapsed}ms），请检查网络或 Base URL`;
    } else if (error?.cause?.code) {
      message = `${message} (${error.cause.code})`;
    }
    return res.status(200).json({
      ok: false,
      elapsedMs: elapsed,
      host: url.host,
      message,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
