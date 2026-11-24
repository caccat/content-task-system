import { supabase } from '../supabase';
import { markdownToHtml } from '../utils/markdown';
import { getAiGenerationError } from '../utils/aiGenerationResult';
import { RANKING_BATCH_PREFIX, RANKING_SOURCE_PREFIX, RANKING_TASK_PREFIX, isRankingLeaseActive, rankingTaskMarker, type RankingCandidate } from '../utils/rankingWorkflow.js';

export interface RankingBatch {
  hash: string;
  filename: string;
  importedAt: string;
  totalRows: number;
  candidates: RankingCandidate[];
  storageUpdatedAt?: string;
  lease?: { owner: string; purpose: 'analysis' | 'generation'; updatedAt: string } | null;
}

function detail(error: unknown) { return error instanceof Error ? error.message : String(error); }

export async function loadRankingBatch(hash: string): Promise<RankingBatch> {
  const { data, error } = await supabase.from('settings').select('value,updated_at').eq('key', `${RANKING_BATCH_PREFIX}${hash}`).single();
  if (error) throw error;
  if (!data?.value) throw new Error('排名分析表批次不存在');
  return { ...(JSON.parse(data.value) as RankingBatch), storageUpdatedAt: data.updated_at };
}

export async function insertRankingBatch(batch: RankingBatch) {
  const { data, error } = await supabase.from('settings').insert({ key: `${RANKING_BATCH_PREFIX}${batch.hash}`, value: serializeBatch(batch) }).select('updated_at').single();
  if (error) throw error;
  batch.storageUpdatedAt = data.updated_at;
}

export async function insertRankingSource(hash: string, canonicalRows: string[][]) {
  const key = `${RANKING_SOURCE_PREFIX}${hash}`;
  const { error } = await supabase.from('settings').insert({ key, value: JSON.stringify({ headers: ['关键词', 'AI回答', '排名'], rows: canonicalRows }) });
  if (error?.code === '23505') return; // 先前同表上传中断：原表已保存，本次继续创建批次
  if (error) throw error;
}

function serializeBatch(batch: RankingBatch) {
  return JSON.stringify({ hash: batch.hash, filename: batch.filename, importedAt: batch.importedAt, totalRows: batch.totalRows, candidates: batch.candidates, lease: batch.lease || null });
}

export async function replaceRankingBatch(previous: RankingBatch, next: RankingBatch) {
  if (!previous.storageUpdatedAt) throw new Error('批次缺少并发版本，请刷新后重试');
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous.storageUpdatedAt) + 1)).toISOString();
  const { data, error } = await supabase.from('settings')
    .update({ value: serializeBatch(next), updated_at: updatedAt })
    .eq('key', `${RANKING_BATCH_PREFIX}${previous.hash}`)
    .eq('updated_at', previous.storageUpdatedAt)
    .select('updated_at');
  if (error) throw error;
  if (!data?.length) throw new Error('批次已在另一窗口修改，本次保存未执行；请刷新后重试');
  next.storageUpdatedAt = data[0].updated_at;
}

export function isRankingTask(createdBy: string | null | undefined) {
  return Boolean(createdBy?.startsWith(RANKING_TASK_PREFIX));
}

export async function loadRankingCandidateForTask(createdBy: string | null | undefined) {
  if (!isRankingTask(createdBy)) throw new Error('这不是排名分析表任务');
  const match = /^ranking:([a-f0-9]{64}):(.+)$/.exec(createdBy || '');
  if (!match) throw new Error('排名任务来源标记无效');
  const batch = await loadRankingBatch(match[1]);
  const candidate = batch.candidates.find(item => item.id === match[2]);
  if (!candidate) throw new Error('排名任务的原始行已丢失');
  return { batch, candidate };
}

