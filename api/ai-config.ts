import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// AI 配置诊断端点
// 浏览器直接访问 GET /api/ai-config 即可看到"后端实际读到了什么"
// 用于排查【系统设置保存了 AI 配置，但生成时仍走 DeepSeek】这类问题
// 敏感值（api_key / system_prompt）打码，只暴露长度和首尾
// ============================================================================

function hostOf(u: string | undefined): string {
  if (!u) return '';
  try { return new URL(u).host; } catch { return '(无法解析)'; }
}

function mask(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (v.length <= 8) return `*** (len=${v.length})`;
  return `${v.slice(0, 4)}***${v.slice(-4)} (len=${v.length})`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const out: any = {
    now: new Date().toISOString(),
    env: {
      has_SUPABASE_URL: !!process.env.SUPABASE_URL,
      has_VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
      has_SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      has_VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      has_DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
      has_VITE_DEEPSEEK_API_KEY: !!process.env.VITE_DEEPSEEK_API_KEY,
      has_AI_BASE_URL: !!process.env.AI_BASE_URL,
      has_AI_MODEL: !!process.env.AI_MODEL,
    },
    resolved: {
      supabaseHost: hostOf(supabaseUrl),
      supabaseUrlFrom: process.env.SUPABASE_URL ? 'SUPABASE_URL' : (process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : '(无)'),
      supabaseKeyFrom: process.env.SUPABASE_ANON_KEY ? 'SUPABASE_ANON_KEY' : (process.env.VITE_SUPABASE_ANON_KEY ? 'VITE_SUPABASE_ANON_KEY' : '(无)'),
    },
  };

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({
      ...out,
      error: '后端未解析到 Supabase 环境变量，无法读取 settings 表',
    });
  }

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/settings?select=key,value&limit=1000`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    out.settings = { httpStatus: r.status };

    if (!r.ok) {
      out.settings.readError = (await r.text().catch(() => '')).slice(0, 300);
    } else {
      const rows = (await r.json()) as Array<{ key: string; value: string | null }>;
      const get = (k: string) => rows.find((x) => x.key === k)?.value ?? null;

      out.settings.rowCount = rows.length;
      out.settings.allKeys = rows.map((x) => x.key).sort();
      out.settings.ai = {
        ai_provider: get('ai_provider'),
        ai_base_url: get('ai_base_url'),
        ai_model: get('ai_model'),
        ai_temperature: get('ai_temperature'),
        ai_max_tokens: get('ai_max_tokens'),
        ai_api_key: mask(get('ai_api_key')),
        ai_system_prompt: mask(get('ai_system_prompt')),
      };

      // 最终结论：后端实际会用哪套配置
      const hasSupabaseKey = !!get('ai_api_key');
      const hasEnvKey = !!(process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY);
      out.effective = hasSupabaseKey
        ? {
            source: 'supabase',
            model: get('ai_model') || 'deepseek-chat (默认，因 ai_model 未设置)',
            baseUrlHost: hostOf(get('ai_base_url') || undefined) || 'api.deepseek.com (默认，因 ai_base_url 未设置)',
            note: '✅ 会用 Supabase 里保存的配置',
          }
        : hasEnvKey
          ? {
              source: 'env',
              model: process.env.AI_MODEL || 'deepseek-chat',
              baseUrlHost: hostOf(process.env.AI_BASE_URL) || 'api.deepseek.com (内置默认)',
              note: '⚠️ Supabase 里没找到 ai_api_key，正在回退到环境变量 DEEPSEEK_API_KEY —— 这就是"还是 DeepSeek"的原因',
            }
          : {
              source: 'none',
              model: '-',
              baseUrlHost: '-',
              note: '❌ Supabase 和环境变量都没有 AI Key，生成会直接报错',
            };
    }
  } catch (e: any) {
    out.settings = { ...(out.settings || {}), readError: e?.message || String(e) };
  }

  return res.status(200).json(out);
}
