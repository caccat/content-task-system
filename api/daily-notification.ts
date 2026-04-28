import type { VercelRequest, VercelResponse } from '@vercel/node';

// 获取北京时间
function getBeijingTime(): { date: string; time: string } {
  const now = new Date();
  // 转换为北京时间 (UTC+8)
  const beijingOffset = 8 * 60; // 分钟
  const localOffset = now.getTimezoneOffset();
  const beijingTime = new Date(now.getTime() + (localOffset + beijingOffset) * 60 * 1000);
  
  const date = beijingTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = beijingTime.toTimeString().slice(0, 5); // HH:MM
  
  return { date, time };
}

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
    const notifyTime = timeData?.[0]?.value || '18:30';

    // 获取北京时间
    const { date: today, time: currentTime } = getBeijingTime();
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;

    // 查询待生成任务数（今天新增的 pending 任务 + 逾期的 pending 任务）
    // 1. 今天新增的 pending 任务
    const newPendingResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?status=eq.pending&created_at=gte.${todayStart}&created_at=lte.${todayEnd}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const newPendingTasks = await newPendingResponse.json();
    const newPendingCount = Array.isArray(newPendingTasks) ? newPendingTasks.length : 0;

    // 2. 逾期的 pending 任务（deadline < 今天 且 status = pending）
    const overduePendingResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?status=eq.pending&deadline=lt.${todayStart}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const overduePendingTasks = await overduePendingResponse.json();
    const overduePendingCount = Array.isArray(overduePendingTasks) ? overduePendingTasks.length : 0;

    const totalPendingCount = newPendingCount + overduePendingCount;

    // 查询待发布文章数（今天新增的 ready 文章 + 逾期的 ready 文章）
    // 1. 今天新增的 ready 文章
    const newReadyResponse = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.ready&created_at=gte.${todayStart}&created_at=lte.${todayEnd}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const newReadyArticles = await newReadyResponse.json();
    const newReadyCount = Array.isArray(newReadyArticles) ? newReadyArticles.length : 0;

    // 2. 逾期的 ready 文章（基于 article 的 created_at 超过一定时间的，暂用 created_at 判断）
    // 注意：这里需要关联 tasks 表的 deadline，但 articles 表没有 deadline 字段
    // 简化方案：只统计今天新增的 ready 文章，或者假设 deadline 沿用 tasks 表
    const overdueReadyResponse = await fetch(
      `${supabaseUrl}/rest/v1/articles?status=eq.ready&created_at=lt.${todayStart}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    const overdueReadyArticles = await overdueReadyResponse.json();
    const overdueReadyCount = Array.isArray(overdueReadyArticles) ? overdueReadyArticles.length : 0;

    const totalReadyCount = newReadyCount + overdueReadyCount;

    // 构建通知消息
    let detailText = '';
    if (overduePendingCount > 0 || overdueReadyCount > 0) {
      detailText = `\n其中逾期：${overduePendingCount} 个未生成，${overdueReadyCount} 个待发布`;
    }

    const message = `📊 每日任务统计

截止 ${currentTime}，今日新增：
• 🖊️ ${newPendingCount} 个任务未生成
• 📤 ${newReadyCount} 个待发布${detailText}

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
        newPendingCount,
        newReadyCount,
        overduePendingCount,
        overdueReadyCount,
        currentTime
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
