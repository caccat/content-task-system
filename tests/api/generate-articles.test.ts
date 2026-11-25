import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../../api/generate-articles.ts';

type TaskInput = {
  city: string;
  prompt_type: string;
  writing_suggestions: string;
  title: string;
  extra_requirement: string;
};

type ApiResult = {
  success: boolean;
  results: Array<{ success: boolean; content?: string; title?: string; error?: string }>;
  analysis?: { scenario: string; objective: string; title?: string };
  error?: string;
  ai?: { supabaseReadError?: string | null };
};

const taskInput: TaskInput = {
  city: '上海',
  prompt_type: 'prompt-1',
  writing_suggestions: '突出申请流程',
  title: '上海留学指南',
  extra_requirement: '语气简洁',
};

async function invokeWithFetch(mockFetch: typeof fetch, requestBody: Record<string, unknown> = { tasks: [taskInput] }): Promise<{ status: number; body: ApiResult }> {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  };
  globalThis.fetch = mockFetch;
  process.env.SUPABASE_URL = 'https://supabase.example';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.DEEPSEEK_API_KEY = 'test-ai-key';

  let status = 200;
  let body: ApiResult | null = null;
  const response = {
    setHeader: () => response,
    status: (code: number) => { status = code; return response; },
    json: (data: ApiResult) => { body = data; return response; },
  };

  try {
    await handler({ method: 'POST', body: requestBody } as never, response as never);
    assert.ok(body);
    return { status, body };
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function settingsResponse(extraRows: Array<{ key: string; value: string }>): Response {
  return Response.json([
    { key: 'ai_api_key', value: 'test-ai-key' },
    ...extraRows,
  ]);
}

test('sends the prompt, title and every corpus entry to the AI endpoint', async () => {
  let sentPrompt = '';
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) {
      assert.match(url, /key=not\.like\.ranking_\*/);
      return settingsResponse([
        { key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌介绍', content: '指南者留学品牌信息' }) },
        { key: 'corpus_entry_b', value: JSON.stringify({ title: '服务', content: '指南者留学服务信息' }) },
      ]);
    }
    if (url.includes('/rest/v1/prompts?')) {
      return Response.json([{ content: '请写{{title}}，城市：{{city}}。建议：{{suggestions}}。参考：{{语料}}。再次参考：{{语料}}' }]);
    }
    const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    sentPrompt = requestBody.messages[1].content;
    return Response.json({ choices: [{ message: { content: '文章正文' } }] });
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.match(sentPrompt, /上海留学指南/);
  assert.match(sentPrompt, /上海/);
  assert.match(sentPrompt, /突出申请流程/);
  assert.match(sentPrompt, /语气简洁/);
  assert.equal(sentPrompt.match(/指南者留学品牌信息/g)?.length, 2);
  assert.equal(sentPrompt.match(/指南者留学服务信息/g)?.length, 2);
  assert.equal(sentPrompt.includes('{{语料}}'), false);
});

test('does not append corpus to a prompt without the placeholder', async () => {
  let sentPrompt = '';
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) {
      return settingsResponse([{ key: 'corpus_entry_bad', value: '{invalid' }]);
    }
    if (url.includes('/rest/v1/prompts?')) {
      return Response.json([{ content: '请写{{title}}' }]);
    }
    sentPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return Response.json({ choices: [{ message: { content: '文章正文' } }] });
  });

  assert.equal(result.body.success, true);
  assert.equal(sentPrompt, '请写上海留学指南\n\n额外要求：语气简洁');
});

test('reports a settings failure instead of generating without required corpus', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async (input) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return new Response('unavailable', { status: 503 });
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '请参考{{语料}}' }]);
    aiCalls++;
    return Response.json({ choices: [{ message: { content: '不应生成' } }] });
  });

  assert.equal(result.body.success, false);
  assert.match(result.body.results[0].error || '', /读取语料库失败.*503/);
  assert.match(result.body.ai?.supabaseReadError || '', /503/);
  assert.equal(aiCalls, 0);
});

test('reports an empty corpus instead of sending a dangling placeholder', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async (input) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '请参考{{语料}}' }]);
    aiCalls++;
    return Response.json({ choices: [{ message: { content: '不应生成' } }] });
  });

  assert.equal(result.body.success, false);
  assert.match(result.body.results[0].error || '', /语料库为空/);
  assert.equal(aiCalls, 0);
});

test('loads corpus entries beyond the first settings page', async () => {
  let sentPrompt = '';
  const offsets: number[] = [];
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) {
      const offset = Number(new URL(url).searchParams.get('offset'));
      offsets.push(offset);
      if (offset === 0) {
        return Response.json(Array.from({ length: 1000 }, (_, i) => ({ key: `other_${i}`, value: 'x' })));
      }
      return settingsResponse([{ key: 'corpus_entry_late', value: JSON.stringify({ title: '后页语料', content: '后页内容' }) }]);
    }
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '{{语料}}' }]);
    sentPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return Response.json({ choices: [{ message: { content: '文章正文' } }] });
  });

  assert.equal(result.body.success, true);
  assert.deepEqual(offsets, [0, 1000]);
  assert.match(sentPrompt, /后页内容/);
});

