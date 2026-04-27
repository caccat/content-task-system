import type { VercelRequest, VercelResponse } from '@vercel/node';

// 每日任务统计通知
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: '未配置 Supabase 环境变量' });
    }

    // 获取飞书 Webhook
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
    const feishuWebhook = webhookData?.[0]?.value;

    if (!feishuWebhook) {
      return res.status(400).json({ error: '未配置飞书 Webhook' });
    }

    // 检查是否启用了每日通知
    const notifyResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?key=eq.daily_notification_enabled&select=value`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const notifyData = await notifyResponse.json();
    const notifyEnabled = notifyData?.[0]?.value === 'true';

    if (!notifyEnabled) {
      return res.status(200).json({ message: '每日通知已禁用，跳过' });
    }

    // 获取通知时间设置
    const timeResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?key=eq.daily_notification_time&select=value`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const timeData = await timeResponse.json();
    const notifyTime = timeData?.[0]?.value || '17:30';

    // 获取当前日期时间
    const now = new Date();
    const formattedTime = notifyTime;

    // 查询待生成任务数（status = pending）
    const pendingResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?status=eq.pending&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const pendingTasks = await pendingResponse.json();
    const pendingCount = Array.isArray(pendingTasks) ? pendingTasks.length : 0;

    // 查询待发布任务数（查询 articles 表中 status = ready 的）
    const readyResponse = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.ready&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const readyArticles = await readyResponse.json();
    const readyCount = Array.isArray(readyArticles) ? readyArticles.length : 0;

    // 构建通知消息
    const message = `📊 每日任务统计

截止 ${formattedTime}，今日还有：
• 🖊️ ${pendingCount} 个任务未生成
• 📤 ${readyCount} 个待发布

---
来自内容任务系统`;

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

    return res.status(200).json({
      success: true,
      message: '每日通知发送成功',
      stats: {
        pendingCount,
        readyCount,
        notifyTime: formattedTime
      }
    });

  } catch (error: any) {
    console.error('每日通知发送失败:', error);
    return res.status(500).json({
      error: '发送失败',
      message: error.message || '未知错误'
    });
  }
}
