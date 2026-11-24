import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, DatePicker, Form, Input, InputNumber, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../supabase';
import { usePrompts } from '../hooks/usePrompts';
import { useWebsites } from '../hooks/useWebsites';
import { detectRegions, hashRankingRows, isRankingLeaseActive, parseRankingRows, RANKING_BATCH_PREFIX, rankingTaskMarker, validateRankingTitle, type RankingCandidate } from '../utils/rankingWorkflow.js';
import { ensureRankingTask, generateRankingTask, insertRankingBatch, insertRankingSource, loadRankingBatch, replaceRankingBatch, retryRankingTask, type RankingBatch } from '../services/rankingTasks';

const { Title, Text } = Typography;
const { TextArea } = Input;
type CandidateForm = Pick<RankingCandidate, 'keyword' | 'title' | 'scenario' | 'objective' | 'quantity' | 'websites' | 'promptId' | 'deadline'>;

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

export default function RankingImport() {
  const [batches, setBatches] = useState<Array<{ hash: string; filename: string; importedAt: string; count: number }>>([]);
  const [batch, setBatch] = useState<RankingBatch | null>(null);
  const batchRef = useRef<RankingBatch | null>(null);
  const ownerId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form] = Form.useForm<CandidateForm>();
  const [batchQuantity, setBatchQuantity] = useState(1);
  const [batchWebsites, setBatchWebsites] = useState<string[]>([]);
  const [batchPrompt, setBatchPrompt] = useState('');
  const [batchDeadline, setBatchDeadline] = useState(dayjs());
  const { prompts } = usePrompts();
  const { websites } = useWebsites();

  const showBatch = (value: RankingBatch | null) => { batchRef.current = value; setBatch(value); };
  const selectBatch = (value: RankingBatch) => {
    showBatch(value);
    const first = value.candidates[0];
    setBatchQuantity(first?.quantity || 1);
    setBatchWebsites(first?.websites || []);
    setBatchPrompt(first?.promptId || '');
    setBatchDeadline(first?.deadline ? dayjs(first.deadline) : dayjs());
  };

  const loadList = useCallback(async () => {
    try {
      const items: typeof batches = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('settings').select('key,value,updated_at')
          .like('key', `${RANKING_BATCH_PREFIX}%`).order('updated_at', { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        for (const row of data || []) {
          try {
            const stored = JSON.parse(row.value) as RankingBatch;
            items.push({ hash: stored.hash, filename: stored.filename, importedAt: stored.importedAt, count: stored.candidates.length });
          } catch { throw new Error(`批次 ${row.key} 数据格式损坏`); }
        }
        if ((data || []).length < 1000) break;
      }
      setBatches(items);
      setLoadError(null);
    } catch (error) { setLoadError(`读取导入记录失败：${errorText(error)}`); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  const persist = async (next: RankingBatch) => {
    const previous = batchRef.current;
    if (!previous) throw new Error('当前没有打开的批次');
    if (previous.lease && previous.lease.owner !== ownerId.current && isRankingLeaseActive(previous.lease)) {
      throw new Error(`另一窗口正在${previous.lease.purpose === 'analysis' ? '分析' : '写作'}此批次；稍后刷新，30 分钟未更新后可恢复`);
    }
    if (next.lease?.owner === ownerId.current) next.lease = { ...next.lease, updatedAt: new Date().toISOString() };
    await replaceRankingBatch(previous, next);
    showBatch(next);
  };

  const acquireLease = async (purpose: 'analysis' | 'generation') => {
    const current = batchRef.current;
    if (!current) throw new Error('当前没有打开的批次');
    await persist({ ...current, lease: { owner: ownerId.current, purpose, updatedAt: new Date().toISOString() } });
  };

  const releaseLease = async () => {
    const current = batchRef.current;
    if (current?.lease?.owner === ownerId.current) await persist({ ...current, lease: null });
  };

  const updateCandidate = async (id: string, change: Partial<RankingCandidate>) => {
    const current = batchRef.current;
    if (!current) throw new Error('当前没有打开的批次');
    const next = { ...current, candidates: current.candidates.map(candidate => candidate.id === id ? { ...candidate, ...change } : candidate) };
    await persist(next);
  };

  const runAnalysis = async (target: RankingBatch, onlyId?: string) => {
    setBusy(true);
    let failed = 0;
    let processed = 0;
    try {
      await acquireLease('analysis');
      for (const initial of target.candidates) {
        if (onlyId && initial.id !== onlyId) continue;
        const candidate = batchRef.current?.candidates.find(item => item.id === initial.id);
        if (!candidate) throw new Error(`第 ${initial.sourceRow} 行已在另一窗口删除，请刷新批次后重试`);
        if (candidate.taskId || !['pending', 'analyzing', 'failed'].includes(candidate.state) || (candidate.state === 'failed' && candidate.scenario)) {
          console.info(`第 ${candidate.sourceRow} 行本次分析跳过：已有状态 ${candidate.state}；后续可在候选任务中编辑或重试`);
          continue;
        }
        try {
          processed++;
          await updateCandidate(candidate.id, { state: 'analyzing', lastError: null });
          const response = await fetch('/api/generate-articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000), body: JSON.stringify({ action: 'analyze-ranking', row: { keyword: candidate.keyword, answer: candidate.answer, regions: candidate.regions } }) });
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.success || !result.analysis) throw new Error(result?.error || `场景分析请求失败 HTTP ${response.status}`);
          await updateCandidate(candidate.id, { ...result.analysis, state: 'ready', lastError: null });
        } catch (error) {
          failed++;
          try { await updateCandidate(candidate.id, { state: 'failed', lastError: errorText(error) }); }
          catch (saveError) { throw new Error(`第 ${candidate.sourceRow} 行分析失败，且错误状态无法保存：${errorText(error)}；${errorText(saveError)}`); }
        }
      }
      if (!processed) message.info('本次没有待分析行；已完成的候选任务保留原结果');
      else if (failed) message.warning(`场景分析完成，${failed} 行失败；可逐行重试或编辑`);
      else message.success('场景分析完成，请检查并调整候选任务');
    } catch (error) { message.error(errorText(error)); }
    finally { try { await releaseLease(); } catch (error) { message.error(`解除批次处理状态失败：${errorText(error)}`); } setBusy(false); void loadList(); }
  };

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('没有找到工作表');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
      const parsed = parseRankingRows(rows);
      const hash = await hashRankingRows(parsed.canonicalRows);
      const { data: existing, error: lookupError } = await supabase.from('settings').select('key').eq('key', `${RANKING_BATCH_PREFIX}${hash}`).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        selectBatch(await loadRankingBatch(hash));
        message.warning('这份表的内容已导入；已打开原批次。文件名不同也不能重复导入');
        return;
      }
      const today = dayjs().format('YYYY-MM-DD');
      const created: RankingBatch = {
        hash, filename: file.name, importedAt: new Date().toISOString(), totalRows: parsed.canonicalRows.length,
        candidates: parsed.candidates.map(candidate => ({ ...candidate, deadline: today })),
      };
      await insertRankingSource(hash, parsed.canonicalRows);
      try { await insertRankingBatch(created); }
      catch (error) {
        const { data } = await supabase.from('settings').select('key').eq('key', `${RANKING_BATCH_PREFIX}${hash}`).maybeSingle();
        if (data) { selectBatch(await loadRankingBatch(hash)); message.warning('这份表的内容已由另一窗口导入；已打开原批次'); return; }
        throw error;
      }
      selectBatch(created);
      await loadList();
      if (created.candidates.length) await runAnalysis(created);
      else message.info('表已记录，但没有排名非 1 且第三列不为空的行');
    } catch (error) { message.error(`导入失败：${errorText(error)}`); }
    finally { setBusy(false); }
  };

  const openBatch = async (hash: string) => {
    try { selectBatch(await loadRankingBatch(hash)); }
    catch (error) { message.error(`打开批次失败：${errorText(error)}`); }
  };

  const openEditor = (candidate?: RankingCandidate) => {
    setEditingId(candidate?.id || null);
    form.setFieldsValue(candidate ? {
      keyword: candidate.keyword, title: candidate.title, scenario: candidate.scenario, objective: candidate.objective,
      quantity: candidate.quantity, websites: candidate.websites, promptId: candidate.promptId, deadline: candidate.deadline,
    } : { keyword: '', title: '', scenario: '', objective: '', quantity: batchQuantity, websites: batchWebsites, promptId: batchPrompt, deadline: batchDeadline.format('YYYY-MM-DD') });
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    try {
      const values = await form.validateFields();
      const regions = detectRegions(values.keyword);
      const titleError = validateRankingTitle(values.title, regions);
      if (titleError) throw new Error(`任务标题：${titleError}`);
      const current = batchRef.current;
      if (!current) throw new Error('当前没有打开的批次');
      if (editingId) {
        const candidate = current.candidates.find(item => item.id === editingId);
        if (candidate?.taskId) throw new Error('正式任务已创建，请在任务列表修改');
        await updateCandidate(editingId, { ...values, regions, state: 'ready', lastError: null });
      } else {
        const next: RankingCandidate = { ...values, id: `manual-${crypto.randomUUID()}`, sourceRow: 0, answer: '', rank: null, regions, state: 'ready', lastError: null, taskId: null };
        await persist({ ...current, candidates: [...current.candidates, next] });
      }
      setEditorOpen(false);
      message.success('候选任务已保存');
    } catch (error) { if (error instanceof Error) message.error(error.message); }
  };

  const removeCandidate = async (id: string) => {
    const current = batchRef.current;
    if (!current) return;
    const candidate = current.candidates.find(item => item.id === id);
    if (candidate?.taskId) { message.error('正式任务已创建，请在任务列表删除'); return; }
    try { await persist({ ...current, candidates: current.candidates.filter(item => item.id !== id) }); message.success('已删除候选任务'); }
    catch (error) { message.error(errorText(error)); }
  };

  const applyBatchConfig = async () => {
    const current = batchRef.current;
    if (!current) return;
    if (!batchWebsites.length || !batchPrompt || !batchDeadline.isValid() || batchQuantity < 1) { message.error('请先填写文章数、网站、提示词和文章完成日期'); return; }
    try {
      const skipped = current.candidates.filter(candidate => candidate.taskId).length;
      await persist({ ...current, candidates: current.candidates.map(candidate => candidate.taskId ? candidate : { ...candidate, quantity: batchQuantity, websites: batchWebsites, promptId: batchPrompt, deadline: batchDeadline.format('YYYY-MM-DD') }) });
      message.success(skipped ? `整批配置已应用至未创建任务；${skipped} 个已创建任务请在任务列表修改` : '整批配置已应用；可继续修改单个任务');
    } catch (error) { message.error(errorText(error)); }
  };

  const startGeneration = async () => {
    const current = batchRef.current;
    if (!current) return;
    const unready = current.candidates.find(item => !item.taskId && !(['ready', 'creating'].includes(item.state) || (item.state === 'failed' && item.scenario && item.objective && item.title)));
    if (unready) { message.error(`第 ${unready.sourceRow || '新增'} 行尚未完成场景分析，请重试、编辑或删除`); return; }
    const invalid = current.candidates.find(item => !item.quantity || !item.websites.length || !item.promptId || !item.deadline);
    if (invalid) { message.error('仍有任务未配置文章数、网站、提示词或文章完成日期'); return; }
    setBusy(true);
    let failed = 0;
    let processed = 0;
    try {
      await acquireLease('generation');
      for (const candidate of current.candidates) {
        const latest = batchRef.current?.candidates.find(item => item.id === candidate.id);
        if (!latest) throw new Error(`候选任务 ${candidate.id} 已在另一窗口删除，请刷新后重试`);
        if (latest.state === 'completed') {
          console.info(`任务 ${latest.id} 已完成，本次永久跳过重复创建和改写`);
          continue;
        }
        try {
          processed++;
          await updateCandidate(latest.id, { state: 'creating', lastError: null });
          const taskId = await ensureRankingTask(current, latest);
          await updateCandidate(latest.id, { taskId, state: 'generating' });
          await generateRankingTask(taskId, latest);
          await updateCandidate(latest.id, { state: 'completed', lastError: null });
        } catch (error) {
          failed++;
          try { await updateCandidate(latest.id, { state: 'failed', lastError: errorText(error) }); }
          catch (saveError) { throw new Error(`任务 ${latest.title} 失败，且错误状态无法保存：${errorText(error)}；${errorText(saveError)}`); }
        }
      }
      if (!processed) message.info('本次没有待写作任务；已完成文章不会重复生成');
      else if (failed) message.warning(`自动写作结束，${failed} 个任务失败；可在此重试。成功文章仍在内容生成者 → 未生成`);
      else message.success('自动写作完成；文章已保留在内容生成者 → 未生成');
    } catch (error) { message.error(errorText(error)); }
    finally { try { await releaseLease(); } catch (error) { message.error(`解除批次处理状态失败：${errorText(error)}`); } setBusy(false); }
  };

  const retryOne = async (candidate: RankingCandidate) => {
    if (!batch || !candidate.taskId) return;
    setBusy(true);
    try {
      await retryRankingTask(candidate.taskId, rankingTaskMarker(batch.hash, candidate.id));
      await openBatch(batch.hash);
      message.success('重新写作完成，文章仍在未生成');
    } catch (error) { message.error(`重新写作失败：${errorText(error)}`); await openBatch(batch.hash); }
    finally { setBusy(false); }
  };

  return <Space direction="vertical" style={{ width: '100%' }} size="middle">
    <Card>
      <Title level={4}>上传排名分析表</Title>
      <Text type="secondary">按整表内容识别重复上传；第三列为空或排名为 1 的行不建任务。每个符合条件的原始行保留一条候选任务。</Text>
      <div style={{ marginTop: 16 }}><input type="file" accept=".xlsx,.xls" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleUpload(file); }} /> <UploadOutlined /></div>
      {loadError && <Alert type="error" showIcon title={loadError} style={{ marginTop: 12 }} />}
      <Space style={{ marginTop: 16 }}>
        <Select style={{ width: 420 }} placeholder="选择已导入的表" value={batch?.hash} onChange={value => void openBatch(value)} options={batches.map(item => ({ value: item.hash, label: `${item.filename} · ${item.count} 个候选 · ${dayjs(item.importedAt).format('MM-DD HH:mm')}` }))} />
        <Button icon={<ReloadOutlined />} onClick={() => void loadList()}>刷新批次</Button>
        {batch && <Button onClick={() => void openBatch(batch.hash)}>刷新当前批次</Button>}
      </Space>
    </Card>
    {batch && <>
      <Card title={`候选任务 · ${batch.filename}`} extra={<Space><Tag>{batch.candidates.length} 条</Tag><Button icon={<PlusOutlined />} disabled={busy} onClick={() => openEditor()}>新增任务</Button><Button disabled={busy} onClick={() => void runAnalysis(batch)}>继续分析失败行</Button></Space>}>
        <Alert type="info" showIcon title="核对 AI 识别结果" description="可逐条修改或删除候选任务。同一场景的不同原始行各自保留任务。已创建的正式任务可在现有任务列表修改。" style={{ marginBottom: 12 }} />
        <Table rowKey="id" dataSource={batch.candidates} pagination={{ pageSize: 10 }} scroll={{ x: 1900 }} columns={[
          { title: '原表行', dataIndex: 'sourceRow', width: 90, render: value => value || '新增' },
          { title: '关键词', dataIndex: 'keyword', width: 190, ellipsis: true },
          { title: '地区', dataIndex: 'regions', width: 130, render: value => value.length ? value.join('、') : '无地区' },
          { title: '排名', dataIndex: 'rank', width: 75, render: value => value ?? '—' },
          { title: '竞品首推场景', dataIndex: 'scenario', width: 220, ellipsis: true },
          { title: '写作目标', dataIndex: 'objective', width: 240, ellipsis: true },
          { title: '任务标题', dataIndex: 'title', width: 240, ellipsis: true },
          { title: '文章数', dataIndex: 'quantity', width: 85 },
          { title: '发布网站', dataIndex: 'websites', width: 160, render: (ids: string[]) => ids.map(id => websites.find(site => site.id === id)?.name || id).join('、') || '未设置' },
          { title: '文章提示词', dataIndex: 'promptId', width: 150, render: (id: string) => prompts.find(prompt => prompt.id === id)?.type || '未设置' },
          { title: '文章完成日期', dataIndex: 'deadline', width: 130 },
          { title: '状态', dataIndex: 'state', width: 115, render: (value, row) => <Space direction="vertical" size={0}><Tag color={value === 'completed' ? 'green' : value === 'failed' ? 'red' : 'blue'}>{({ pending: '待分析', analyzing: '分析中', ready: '待创建', failed: '失败', creating: '创建中', generating: '写作中', completed: '已写作' } as Record<string, string>)[value] || value}</Tag>{row.lastError && <Text type="danger" style={{ maxWidth: 160 }} ellipsis={{ tooltip: row.lastError }}>{row.lastError}</Text>}</Space> },
          { title: '操作', width: 240, fixed: 'right', render: (_, row) => <Space><Button size="small" disabled={busy || !!row.taskId} onClick={() => openEditor(row)}>修改</Button>{row.state === 'failed' && !row.taskId && <Button size="small" disabled={busy} onClick={() => void runAnalysis(batch, row.id)}>重试分析</Button>}{row.state === 'failed' && row.taskId && <Button size="small" disabled={busy} onClick={() => void retryOne(row)}>重试写作</Button>}<Popconfirm title="删除候选任务？" onConfirm={() => void removeCandidate(row.id)}><Button size="small" danger disabled={busy || !!row.taskId}>删除</Button></Popconfirm></Space> },
        ]} />
      </Card>
      <Card title="整批配置与自动写作">
        <Space wrap>
          <span>文章数 <InputNumber min={1} value={batchQuantity} onChange={value => setBatchQuantity(value || 1)} /></span>
          <span>发布网站 <Select mode="multiple" style={{ width: 280 }} value={batchWebsites} onChange={setBatchWebsites} options={websites.map(site => ({ value: site.id, label: `${site.name} (${site.platform})` }))} /></span>
          <span>文章提示词 <Select style={{ width: 240 }} value={batchPrompt || undefined} onChange={setBatchPrompt} options={prompts.map(prompt => ({ value: prompt.id, label: prompt.type }))} /></span>
          <span>文章完成日期 <DatePicker value={batchDeadline} onChange={value => setBatchDeadline(value || dayjs())} /></span>
          <Button onClick={() => void applyBatchConfig()} disabled={busy}>应用整批配置</Button>
        </Space>
        <div style={{ marginTop: 16 }}><Button type="primary" disabled={busy || !batch.candidates.length} onClick={() => void startGeneration()}>创建任务并立即 AI 写作</Button><Text type="secondary" style={{ marginLeft: 12 }}>成功文章会保留在“内容生成者 → 未生成”，并标记为排名分析表任务。</Text></div>
      </Card>
    </>}
    <Modal title={editingId ? '修改候选任务' : '新增候选任务'} open={editorOpen} onOk={() => void saveEditor()} onCancel={() => setEditorOpen(false)} width={700} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="keyword" label="关键词" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="title" label="任务标题" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="scenario" label="竞品首推场景" rules={[{ required: true }]}><TextArea rows={2} /></Form.Item>
        <Form.Item name="objective" label="写作目标" rules={[{ required: true }]}><TextArea rows={3} /></Form.Item>
        <Space align="start" wrap>
          <Form.Item name="quantity" label="文章数"><InputNumber min={1} /></Form.Item>
          <Form.Item name="websites" label="发布网站"><Select mode="multiple" style={{ width: 210 }} options={websites.map(site => ({ value: site.id, label: site.name }))} /></Form.Item>
          <Form.Item name="promptId" label="文章提示词"><Select style={{ width: 190 }} options={prompts.map(prompt => ({ value: prompt.id, label: prompt.type }))} /></Form.Item>
          <Form.Item name="deadline" label="文章完成日期"><Input type="date" /></Form.Item>
        </Space>
      </Form>
    </Modal>
  </Space>;
}
