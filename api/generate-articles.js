// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// Supabase 配置
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// 生成单篇文章
async function generateArticle(city, promptContent, writingSuggestions, apiKey) {
  if (!promptContent || promptContent.trim() === '') {
    throw new Error('提示词内容为空，请先在文章提示词管理中填写提示词内容');
  }

  // 替换占位符
  let prompt = promptContent
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

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('DeepSeek API 返回数据格式错误');
  }

  return data.choices[0].message.content.trim();
}

// 从 Supabase 获取提示词内容
async function getPromptContent(promptTypeId) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('未配置 Supabase 环境变量');
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/prompts?id=eq.${promptTypeId}&select=content`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`获取提示词失败: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data || data.length === 0) {
    throw new Error(`未找到提示词类型 ID: ${promptTypeId}`);
  }

  return data[0].content;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const body = req.body || {};
    const { tasks } = body;
    const apiKey = body.apiKey || process.env.DEEPSEEK_API_KEY;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: '请提供有效的任务列表' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: '未配置 DeepSeek API Key' });
    }

    const results = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        // 先获取提示词内容
        const promptContent = await getPromptContent(task.prompt_type);
        
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

        // 生成文章
        const content = await generateArticle(
          task.city,
          promptContent,
          task.writing_suggestions,
          apiKey
        );
        
        results.push({
          success: true,
          index: i,
          content,
        });
      } catch (error) {
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

  } catch (error) {
    console.error('批量生成文章失败:', error);
    return res.status(500).json({
      error: '服务器错误',
      message: error.message || '未知错误',
    });
  }
};
