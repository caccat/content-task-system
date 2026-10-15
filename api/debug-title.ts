import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================================
// 标题链路诊断端点
// 浏览器直接访问 GET /api/debug-title 即可看到：
//   1. tasks 表里 user_title（用户填的标题）到底有没有存进去
//   2. 文章正文（content_head）的开头 / H1 是什么
//   3. prompts 表里的提示词模板里有没有 {{title}} 占位符
//
// 可选参数：
//   ?task_id=xxx   只看指定任务
//   ?limit=20      看最近 N 个任务（默认 10）
//
// 只读，不写任何数据
// ============================================================================

function extractTitle(content: string): string {
  if (!content) return '(空)';
  const h1 = content.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();
  const p = content.match(/<p[^>]*>(.*?)<\/p>/is);
  if (p) return p[1].replace(/<[^>]+>/g, '').trim().slice(0, 60);
  return '(正文里没有 h1/p)';
}

function looksLikeDefaultTitle(t: string | null | undefined): boolean {
  if (!t) return false;
  return /相关文章$/.test(t.trim());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ error: '未解析到 Supabase 环境变量' });
  }

  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : '';
  const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 50);

  const out: any = { now: new Date().toISOString(), limit, task_id: taskId || null };

  try {
    // ---------- 1. tasks ----------
    const taskUrl = taskId
      ? `${supabaseUrl}/rest/v1/tasks?select=id,city,prompt_type,user_title,extra_requirement,ai_status,generation_mode,updated_at&id=eq.${encodeURIComponent(taskId)}`
      : `${supabaseUrl}/rest/v1/tasks?select=id,city,prompt_type,user_title,extra_requirement,ai_status,generation_mode,updated_at&order=updated_at.desc&limit=${limit}`;

    const tRes = await fetch(taskUrl, { headers });
    out.tasks = { httpStatus: tRes.status };
    if (!tRes.ok) {
      out.tasks.readError = (await tRes.text().catch(() => '')).slice(0, 300);
      return res.status(200).json(out);
    }

    const tasks = (await tRes.json()) as any[];
    const ids = tasks.map((t) => t.id);

    // ---------- 2. articles ----------
    let articles: any[] = [];
    if (ids.length > 0) {
      const aRes = await fetch(
        `${supabaseUrl}/rest/v1/articles?select=id,task_id,status,content_head&task_id=in.(${ids.join(',')})`,
        { headers }
      );
      out.articles = { httpStatus: aRes.status };
      if (aRes.ok) {
        articles = (await aRes.json()) as any[];
      } else {
        out.articles.readError = (await aRes.text().catch(() => '')).slice(0, 300);
      }
    }

    // ---------- 3. prompts ----------
    const pRes = await fetch(`${supabaseUrl}/rest/v1/prompts?select=id,type,content`, { headers });
    out.prompts = { httpStatus: pRes.status };
    const prompts: any[] = pRes.ok ? ((await pRes.json()) as any[]) : [];
    if (!pRes.ok) {
      out.prompts.readError = (await pRes.text().catch(() => '')).slice(0, 300);
    }

    const promptById: Record<string, any> = {};
    for (const p of prompts) promptById[String(p.id)] = p;

    // ---------- 4. 组装结论 ----------
    out.promptTemplates = prompts.map((p) => ({
      id: p.id,
      type: p.type,
      has_title_placeholder: /\{\{title\}\}/.test(String(p.content || '')),
      has_city_placeholder: /\{\{city\}\}/.test(String(p.content || '')),
      has_suggestions_placeholder: /\{\{suggestions\}\}/.test(String(p.content || '')),
      content_head: String(p.content || '').slice(0, 600),
    }));

    out.rows = tasks.map((t) => {
      const arts = articles.filter((a) => a.task_id === t.id);
      const prompt = promptById[String(t.prompt_type)];
      const a0 = arts[0];
      const head = String(a0?.content_head || '');
      return {
        task_id: t.id,
        city: t.city,
        ai_status: t.ai_status,
        generation_mode: t.generation_mode,
        user_title_in_db: t.user_title,
        user_title_is_default: looksLikeDefaultTitle(t.user_title),
        extra_requirement_in_db: t.extra_requirement ? String(t.extra_requirement).slice(0, 120) : null,
        prompt_type: t.prompt_type,
        prompt_has_title_placeholder: prompt ? /\{\{title\}\}/.test(String(prompt.content || '')) : null,
        article_count: arts.length,
        article_status: a0?.status ?? null,
        article_h1_or_first_line: extractTitle(head),
        article_head_120: head.slice(0, 120),
        updated_at: t.updated_at,
      };
    });

    out.summary = {
      tasks_total: tasks.length,
      user_title_empty_count: tasks.filter((t) => !t.user_title).length,
      user_title_default_count: tasks.filter((t) => looksLikeDefaultTitle(t.user_title)).length,
      h1_is_default_count: out.rows.filter((r: any) => looksLikeDefaultTitle(r.article_h1_or_first_line)).length,
    };
  } catch (e: any) {
    out.error = e?.message || String(e);
  }

  return res.status(200).json(out);
}