async function setTaskAiStatus(taskId: string, status: 'generating' | 'completed' | 'failed') {
  const { data, error } = await supabase.from('tasks').update({ ai_status: status, updated_at: new Date().toISOString() }).eq('id', taskId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error(`无法记录任务状态：${status}`);
}

export async function ensureRankingTask(batch: RankingBatch, candidate: RankingCandidate): Promise<string> {
  const marker = rankingTaskMarker(batch.hash, candidate.id);
  const { data: existing, error: lookupError } = await supabase.from('tasks').select('id').eq('created_by', marker).limit(1);
  if (lookupError) throw lookupError;
  let taskId = existing?.[0]?.id as string | undefined;
  if (!taskId) {
    const { data, error } = await supabase.from('tasks').insert({
      city: candidate.regions.join('、') || '无地区',
      quantity: candidate.quantity,
      websites: candidate.websites,
      prompt_type: candidate.promptId,
      writing_suggestions: `竞品首推场景：${candidate.scenario}\n写作目标：${candidate.objective}`,
      deadline: candidate.deadline,
      status: 'pending',
      created_by: marker,
      generation_mode: 'ai',
      ai_status: 'pending',
      user_title: candidate.title,
      extra_requirement: null,
    }).select('id').single();
    if (error) throw error;
    taskId = data.id;
  }
  const { data: articles, error: articleError } = await supabase.from('articles').select('id').eq('task_id', taskId);
  if (articleError) throw articleError;
  const missing = candidate.quantity - (articles?.length || 0);
  if (missing > 0) {
    const rows = Array.from({ length: missing }, (_, index) => ({
      task_id: taskId,
      content: '', status: 'draft',
      website: candidate.websites[((articles?.length || 0) + index) % candidate.websites.length] || null,
      notes: `竞品首推场景：${candidate.scenario}`,
    }));
    const { error } = await supabase.from('articles').insert(rows);
    if (error) throw new Error(`任务已建立，但文章记录创建失败：${detail(error)}`);
  }
  if (!taskId) throw new Error('任务创建后未返回 ID');
  return taskId;
}

export async function generateRankingTask(taskId: string, candidate: RankingCandidate, regenerate = false) {
  await setTaskAiStatus(taskId, 'generating');
  try {
    const { data: articles, error } = await supabase.from('articles').select('id,content,status').eq('task_id', taskId).order('created_at', { ascending: true });
    if (error) throw error;
    if (!articles?.length) throw new Error('文章记录丢失，无法保存 AI 生成内容');
    for (const article of articles) {
      if (article.status !== 'draft') throw new Error('已有文章进入待发布或发布状态，不能重新生成覆盖');
      if (!regenerate && article.content?.trim()) {
        console.info(`文章 ${article.id} 已保存内容，本次恢复写作跳过；用户明确重试时可重新生成`);
        continue;
      }
      const response = await fetch('/api/generate-articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ tasks: [{
          city: candidate.regions.join('、') || '无地区',
          prompt_type: candidate.promptId,
          writing_suggestions: candidate.objective,
          ranking: { keyword: candidate.keyword, scenario: candidate.scenario, objective: candidate.objective, regions: candidate.regions, taskTitle: candidate.title },
        }] }),
      });
      const result = await response.json().catch(() => null);
      const generationError = getAiGenerationError(result, response.status);
      if (generationError) throw new Error(generationError);
      const generated = result.results?.[0];
      if (!generated?.content || !generated?.title) throw new Error('AI 未返回标题或正文');
      const { data: saved, error: saveError } = await supabase.from('articles')
        .update({ content: markdownToHtml(generated.content), status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', article.id).select('id');
      if (saveError) throw saveError;
      if (!saved?.length) throw new Error('文章保存失败：记录已不存在');
    }
    await setTaskAiStatus(taskId, 'completed');
  } catch (error) {
    try { await setTaskAiStatus(taskId, 'failed'); }
    catch (statusError) { throw new Error(`${detail(error)}；且失败状态记录失败：${detail(statusError)}`); }
    throw error;
  }
}

export async function retryRankingTask(taskId: string, createdBy: string) {
  const { batch, candidate } = await loadRankingCandidateForTask(createdBy);
  if (isRankingLeaseActive(batch.lease)) throw new Error('此批次正在另一窗口处理；稍后刷新，30 分钟未更新后可恢复本次重试');
  const owner = crypto.randomUUID();
  await replaceRankingBatch(batch, { ...batch, lease: { owner, purpose: 'generation', updatedAt: new Date().toISOString() } });
  const update = async (state: RankingCandidate['state'], lastError: string | null) => {
    const current = await loadRankingBatch(batch.hash);
    if (current.lease?.owner !== owner) throw new Error('批次已由另一窗口接管，请刷新后重试');
    const next = { ...current, lease: { ...current.lease, updatedAt: new Date().toISOString() }, candidates: current.candidates.map(item => item.id === candidate.id ? { ...item, state, lastError } : item) };
    await replaceRankingBatch(current, next);
  };
  try {
    await update('generating', null);
    await generateRankingTask(taskId, candidate, true);
    await update('completed', null);
  } catch (error) {
    try { await update('failed', detail(error)); }
    catch (saveError) { throw new Error(`${detail(error)}；且批次错误记录失败：${detail(saveError)}`); }
    throw error;
  } finally {
    const current = await loadRankingBatch(batch.hash);
    if (current.lease?.owner === owner) await replaceRankingBatch(current, { ...current, lease: null });
  }
}
