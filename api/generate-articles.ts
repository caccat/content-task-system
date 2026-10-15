import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// AI 配置：通用 OpenAI 兼容调用（DeepSeek / 豆包方舟 ARK / 自建 等都适用）
// 读取优先级：Supabase settings 表 > Vercel 环境变量 > 内置默认
// ============================================================================

const DEFAULT_AI_CONFIG = {
  baseUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 8000,
  systemPrompt: '你是一位专业、优秀的内容创作者，擅长撰写各种类型的优质文章。',
};

interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

// 从 Supabase settings 表读 AI 配置（一次性拿所有 key）
async function getAiConfigFromSupabase(
  supabaseUrl: string,
  supabaseKey: string
): Promise<Partial<AiConfig>> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/settings?key=in.(ai_api_key,ai_base_url,ai_model,ai_temperature,ai_max_tokens,ai_system_prompt)&select=key,value`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ key: string; value: string | null }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.value != null && r.value !== '') map[r.key] = r.value;
  }

  const cfg: Partial<AiConfig> = {};
  if (map.ai_api_key) cfg.apiKey = map.ai_api_key;
  if (map.ai_base_url) cfg.baseUrl = map.ai_base_url;
  if (map.ai_model) cfg.model = map.ai_model;
  if (map.ai_temperature) {
    const t = parseFloat(map.ai_temperature);
    if (!Number.isNaN(t)) cfg.temperature = t;
  }
  if (map.ai_max_tokens) {
    const n = parseInt(map.ai_max_tokens, 10);
    if (!Number.isNaN(n) && n > 0) cfg.maxTokens = n;
  }
  if (map.ai_system_prompt) cfg.systemPrompt = map.ai_system_prompt;
  return cfg;
}

// 合并：Supabase > env var > 默认
function mergeAiConfig(
  supabaseCfg: Partial<AiConfig>,
  envCfg: Partial<AiConfig>
): AiConfig {
  return {
    apiKey: supabaseCfg.apiKey || envCfg.apiKey || '',
    baseUrl: supabaseCfg.baseUrl || envCfg.baseUrl || DEFAULT_AI_CONFIG.baseUrl,
    model: supabaseCfg.model || envCfg.model || DEFAULT_AI_CONFIG.model,
    temperature: supabaseCfg.temperature ?? envCfg.temperature ?? DEFAULT_AI_CONFIG.temperature,
    maxTokens: supabaseCfg.maxTokens ?? envCfg.maxTokens ?? DEFAULT_AI_CONFIG.maxTokens,
    systemPrompt: supabaseCfg.systemPrompt || envCfg.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt,
  };
}

// 调用任意 OpenAI 兼容的 chat/completions 端点
async function callAi(prompt: string, cfg: AiConfig): Promise<string> {
  const response = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: cfg.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let host = cfg.baseUrl;
    try { host = new URL(cfg.baseUrl).host; } catch { /* ignore */ }
    throw new Error(`AI API 错误 (${cfg.model} @ ${host}): HTTP ${response.status} - ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as any;
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error(`AI API 返回数据格式错误（${cfg.model}）`);
  }
  return String(data.choices[0].message.content).trim();
}

// 替换提示词占位符 + 生成单篇
async function generateArticle(
  city: string,
  promptContent: string,
  writingSuggestions: string,
  cfg: AiConfig,
  title?: string,
  extraRequirement?: string
): Promise<string> {
  if (!promptContent || promptContent.trim() === '') {
    throw new Error('提示词内容为空，请先在文章提示词管理中填写提示词内容');
  }

  let prompt = promptContent
    .replace(/\{\{title\}\}/g, title || '')
    .replace(/\{\{city\}\}/g, city)
    .replace(/\{\{suggestions\}\}/g, writingSuggestions || '请根据城市特点创作一篇优质内容');

  if (extraRequirement && extraRequirement.trim()) {
    prompt = prompt.trim() + '\n\n额外要求：' + extraRequirement.trim();
  }

  return callAi(prompt, cfg);
}

// 从 Supabase 获取提示词内容
async function getPromptContent(
  promptTypeId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/prompts?id=eq.${promptTypeId}&select=content`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`获取提示词失败: ${response.status}`);
  }

  const data = (await response.json()) as any[];
  if (!data || data.length === 0) {
    throw new Error(`未找到提示词类型 ID: ${promptTypeId}`);
  }
  return data[0].content;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST 请求' });

  try {
    const body = req.body || {};
    const { tasks } = body;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: '请提供有效的任务列表' });
    }
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: '未配置 Supabase 环境变量' });
    }

    // 读取 AI 配置：Supabase > env > 默认
    const [supabaseCfg, envCfg] = await Promise.all([
      getAiConfigFromSupabase(supabaseUrl, supabaseKey).catch((e) => {
        console.warn('[generate-articles] 读 Supabase AI 配置失败，回退到 env/default:', e?.message);
        return {} as Partial<AiConfig>;
      }),
      Promise.resolve({
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY,
        baseUrl: process.env.AI_BASE_URL,
        model: process.env.AI_MODEL,
      } as Partial<AiConfig>),
    ]);
    const cfg = mergeAiConfig(supabaseCfg, envCfg);

    if (!cfg.apiKey) {
      return res.status(400).json({
        error: '未配置 AI API Key。请到【系统设置 → AI 模型设置】填写，或在 Vercel 环境变量配置 DEEPSEEK_API_KEY。',
      });
    }

    const results: any[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      try {
        const promptContent = await getPromptContent(task.prompt_type, supabaseUrl, supabaseKey);

        if (!promptContent || promptContent.trim() === '') {
          results.push({
            success: false,
            index: i,
            error: '提示词内容为空，请先在文章提示词管理中填写提示词内容',
            taskIndex: i + 1,
          });
          continue;
        }

        const content = await generateArticle(
          task.city,
          promptContent,
          task.writing_suggestions,
          cfg,
          task.title,
          task.extra_requirement
        );

        results.push({ success: true, index: i, content });
      } catch (error: any) {
        results.push({
          success: false,
          index: i,
          error: error.message || '生成失败',
          taskIndex: i + 1,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return res.status(200).json({
      success: failCount === 0,
      total: tasks.length,
      successCount,
      failCount,
      results,
      ai: {
        model: cfg.model,
        host: (() => { try { return new URL(cfg.baseUrl).host; } catch { return cfg.baseUrl; } })(),
        source: supabaseCfg.apiKey ? 'supabase' : (envCfg.apiKey ? 'env' : 'default'),
      },
    });
  } catch (error: any) {
    console.error('批量生成文章失败:', error);
    return res.status(500).json({
      error: '服务器错误',
      message: error.message || '未知错误',
    });
  }
}
