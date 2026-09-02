import type { VercelRequest, VercelResponse } from '@vercel/node';

// 发送飞书通知的 API
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
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
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: '未配置 Supabase 环境变量' });
    }

    // 获取飞书 Webhook（优先从环境变量读取，其次从数据库读取）
    let feishuWebhook = process.env.FEISHU_WEBHOOK;
    
    if (!feishuWebhook) {
      const webhookResponse = await fetch(
        `${supabaseUrl}/rest/v1/settings?key=eq.feishu_webhook&select=value`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
        }
      );
      const webhookData = await webhookResponse.json();
      feishuWebhook = webhookData?.[0]?.value;
    }

    if (!feishuWebhook) {
      return res.status(400).json({ error: '未配置飞书 Webhook' });
    }

    // 从请求体获取通知内容
    const { content, type, tasks } = req.body || {};

    let message: string;

    if (type === 'task_created' && Array.isArray(tasks) && tasks.length > 0) {
      // 任务批量创建成功通知：按城市汇总本批任务，只发一条群消息
      const cityOrder: string[] = [];
      const cityCount: Record<string, number> = {};
      const cityDeadlines: Record<string, Set<string>> = {};

      for (const t of tasks) {
        const c = (t.city || '未知') as string;
        if (!(c in cityCount)) {
          cityCount[c] = 0;
          cityDeadlines[c] = new Set<string>();
          cityOrder.push(c);
        }
        cityCount[c] += Number(t.quantity) || 1;
        if (t.deadline) cityDeadlines[c].add(String(t.deadline));
      }

      const totalCount = tasks.reduce((sum: number, t: any) => sum + (Number(t.quantity) || 1), 0);
      const cityLines = cityOrder.map((c) => `• ${c}：${cityCount[c]} 篇`);

      const allDeadlines = new Set<string>();
      Object.values(cityDeadlines).forEach((d) => d.forEach((x) => allDeadlines.add(x)));
      const deadlineText = Array.from(allDeadlines).sort().join('、');

      message = `📢 新任务已创建

${cityLines.join('\n')}

共 ${cityOrder.length} 个城市 / ${totalCount} 篇内容${deadlineText ? `\n截止日期：${deadlineText}` : ''}

请前往「内容生成者 → 未生成」开始生成内容。

---
来自内容任务系统`;
    } else {
      // 通用通知（如设置页的测试消息）：直接使用传入的 content 作为正文
      const body = content || '';
      message = `${body}${body ? '\n\n' : ''}---
来自内容任务系统`;
    }

    // 发送飞书通知
    const feishuResponse = await fetch(feishuWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: message }
      })
    });

    if (!feishuResponse.ok) {
      throw new Error(`飞书通知发送失败: ${feishuResponse.status}`);
    }

    return res.status(200).json({ success: true });

  } catch (error: any) {
    console.error('飞书通知发送失败:', error);
    return res.status(500).json({
      error: '发送失败',
      message: error.message || '未知错误'
    });
  }
}
