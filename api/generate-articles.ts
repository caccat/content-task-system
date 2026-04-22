import type { VercelRequest, VercelResponse } from '@vercel/node';

// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// 生成单篇文章（新增 title 参数）
async function generateArticle(city: string, promptContent: string, writingSuggestions: string, apiKey: string, title?: string): Promise<string> {
  if (!promptContent || promptContent.trim() === '') {
    throw new Error('提示词内容为空，请先在文章提示词管理中填写提示词内容');
  }

  // 替换占位符（title 用户输入的标题优先于其他默认值）
  let prompt = promptContent
    .replace(/\{\{title\}\}/g, title || '')
    .replace(/\{\{city\}\}/g, city)
    .replace(/\{\{suggestions\}\}/g, writingSuggestions || '请根据城市特点创作一篇优质内容');

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一位专业、优秀的内容创作者，擅长撰写各种类型的优质文章。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`DeepSeek API 错误: ${response.status} - ${errorData}`);
  }

  const data = await response.json() as any;
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('DeepSeek API 返回数据格式错误');
  }

  return data.choices[0].message.content.trim();
}

// 从 Supabase 获取提示词内容
async function getPromptContent(promptTypeId: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('未配置 Supabase 环境变量');
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/prompts?id=eq.${promptTypeId}&select=content`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`获取提示词失败: ${response.status}`);
  }

  const data = await response.json() as any[];
  
  if (!data || data.length === 0) {
    throw new Error(`未找到提示词类型 ID: ${promptTypeId}`);
  }

  return data[0].content;
}

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
    const body = req.body || {};
    const { tasks } = body;
    
    // 从 Vercel 环境变量获取 API Key（支持 VITE_ 前缀和无前缀两种格式）
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: '请提供有效的任务列表' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: '未配置 DeepSeek API Key' });
    }

    const results: any[] = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        // 先获取提示词内容
        const promptContent = await getPromptContent(task.prompt_type, supabaseUrl, supabaseKey);
        
        // 检查提示词内容是否为空
        if (!promptContent || promptContent.trim() === '') {
          results.push({
            success: false,
            index: i,
            error: '提示词内容为空，请先在文章提示词管理中填写提示词内容',
            taskIndex: i + 1,
          });
          continue;
        }

        // 生成文章（传递用户输入的标题）
        const content = await generateArticle(
          task.city,
          promptContent,
          task.writing_suggestions,
          apiKey,
          task.title // 用户输入的标题
        );
        
        results.push({
          success: true,
          index: i,
          content,
        });
      } catch (error: any) {
        results.push({
          success: false,
          index: i,
          error: error.message || '生成失败',
          taskIndex: i + 1,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: failCount === 0,
      total: tasks.length,
      successCount,
      failCount,
      results,
    });

  } catch (error: any) {
    console.error('批量生成文章失败:', error);
    return res.status(500).json({
      error: '服务器错误',
      message: error.message || '未知错误',
    });
  }
}
