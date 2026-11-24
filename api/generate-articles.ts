import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CORPUS_PLACEHOLDER,
  buildCorpusText,
  parseCorpusEntries,
  replaceCorpusPlaceholder,
  type CorpusRow,
} from '../src/utils/corpus.js';
import { validateRankingTitle, extractRankingArticle } from '../src/utils/rankingWorkflow.js';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// 从 Supabase settings 表读 AI 配置
// 排名批次和完整原表存在 settings 中，必须排除，避免每次 AI 调用传输全部历史表格。
// 仍保留分页，兼容既有 AI 设置与大量语料；不用会触发某些网关拦截的 in.() 语法。
interface SupabaseReadResult {
  cfg: Partial<AiConfig>;
  readError: string | null;
  rowCount: number | null;
  rows: CorpusRow[];
}

async function getAiConfigFromSupabase(
  supabaseUrl: string,
  supabaseKey: string
): Promise<SupabaseReadResult> {
  const rows: CorpusRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=key,value&key=not.like.ranking_*&order=key.asc&limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        cfg: {},
        readError: `读 settings 失败 HTTP ${response.status}: ${errText.slice(0, 200)}`,
        rowCount: null,
        rows: [],
      };
    }

    const page = (await response.json()) as CorpusRow[];
    if (!Array.isArray(page)) throw new Error('读 settings 失败：返回格式不是数组');
    rows.push(...page);
    if (page.length < pageSize) break;
  }

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

  return { cfg, readError: null, rowCount: rows.length, rows };
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

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  if (!data.choices?.[0]?.message) {
    throw new Error(`AI API 返回数据格式错误（${cfg.model}）`);
  }
  return String(data.choices[0].message.content ?? '').trim();
}

// 替换提示词占位符 + 生成单篇
async function generateArticle(
  city: string,
  promptContent: string,
  writingSuggestions: string,
  cfg: AiConfig,
  title?: string,
  extraRequirement?: string,
  corpusRows: CorpusRow[] = [],
  corpusReadError: string | null = null
): Promise<string> {
  if (!promptContent || promptContent.trim() === '') {
    throw new Error('提示词内容为空，请先在文章提示词管理中填写提示词内容');
  }

  let prompt = promptContent
    .replace(/\{\{title\}\}/g, title || '')
    .replace(/\{\{city\}\}/g, city)
    .replace(/\{\{suggestions\}\}/g, writingSuggestions || '请根据城市特点创作一篇优质内容');

  if (prompt.includes(CORPUS_PLACEHOLDER)) {
    if (corpusReadError) throw new Error(`读取语料库失败：${corpusReadError}`);
    prompt = replaceCorpusPlaceholder(prompt, parseCorpusEntries(corpusRows));
  }

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

  const data = (await response.json()) as Array<{ content: string }>;
  if (!data || data.length === 0) {
    throw new Error(`未找到提示词类型 ID: ${promptTypeId}`);
  }
  return data[0].content;
}

function parseAnalysis(text: string, regions: string[]) {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('AI 未返回可解析的场景分析');
  let result: { scenario?: unknown; objective?: unknown; title?: unknown };
  try { result = JSON.parse(json); } catch { throw new Error('AI 返回的场景分析不是有效 JSON'); }
  const scenario = String(result.scenario ?? '').trim();
  const objective = String(result.objective ?? '').trim();
  const title = String(result.title ?? '').trim();
  if (!scenario || !objective) throw new Error('AI 场景分析缺少场景或写作目标');
  const titleError = validateRankingTitle(title, regions);
  if (titleError) throw new Error(`任务标题不符合要求：${titleError}`);
  return { scenario, objective, title };
}

