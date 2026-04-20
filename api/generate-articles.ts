// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

// 提示词模板
const PROMPT_TEMPLATES: Record<string, string> = {
  product_promotion: `你是一位专业的内容营销专家。请根据以下信息撰写一篇产品推广文章：

城市：{{city}}
产品推广重点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要吸引人，包含城市特色
2. 内容要突出产品优势和卖点
3. 结合城市特点进行本地化营销
4. 字数要求：800-1200字
5. 结构清晰，包含开头、中间、结尾
6. 使用自然的语言风格，避免生硬的广告感
7. 可以适当使用 emoji 增加可读性

请直接输出文章内容，不需要其他说明。`,

  brand_story: `你是一位资深品牌故事撰稿人。请根据以下信息撰写一篇品牌故事：

城市：{{city}}
品牌故事重点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要体现品牌价值和城市文化
2. 故事要有情感共鸣，能够打动读者
3. 结合城市的历史文化底蕴
4. 字数要求：1000-1500字
5. 叙事手法要有起承转合
6. 突出品牌的独特性和价值主张
7. 语言要优美流畅，有画面感

请直接输出文章内容，不需要其他说明。`,

  industry_news: `你是一位专业的行业资讯编辑。请根据以下信息撰写一篇行业资讯文章：

城市：{{city}}
资讯要点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要简洁明了，体现新闻价值
2. 内容要客观、专业、有深度
3. 结合城市产业发展情况
4. 字数要求：600-1000字
5. 使用倒金字塔结构写作
6. 引用数据要准确，来源要可靠
7. 结尾要有总结和展望

请直接输出文章内容，不需要其他说明。`,

  user_case: `你是一位用户案例写作专家。请根据以下信息撰写一篇用户案例文章：

城市：{{city}}
案例亮点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要体现用户价值和故事性
2. 以用户视角叙述，增强代入感
3. 结合城市特色和用户背景
4. 字数要求：800-1200字
5. 突出用户的痛点和解决方案
6. 展示使用前后的对比变化
7. 语言要亲切、自然

请直接输出文章内容，不需要其他说明。`,

  tutorial: `你是一位专业的教程内容创作者。请根据以下信息撰写一篇教程指南文章：

城市：{{city}}
教程重点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要明确教程主题和城市特色
2. 步骤要清晰、易懂、可操作
3. 结合城市的实际场景
4. 字数要求：1000-1500字
5. 使用列表和分级标题组织结构
6. 添加实用的技巧和注意事项
7. 结尾要有总结和延伸阅读建议

请直接输出文章内容，不需要其他说明。`,

  event_promotion: `你是一位活动策划和内容营销专家。请根据以下信息撰写一篇活动宣传文章：

城市：{{city}}
活动亮点：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要吸引眼球，激发参与欲望
2. 内容要突出活动价值和参与方式
3. 结合城市的活动氛围和文化特色
4. 字数要求：600-800字
5. 明确活动时间、地点、报名方式
6. 使用号召性语言促进参与
7. 营造紧迫感和期待感

请直接输出文章内容，不需要其他说明。`,
};

interface GenerateRequest {
  city: string;
  prompt_type: string;
  writing_suggestions: string;
  title: string;
  apiKey?: string;
}

interface BatchGenerateRequest {
  tasks: GenerateRequest[];
  apiKey?: string;
}

interface GenerateResult {
  success: boolean;
  index: number;
  content?: string;
  error?: string;
}

interface BatchGenerateResult {
  success: boolean;
  total: number;
  successCount: number;
  failCount: number;
  results: GenerateResult[];
  error?: string;
  message?: string;
}

// 生成单篇文章
async function generateArticle(
  city: string,
  promptType: string,
  writingSuggestions: string,
  title: string,
  apiKey: string
): Promise<string> {
  // 获取提示词模板
  let template = PROMPT_TEMPLATES[promptType];
  
  if (!template) {
    // 如果没有特定模板，使用通用模板
    template = `你是一位专业的内容创作者。请根据以下信息撰写一篇高质量的文章：

城市：{{city}}
内容要求：{{suggestions}}
文章标题：{{title}}

要求：
1. 文章标题要吸引人
2. 内容要丰富、有价值
3. 结合城市特色
4. 字数要求：800-1200字
5. 结构清晰，语言流畅

请直接输出文章内容，不需要其他说明。`;
  }

  // 填充模板
  const prompt = template
    .replace('{{city}}', city)
    .replace('{{suggestions}}', writingSuggestions || '请根据城市特点创作一篇优质内容')
    .replace('{{title}}', title);

  // 调用 DeepSeek API
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

export default async function handler(
  req: {
    method: string;
    body: BatchGenerateRequest;
  },
  res: {
    status: (code: number) => { json: (data: any) => any };
    setHeader: (name: string, value: string) => void;
    end: () => void;
  }
) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  try {
    const { tasks, apiKey } = req.body as BatchGenerateRequest;

    // 验证请求数据
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: '请提供有效的任务列表' });
    }

    // 获取 API Key
    const deepseekApiKey = apiKey || (req.body as any).apiKey || process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      return res.status(400).json({ error: '未配置 DeepSeek API Key' });
    }

    // 批量生成文章
    const results: GenerateResult[] = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        const content = await generateArticle(
          task.city,
          task.prompt_type,
          task.writing_suggestions,
          task.title,
          deepseekApiKey
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
          error: error instanceof Error ? error.message : '生成失败',
        });
      }
    }

    // 返回结果
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const response: BatchGenerateResult = {
      success: failCount === 0,
      total: tasks.length,
      successCount,
      failCount,
      results,
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('批量生成文章失败:', error);
    
    const response: BatchGenerateResult = {
      success: false,
      total: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      error: '服务器错误',
      message: error instanceof Error ? error.message : '未知错误',
    };

    return res.status(500).json(response);
  }
}