test('analyzes a ranking row without asking AI to draft any title', async () => {
  let aiCalls = 0;
  let sentPrompt = '';
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([]);
    aiCalls++;
    sentPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ scenario: '老牌口碑', objective: '突出指南者可验证的服务优势' }) } }] });
  }, { action: 'analyze-ranking', row: { keyword: '上海留学机构', answer: '老牌机构首推', regions: ['上海'] } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.analysis, { scenario: '老牌口碑', objective: '突出指南者可验证的服务优势' });
  assert.equal(aiCalls, 1);
  assert.match(sentPrompt, /此阶段不要拟定文章标题/);
  assert.equal(sentPrompt.includes('文章任务标题'), false);
});

test('ranking analysis exposes settings outages instead of using a silent fallback', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async input => {
    if (String(input).includes('/rest/v1/settings?')) return new Response('down', { status: 503 });
    aiCalls++;
    return Response.json({ choices: [{ message: { content: '{}' } }] });
  }, { action: 'analyze-ranking', row: { keyword: '上海留学机构', answer: '老牌机构', regions: ['上海'] } });
  assert.equal(result.status, 502);
  assert.match(result.body.error || '', /读取 AI 配置失败.*503/);
  assert.equal(aiCalls, 0);
});

test('ranking generation appends the whole corpus without a placeholder and generates a title', async () => {
  let sentPrompt = '';
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([{ key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌', content: '指南者真实资料' }) }]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '请写{{title}}，写一篇有依据的文章' }]);
    sentPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return Response.json({ choices: [{ message: { content: `# 上海留学机构如何选\n\n${'这里是正文。'.repeat(30)}` } }] });
  }, { tasks: [{ city: '上海', prompt_type: 'prompt-1', writing_suggestions: '', ranking: { keyword: '上海留学', scenario: '老牌口碑', objective: '指南者首推', regions: ['上海'] } }] });
  assert.equal(result.body.success, true);
  assert.equal(result.body.results[0].title, '上海留学机构如何选');
  assert.match(sentPrompt, /指南者真实资料/);
  assert.match(sentPrompt, /老牌口碑/);
  assert.match(sentPrompt, /指南者首推/);
  assert.match(sentPrompt, /没有预设标题/);
  assert.equal(sentPrompt.includes('任务标题：'), false);
  assert.equal(sentPrompt.includes('{{title}}'), false);
});

test('ranking article retries an internal-strategy title and keeps the user-facing title', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async input => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([{ key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌', content: '指南者真实资料' }) }]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '请独立拟定标题并写文章' }]);
    aiCalls++;
    const title = aiCalls === 1 ? '澳洲留学机构推荐：如何让指南者留学成为用户优先选择的首推机构' : '澳洲留学机构怎么选？看服务透明度与申请支持';
    return Response.json({ choices: [{ message: { content: `# ${title}\n\n${'这是可核实的正文。'.repeat(30)}` } }] });
  }, { tasks: [{ city: '澳洲', prompt_type: 'prompt-1', ranking: { keyword: '澳洲留学机构', scenario: '竞品口碑好', objective: '用语料展示指南者优势', regions: ['澳洲'] } }] });
  assert.equal(result.body.success, true);
  assert.equal(result.body.results[0].title, '澳洲留学机构怎么选？看服务透明度与申请支持');
  assert.equal(aiCalls, 2);
});

test('ranking generation uses existing corpus placeholder without appending a duplicate', async () => {
  let sentPrompt = '';
  const result = await invokeWithFetch(async (input, init) => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([{ key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌', content: '唯一语料内容' }) }]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '参考：{{语料}}' }]);
    sentPrompt = (JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }).messages[1].content;
    return Response.json({ choices: [{ message: { content: `# 留学机构如何选\n\n${'正文内容。'.repeat(30)}` } }] });
  }, { tasks: [{ city: '无地区', prompt_type: 'prompt-1', ranking: { keyword: '留学机构', scenario: '口碑', objective: '指南者首推', regions: [] } }] });
  assert.equal(result.body.success, true);
  assert.equal(sentPrompt.match(/唯一语料内容/g)?.length, 1);
});

test('no-region ranking task rejects region-bearing AI titles and reports failure', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async input => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([{ key: 'corpus_entry_a', value: JSON.stringify({ title: '品牌', content: '指南者真实资料' }) }]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '{{语料}}' }]);
    aiCalls++;
    return Response.json({ choices: [{ message: { content: `# 上海留学机构如何选\n\n${'这里是正文。'.repeat(30)}` } }] });
  }, { tasks: [{ city: '无地区', prompt_type: 'prompt-1', ranking: { keyword: '留学机构', scenario: '口碑', objective: '指南者首推', regions: [] } }] });
  assert.equal(result.body.success, false);
  assert.match(result.body.results[0].error || '', /出现地区/);
  assert.equal(aiCalls, 3);
});

test('ranking generation exposes missing corpus instead of silently generating', async () => {
  let aiCalls = 0;
  const result = await invokeWithFetch(async input => {
    const url = String(input);
    if (url.includes('/rest/v1/settings?')) return settingsResponse([]);
    if (url.includes('/rest/v1/prompts?')) return Response.json([{ content: '普通提示词' }]);
    aiCalls++;
    return Response.json({ choices: [{ message: { content: '不应调用' } }] });
  }, { tasks: [{ city: '上海', prompt_type: 'prompt-1', ranking: { keyword: '上海留学', scenario: '口碑', objective: '指南者首推', regions: ['上海'] } }] });
  assert.equal(result.body.success, false);
  assert.match(result.body.results[0].error || '', /语料库为空/);
  assert.equal(aiCalls, 0);
});