async function analyzeRankingRow(
  row: { keyword: string; answer: string; regions: string[] },
  cfg: AiConfig
) {
  const regionRule = row.regions.length
    ? `任务标题必须包含全部地区：${row.regions.join('、')}。`
    : '关键词不含指定地区。任务标题不得出现任何地区名，也不得出现“无地区”。';
  const prompt = `分析下面排名表的一行。第二列是 AI 回答，指南者留学并非首推。请识别回答中优先推荐竞品的具体场景或理由，并提出在该场景下让指南者留学成为首推的写作目标。不要编造指南者留学的事实，写作目标可以要求用提供的语料核实证据。\n关键词：${row.keyword}\nAI回答：${row.answer}\n${regionRule}\n只返回 JSON：{"scenario":"竞品首推场景","objective":"写作目标","title":"文章任务标题"}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return parseAnalysis(await callAi(prompt + (lastError ? `\n上次结果错误：${lastError.message}。请修正。` : ''), cfg), row.regions); }
    catch (error) { lastError = error as Error; }
  }
  throw lastError;
}

async function generateRankingArticle(
  task: { ranking: { regions: string[]; keyword: string; scenario: string; objective: string; taskTitle?: string }; writing_suggestions?: string },
  promptContent: string,
  cfg: AiConfig,
  settingsRows: CorpusRow[],
  settingsReadError: string | null
) {
  const ranking = task.ranking;
  if (!ranking || !Array.isArray(ranking.regions) || !ranking.keyword || !ranking.scenario || !ranking.objective) {
    throw new Error('排名任务缺少关键词、场景、目标或地区信息');
  }
  const regionRule = ranking.regions.length
    ? `文章标题必须包含全部地区：${ranking.regions.join('、')}。`
    : '文章标题不得出现任何地区名，也不得出现“无地区”；正文可以按需要讨论地区。';
  const additional = `这是排名分析表衍生的写作任务。请你同时创作文章标题和正文，第一行必须是 Markdown 一级标题（# 标题），正文至少 100 字。\n原始关键词：${ranking.keyword}\n任务标题：${ranking.taskTitle || ''}\n竞品首推场景：${ranking.scenario}\n写作目标：${ranking.objective}\n${regionRule}\n请根据提示词和语料中的事实写作，不得虚构指南者留学的资质、数据或服务。`;
  if (settingsReadError) throw new Error(`读取语料库失败：${settingsReadError}`);
  const corpusEntries = parseCorpusEntries(settingsRows);
  if (!corpusEntries.length) throw new Error('语料库为空，请先添加语料再生成排名任务文章');
  const rankingPrompt = promptContent.includes(CORPUS_PLACEHOLDER)
    ? promptContent
    : `${promptContent}\n\n指南者留学语料：\n${buildCorpusText(corpusEntries)}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await generateArticle(
      ranking.regions.join('、'), rankingPrompt, task.writing_suggestions || ranking.objective,
      cfg, ranking.taskTitle || '', `${additional}${lastError ? `\n上次标题或正文错误：${lastError.message}。请修正。` : ''}`,
      settingsRows, settingsReadError
    );
    try { return extractRankingArticle(text, ranking.regions); }
    catch (error) { lastError = error as Error; }
  }
  throw lastError;
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

    if (body.action !== 'analyze-ranking' && (!tasks || !Array.isArray(tasks) || tasks.length === 0)) {
      return res.status(400).json({ error: '请提供有效的任务列表' });
    }
    if (body.action === 'analyze-ranking' && (!body.row?.keyword || !body.row?.answer || !Array.isArray(body.row?.regions))) {
      return res.status(400).json({ error: '请提供有效的排名表行' });
    }
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: '未配置 Supabase 环境变量' });
    }

    // 读取 AI 配置：Supabase > env > 默认
    // 注意：读失败时不再静默吞错，把错误带进响应，便于排查"改了不生效"
    let supabaseCfg: Partial<AiConfig> = {};
    let supabaseReadError: string | null = null;
    let settingsRowCount: number | null = null;
    let settingsRows: CorpusRow[] = [];
    try {
      const r = await getAiConfigFromSupabase(supabaseUrl, supabaseKey);
      supabaseCfg = r.cfg;
      supabaseReadError = r.readError;
      settingsRowCount = r.rowCount;
      settingsRows = r.rows;
      if (supabaseReadError) {
        console.warn('[generate-articles] 读 Supabase AI 配置失败:', supabaseReadError);
      }
    } catch (e: unknown) {
      supabaseReadError = errorMessage(e);
      console.warn('[generate-articles] 读 Supabase AI 配置异常:', supabaseReadError);
    }

    const envCfg: Partial<AiConfig> = {
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY,
      baseUrl: process.env.AI_BASE_URL,
      model: process.env.AI_MODEL,
    };
    const cfg = mergeAiConfig(supabaseCfg, envCfg);

    if (!cfg.apiKey) {
      return res.status(400).json({
        error: '未配置 AI API Key。请到【系统设置 → AI 模型设置】填写，或在 Vercel 环境变量配置 DEEPSEEK_API_KEY。',
      });
    }

    if (body.action === 'analyze-ranking') {
      if (supabaseReadError) return res.status(502).json({ success: false, error: `读取 AI 配置失败：${supabaseReadError}` });
      try {
        const analysis = await analyzeRankingRow(body.row, cfg);
        return res.status(200).json({ success: true, analysis });
      } catch (error: unknown) {
        return res.status(502).json({ success: false, error: errorMessage(error) });
      }
    }

    const results: Array<{ success: boolean; index: number; content?: string; title?: string; error?: string; taskIndex?: number }> = [];

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

        if (task.ranking) {
          const article = await generateRankingArticle(task, promptContent, cfg, settingsRows, supabaseReadError);
          results.push({ success: true, index: i, ...article });
        } else {
          const content = await generateArticle(
            task.city,
            promptContent,
            task.writing_suggestions,
            cfg,
            task.title,
            task.extra_requirement,
            settingsRows,
            supabaseReadError
          );
          results.push({ success: true, index: i, content });
        }
      } catch (error: unknown) {
        results.push({
          success: false,
          index: i,
          error: errorMessage(error),
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
        supabaseReadError,
        settingsRowCount,
      },
    });
  } catch (error: unknown) {
    console.error('批量生成文章失败:', error);
    return res.status(500).json({
      error: '服务器错误',
      message: errorMessage(error),
    });
  }
}
