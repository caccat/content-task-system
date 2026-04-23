import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, List, Badge, Tag, Button, Modal, Input, message, Typography, Space, Progress, Popconfirm, Select, Row, Col, DatePicker, Table, Checkbox, Spin, Alert, Empty, Tabs, Radio, Tooltip } from 'antd';
import { EditOutlined, FileTextOutlined, DeleteOutlined, ExclamationCircleOutlined, CheckCircleOutlined, UndoOutlined, CalendarOutlined, RobotOutlined, UserOutlined, LoadingOutlined, SyncOutlined, StopOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useTasks, useArticles } from '../hooks/useSupabase';
import { useSettings } from '../hooks/useSettings';
import { usePrompts } from '../hooks/usePrompts';
import { useWebsites } from '../hooks/useWebsites';
import { supabase } from '../supabase';
import type { TaskWithArticles, Article } from '../types';
import { CITIES } from '../types';
import dayjs from 'dayjs';
import RichTextEditor from './RichTextEditor';

const { Text, Title } = Typography;
const { TabPane } = Tabs;

// 将换行符转换为 HTML 标签
function convertNewlinesToHtml(text: string): string {
  if (!text) return '';
  // 先按双换行分割段落，再按单换行转<br>
  const paragraphs = text.split(/\n\n+/);
  const htmlParagraphs = paragraphs.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    // 将单换行替换为 <br>
    const withBreaks = trimmed.replace(/\n/g, '<br>');
    return `<p style="margin:8px 0;line-height:1.6;">${withBreaks}</p>`;
  }).filter(Boolean);
  return htmlParagraphs.join('');
}

// localStorage 存取标题和额外要求（仅限用户浏览器）
const ARTICLE_DATA_KEY = 'content_task_article_data';
const ARTICLE_DRAFT_KEY = 'content_task_article_drafts'; // 文章草稿自动保存

function saveArticleData(taskId: string, title: string, extraRequirement: string = '') {
  try {
    const stored = localStorage.getItem(ARTICLE_DATA_KEY);
    const data = stored ? JSON.parse(stored) : {};
    data[taskId] = { title, extraRequirement };
    localStorage.setItem(ARTICLE_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

function getArticleData(taskId: string): { title: string | null; extraRequirement: string } {
  try {
    const stored = localStorage.getItem(ARTICLE_DATA_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        title: data[taskId]?.title || null,
        extraRequirement: data[taskId]?.extraRequirement || ''
      };
    }
  } catch (e) {
    console.error('读取数据失败:', e);
  }
  return { title: null, extraRequirement: '' };
}

// 文章草稿自动保存
function saveArticleDraft(articleId: string, content: string) {
  try {
    const stored = localStorage.getItem(ARTICLE_DRAFT_KEY);
    const drafts = stored ? JSON.parse(stored) : {};
    drafts[articleId] = { content, savedAt: Date.now() };
    localStorage.setItem(ARTICLE_DRAFT_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('保存草稿失败:', e);
  }
}

function getArticleDraft(articleId: string): string | null {
  try {
    const stored = localStorage.getItem(ARTICLE_DRAFT_KEY);
    if (stored) {
      const drafts = JSON.parse(stored);
      return drafts[articleId]?.content || null;
    }
  } catch (e) {
    console.error('读取草稿失败:', e);
  }
  return null;
}

function clearArticleDraft(articleId: string) {
  try {
    const stored = localStorage.getItem(ARTICLE_DRAFT_KEY);
    if (stored) {
      const drafts = JSON.parse(stored);
      delete drafts[articleId];
      localStorage.setItem(ARTICLE_DRAFT_KEY, JSON.stringify(drafts));
    }
  } catch (e) {
    console.error('清除草稿失败:', e);
  }
}

// 兼容旧版本
function saveArticleTitle(taskId: string, title: string) {
  saveArticleData(taskId, title, '');
}

function getArticleTitle(taskId: string): string | null {
  return getArticleData(taskId).title;
}

// 批量生成标题编辑器子组件
function BatchTitleEditor({ 
  tasks, 
  onConfirm 
}: { 
  tasks: TaskWithArticles[]; 
  onConfirm: (data: { title: string; extraRequirement: string }[])=> void;
}) {
  // 存储每个任务的标题和额外要求
  const [batchData, setBatchData] = useState<Record<string, { title: string; extraRequirement: string }>>(() => {
    const initial: Record<string, { title: string; extraRequirement: string }> = {};
    tasks.forEach((task) => {
      const savedTitle = getArticleTitle(task.id);
      initial[task.id] = {
        title: savedTitle || `${task.city}相关文章`,
        extraRequirement: task.writing_suggestions || '', // 从任务读取默认额外要求
      };
    });
    return initial;
  });

  // 更新某个任务的数据
  const updateData = (taskId: string, field: 'title' | 'extraRequirement', value: string) => {
    setBatchData(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value }
    }));
  };

  // 复制当前行的额外要求
  const copyExtraRequirement = (taskId: string) => {
    const text = batchData[taskId]?.extraRequirement || '';
    navigator.clipboard.writeText(text);
    message.success('已复制额外要求');
  };

  // 清空当前行的额外要求
  const clearExtraRequirement = (taskId: string) => {
    updateData(taskId, 'extraRequirement', '');
  };

  // 粘贴额外要求到当前行
  const pasteExtraRequirement = async (taskId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      updateData(taskId, 'extraRequirement', text);
      message.success('已粘贴额外要求');
    } catch {
      message.error('粘贴失败');
    }
  };

  // 将第一行的额外要求应用到所有行
  const applyToAll = () => {
    const firstTaskId = tasks[0]?.id;
    if (!firstTaskId) return;
    const firstExtra = batchData[firstTaskId]?.extraRequirement || '';
    if (!firstExtra) return;
    
    const updated = { ...batchData };
    tasks.forEach(task => {
      updated[task.id] = { ...updated[task.id], extraRequirement: firstExtra };
    });
    setBatchData(updated);
    message.success('已应用到所有行');
  };

  // 检查所有行的额外要求是否相同
  const isAllExtraSame = () => {
    if (tasks.length <= 1) return true;
    const firstExtra = batchData[tasks[0]?.id]?.extraRequirement || '';
    return tasks.every(t => (batchData[t.id]?.extraRequirement || '') === firstExtra);
  };

  const firstTaskId = tasks[0]?.id;
  const showApplyToAll = firstTaskId && batchData[firstTaskId]?.extraRequirement;

  return (
    <div style={{ padding: '8px 0', maxHeight: 500, overflowY: 'auto' }}>
      <p style={{ marginBottom: 12, color: '#666' }}>
        请为每个任务输入标题和额外要求（共 {tasks.length} 个任务）：
      </p>
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 6 }}>
        {/* 表头 */}
        <div style={{ 
          display: 'flex', 
          background: '#fafafa', 
          padding: '10px 12px', 
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 500,
          fontSize: 13
        }}>
          <div style={{ width: 80 }}>城市</div>
          <div style={{ width: 180, flex: 'none' }}>标题</div>
          <div style={{ flex: 1 }}>额外要求</div>
          <div style={{ width: 160, flex: 'none', textAlign: 'center' }}>操作</div>
        </div>
        {/* 表格行 */}
        {tasks.map((task, idx) => (
          <div key={task.id} style={{ 
            display: 'flex', 
            padding: '8px 12px', 
            borderBottom: idx < tasks.length - 1 ? '1px solid #f0f0f0' : 'none',
            alignItems: 'center'
          }}>
            <div style={{ width: 80, fontWeight: 500, color: '#1890ff' }}>
              {task.city}
            </div>
            <div style={{ width: 180, flex: 'none' }}>
              <Input
                value={batchData[task.id]?.title || ''}
                onChange={(e) => updateData(task.id, 'title', e.target.value)}
                placeholder="输入文章标题"
                size="small"
              />
            </div>
            <div style={{ flex: 1, marginLeft: 8 }}>
              <Input.TextArea
                value={batchData[task.id]?.extraRequirement || ''}
                onChange={(e) => updateData(task.id, 'extraRequirement', e.target.value)}
                placeholder="输入额外要求（可选）"
                size="small"
                rows={1}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: 160, flex: 'none', textAlign: 'right' }}>
              <Space size="small">
                <Button size="small" onClick={() => copyExtraRequirement(task.id)}>
                  复制
                </Button>
                {idx === 0 ? (
                  showApplyToAll ? (
                    <Button 
                      size="small" 
                      type={isAllExtraSame() ? 'default' : 'primary'}
                      onClick={applyToAll}
                      disabled={isAllExtraSame()}
                    >
                      {isAllExtraSame() ? '已同步 ✓' : '应用到所有'}
                    </Button>
                  ) : null
                ) : (
                  <Button size="small" onClick={() => pasteExtraRequirement(task.id)}>
                    粘贴
                  </Button>
                )}
                <Button size="small" danger onClick={() => clearExtraRequirement(task.id)}>
                  清空
                </Button>
              </Space>
            </div>
          </div>
        ))}
      </div>
      <Button 
        type="primary" 
        block 
        style={{ marginTop: 16 }}
        onClick={() => {
          const data = tasks.map(t => ({
            title: batchData[t.id]?.title?.trim() || `${t.city}相关文章`,
            extraRequirement: batchData[t.id]?.extraRequirement?.trim() || '',
          }));
          if (data.some(d => !d.title)) {
            message.warning('请确保所有任务都填写了标题');
            return;
          }
          onConfirm(data);
        }}
      >
        开始生成
      </Button>
    </div>
  );
}

// 单个任务编辑器组件
function SingleTaskEditor({
  task,
  onConfirm,
  onCancel
}: {
  task: TaskWithArticles;
  onConfirm: (title: string, extraRequirement: string) => void;
  onCancel: () => void;
}) {
  const articleData = getArticleData(task.id);
  const [title, setTitle] = useState(() => articleData.title || `${task.city}相关文章`);
  const [extraRequirement, setExtraRequirement] = useState(articleData.extraRequirement);

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>城市：{task.city}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>文章标题：</p>
        <Input.TextArea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入文章标题，例如：人工智能在内容生产中的应用与未来"
          rows={2}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>额外要求（可选）：</p>
        <Input.TextArea
          value={extraRequirement}
          onChange={(e) => setExtraRequirement(e.target.value)}
          placeholder="输入额外要求，例如：必须生成表格、字数1500字以上等"
          rows={3}
          style={{ width: '100%' }}
        />
        <p style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
          额外要求会追加到提示词后面，指导 AI 生成更符合需求的内容
        </p>
      </div>
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>取消</Button>
        <Button
          type="primary"
          disabled={!title.trim()}
          onClick={() => onConfirm(title.trim(), extraRequirement.trim())}
        >
          开始生成
        </Button>
      </Space>
    </div>
  );
}

// 重新生成编辑器组件
function RetryTaskEditor({
  task,
  onConfirm,
  onCancel
}: {
  task: TaskWithArticles;
  onConfirm: (title: string, extraRequirement: string) => void;
  onCancel: () => void;
}) {
  const articleData = getArticleData(task.id);
  const [title, setTitle] = useState(() => articleData.title || `${task.city}相关文章`);
  const [extraRequirement, setExtraRequirement] = useState(articleData.extraRequirement);

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>城市：{task.city}</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>文章标题：</p>
        <Input.TextArea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入文章标题，例如：人工智能在内容生产中的应用与未来"
          rows={2}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ marginBottom: 8, fontWeight: 500 }}>额外要求（可选）：</p>
        <Input.TextArea
          value={extraRequirement}
          onChange={(e) => setExtraRequirement(e.target.value)}
          placeholder="输入额外要求，例如：必须生成表格、字数1500字以上等"
          rows={3}
          style={{ width: '100%' }}
        />
        <p style={{ marginTop: 4, fontSize: 12, color: '#888' }}>
          额外要求会追加到提示词后面，指导 AI 生成更符合需求的内容
        </p>
      </div>
      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>取消</Button>
        <Button
          type="primary"
          disabled={!title.trim()}
          onClick={() => onConfirm(title.trim(), extraRequirement.trim())}
        >
          重新生成
        </Button>
      </Space>
    </div>
  );
}

// 发送飞书通知
const sendFeishuNotification = async (webhook: string, task: TaskWithArticles, article: Article) => {
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: {
          text: `📢 新内容待发布\n\n任务：${task.city}\n文章状态：准备发布\n截止日期：${dayjs(task.deadline).format('YYYY-MM-DD')}\n\n请尽快安排发布。`
        }
      })
    });
    
    if (!response.ok) {
      console.error('飞书通知发送失败:', await response.text());
    }
  } catch (error) {
    console.error('发送飞书通知出错:', error);
  }
};

// 状态标签组件
const StatusTag = ({ status, aiStatus }: { status: string; aiStatus?: string | null }) => {
  if (aiStatus === 'pending') {
    return <Tag icon={<LoadingOutlined />} color="default">排队中</Tag>;
  }
  if (aiStatus === 'generating') {
    return <Tag icon={<SyncOutlined spin />} color="processing">生成中</Tag>;
  }
  if (aiStatus === 'failed') {
    return <Tag color="error">生成失败</Tag>;
  }
  if (aiStatus === 'completed') {
    return <Tag icon={<RobotOutlined />} color="success">🤖 AI草稿</Tag>;
  }
  
  switch (status) {
    case 'published':
      return <Tag color="success">已发布</Tag>;
    case 'ready':
      return <Tag color="processing">准备发布</Tag>;
    default:
      return <Tag color="default">草稿</Tag>;
  }
};

// 文章编辑器组件
function ArticleEditor({ task, visible, onClose, settings }: { task: TaskWithArticles; visible: boolean; onClose: () => void; settings: Record<string, string> }) {
  const { articles, updateArticle, loading } = useArticles(task.id);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [content, setContent] = useState('');
  const [promptDetailVisible, setPromptDetailVisible] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<any>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const originalContentRef = useRef<string>(''); // 记录打开时的原始内容

  // 自动保存草稿（防抖 2 秒）
  useEffect(() => {
    // 只要内容和原始内容不同，就保存
    if (editingArticle && content !== originalContentRef.current) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        if (editingArticle) {
          saveArticleDraft(editingArticle.id, content);
        }
      }, 2000);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, editingArticle]);

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    // 优先读取自动保存的草稿，否则用数据库内容
    const draft = getArticleDraft(article.id);
    const initialContent = draft || article.content;
    setContent(initialContent);
    originalContentRef.current = initialContent; // 更新原始内容
  };

  const handleSave = async () => {
    if (!editingArticle) return;
    try {
      await updateArticle(editingArticle.id, {
        content,
        status: editingArticle.status,
      });
      // 清除自动保存的草稿
      clearArticleDraft(editingArticle.id);
      message.success('文章已保存');
      setEditingArticle(null);
    } catch {
      message.error('保存失败');
    }
  };

  const handleMarkReady = async (article: Article, settings: Record<string, string>) => {
    try {
      await updateArticle(article.id, { status: 'ready' });
      message.success('已标记为准备发布');

      const notifyMode = settings['feishu_notify_mode'] || 'immediate';
      const feishuWebhook = settings['feishu_webhook'];

      if (feishuWebhook && notifyMode === 'immediate') {
        await sendFeishuNotification(feishuWebhook, task, article);
      }

      // 成功后关闭弹窗
      onClose();
    } catch {
      message.error('操作失败');
    }
  };

  const handleCancelReady = async (article: Article) => {
    try {
      await updateArticle(article.id, { status: 'draft' });
      message.success('已取消，恢复为草稿');
    } catch {
      message.error('操作失败');
    }
  };

  const { websites, loading: websitesLoading } = useWebsites();
  const { prompts, loading: promptsLoading } = usePrompts();

  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websitesLoading || websites.length === 0) return ['加载中...'];
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const getPromptTypeLabel = (promptTypeId: string) => {
    if (promptsLoading || prompts.length === 0) return '加载中...';
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  };

  const getPrompt = (promptTypeId: string) => {
    return prompts.find((p: any) => p.id === promptTypeId);
  };

  const handleViewPromptDetail = () => {
    const prompt = getPrompt(task.prompt_type);
    if (prompt) {
      setSelectedPrompt(prompt);
      setPromptDetailVisible(true);
    }
  };

  return (
    <Modal
      title={`编辑文章 - ${task.city}`}
      open={visible}
      onCancel={onClose}
      width={900}
      footer={null}
    >
      <div style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>发布城市：</Text>
            <Tag color="blue">{task.city}</Tag>
            {task.generation_mode === 'ai' && <Tag icon={<RobotOutlined />} color="purple">AI模式</Tag>}
          </div>
          <div>
            <Text strong>发布网站：</Text>
            {getWebsiteLabels(task.websites).map((site, idx) => (
              <Tag key={idx} color="green">{site}</Tag>
            ))}
          </div>
          <div>
            <Text strong>提示词类型：</Text>
            <Tag 
              color="purple" 
              style={{ cursor: 'pointer' }}
              onClick={handleViewPromptDetail}
            >
              {getPromptTypeLabel(task.prompt_type)}（点击查看详情）
            </Tag>
          </div>
          {task.writing_suggestions && (
            <div>
              <Text strong>写作建议：</Text>
              <Text type="secondary">{task.writing_suggestions}</Text>
            </div>
          )}
          <div>
            <Text strong>完成日期：</Text>
            <Text>{dayjs(task.deadline).format('YYYY-MM-DD')}</Text>
          </div>
        </Space>
      </div>

      <Progress
        percent={Math.round((task.completedCount / task.quantity) * 100)}
        status={task.completedCount === task.quantity ? 'success' : 'active'}
        format={() => `${task.completedCount}/${task.quantity}`}
        style={{ marginBottom: 16 }}
      />

      <List
        loading={loading}
        dataSource={articles}
        locale={{ emptyText: '暂无文章，请检查任务是否正确创建' }}
        renderItem={(article, index) => (
          <List.Item
            actions={[
              article.status === 'ready' ? (
                <Popconfirm
                  key="cancel"
                  title="取消准备发布"
                  description="确定要取消吗？文章将恢复为草稿状态。"
                  onConfirm={() => handleCancelReady(article)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button icon={<UndoOutlined />} size="small">取消发布</Button>
                </Popconfirm>
              ) : article.status !== 'published' ? (
                <Button
                  key="ready"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleMarkReady(article, settings)}
                  size="small"
                  disabled={!article.content}
                  title={!article.content ? '请先编辑添加内容' : ''}
                >
                  准备发布
                </Button>
              ) : null,
              <Button
                key="edit"
                type={article.status === 'ready' || article.status === 'published' ? 'default' : 'primary'}
                icon={<EditOutlined />}
                onClick={() => handleEdit(article)}
                size="small"
              >
                {article.content ? '编辑' : '添加内容'}
              </Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<Badge count={index + 1} style={{ backgroundColor: '#1890ff' }} />}
              title={`文章 ${index + 1}`}
              description={
                <Space>
                  <StatusTag status={article.status} />
                  {article.content && (
                    <Text type="secondary" ellipsis style={{ maxWidth: 300 }}>
                      {article.content.substring(0, 50)}...
                    </Text>
                  )}
                </Space>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        title={`编辑文章 ${editingArticle && articles ? articles.findIndex(a => a.id === editingArticle.id) + 1 : ''}`}
        open={!!editingArticle}
        onCancel={() => setEditingArticle(null)}
        onOk={handleSave}
        width={900}
        okText="保存"
        cancelText="取消"
        styles={{ body: { paddingBottom: 60 } }}
      >
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="请输入文章内容，使用工具栏设置样式、插入图片等..."
        />
      </Modal>

      {/* 提示词详情弹窗 */}
      <Modal
        title={`📝 ${selectedPrompt?.type || '提示词详情'}`}
        open={promptDetailVisible}
        onCancel={() => setPromptDetailVisible(false)}
        footer={null}
        width={700}
      >
        {selectedPrompt && (
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 14 }}>提示词内容：</Text>
              <div style={{ 
                background: '#f5f5f5', 
                padding: 16, 
                borderRadius: 8, 
                marginTop: 8,
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                lineHeight: 1.8
              }}>
                {selectedPrompt.content || '暂无内容'}
              </div>
            </div>
            {/* 多个示例链接 */}
            {(selectedPrompt.example_urls?.length > 0 || selectedPrompt.example_url) && (
              <div style={{ marginTop: 16 }}>
                <Text strong style={{ fontSize: 14 }}>文章示例：</Text>
                <div style={{ marginTop: 8 }}>
                  {/* 兼容旧数据：只有一个 example_url */}
                  {selectedPrompt.example_urls?.length > 0 ? (
                    selectedPrompt.example_urls.map((ex: any, index: number) => (
                      <div 
                        key={index}
                        style={{ 
                          background: '#f0f9ff', 
                          padding: 12, 
                          borderRadius: 8, 
                          marginBottom: index < selectedPrompt.example_urls.length - 1 ? 8 : 0,
                          border: '1px solid #91d5ff'
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {ex.note || `示例 ${index + 1}：`}
                        </Text>
                        <a 
                          href={ex.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ marginLeft: 8, wordBreak: 'break-all' }}
                        >
                          {ex.url}
                        </a>
                      </div>
                    ))
                  ) : selectedPrompt.example_url ? (
                    <div style={{ 
                      background: '#f0f9ff', 
                      padding: 12, 
                      borderRadius: 8, 
                      border: '1px solid #91d5ff'
                    }}>
                      <Text type="secondary">示例链接：</Text>
                      <a 
                        href={selectedPrompt.example_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ marginLeft: 8, wordBreak: 'break-all' }}
                      >
                        {selectedPrompt.example_url}
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Modal>
  );
}

// 人工生成区组件
function ManualGenerateSection({
  tasks,
  loading,
  selectedRowKeys,
  setSelectedRowKeys,
  onSwitchToAi,
  onEditTask,
  onDeleteTask,
  refreshTasks,
  websites,
  prompts,
}: {
  tasks: TaskWithArticles[];
  loading: boolean;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  onSwitchToAi: (taskIds: string[]) => void;
  onEditTask: (task: TaskWithArticles) => void;
  onDeleteTask: (task: TaskWithArticles, e: React.MouseEvent) => void;
  refreshTasks: () => void;
  websites: any[];
  prompts: any[];
}) {
  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websites.length === 0) return [];
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const getPromptTypeLabel = (promptTypeId: string) => {
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const columns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 100,
    },
    {
      title: '提示词类型',
      dataIndex: 'prompt_type',
      key: 'prompt_type',
      width: 120,
      render: (promptTypeId: string) => getPromptTypeLabel(promptTypeId),
    },
    {
      title: '发布网站',
      dataIndex: 'websites',
      key: 'websites',
      width: 200,
      render: (websites: string[]) => (
        <Space wrap>
          {getWebsiteLabels(websites).map((site, idx) => (
            <Tag key={idx} color="green">{site}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '文章数',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (deadline: string) => dayjs(deadline).format('YYYY-MM-DD'),
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_: any, record: TaskWithArticles) => {
        const hasContent = record.articles.some(a => a.content);
        return hasContent ? <Tag color="processing">有内容</Tag> : <Tag color="default">空白</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TaskWithArticles) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => onEditTask(record)}
            size="small"
          >
            人工编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除此任务吗？"
            onConfirm={() => onDeleteTask(record, { stopPropagation: () => {} } as any)}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">
          共 {tasks.length} 个任务{tasks.filter(t => t.articles.some(a => a.content)).length > 0 && `（其中 ${tasks.filter(t => t.articles.some(a => a.content)).length} 个已有内容）`}
        </Text>
        {selectedRowKeys.length > 0 && (
          <Button
            type="primary"
            icon={<RobotOutlined />}
            onClick={() => onSwitchToAi(selectedRowKeys as string[])}
          >
            🤖 转为 AI 生成 ({selectedRowKeys.length})
          </Button>
        )}
      </div>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={false}
        rowKey="id"
        locale={{ emptyText: '暂无人工生成任务' }}
      />
    </div>
  );
}

// AI 生成区组件
function AiGenerateSection({
  tasks,
  loading,
  onRetry,
  onSwitchToManual,
  onEditTask,
  onCancelGeneration,
  websites,
  prompts,
}: {
  tasks: TaskWithArticles[];
  loading: boolean;
  onRetry: (taskId: string) => void;
  onSwitchToManual: (taskIds: string[]) => void;
  onEditTask: (task: TaskWithArticles) => void;
  onCancelGeneration: (taskId: string) => void;
  websites: any[];
  prompts: any[];
}) {
  const [activeTab, setActiveTab] = useState('generating');

  // 分类任务
  const generatingTasks = tasks.filter(t => t.ai_status === 'pending' || t.ai_status === 'generating');
  const completedTasks = tasks.filter(t => {
    // 只显示 AI 状态为 completed 的任务
    if (t.ai_status !== 'completed') return false;
    // 排除所有文章都是 ready/published 的任务（这些应该去待发布列表）
    if (t.articles.length > 0 && t.articles.every(a => a.status === 'ready' || a.status === 'published')) return false;
    return true;
  });
  const failedTasks = tasks.filter(t => t.ai_status === 'failed');
  // 其他状态（null, undefined 等）
  const otherTasks = tasks.filter(t =>
    !['pending', 'generating', 'completed', 'failed'].includes(t.ai_status || '')
  );

  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websites.length === 0) return [];
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const getPromptTypeLabel = (promptTypeId: string) => {
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  };

  const renderTaskCard = (task: TaskWithArticles, showActions: boolean = true) => (
    <Card
      key={task.id}
      size="small"
      style={{ marginBottom: 12 }}
      extra={
        showActions && (
          <Space>
            {task.ai_status === 'pending' && (
              <>
                <Tooltip title="取消 AI 生成，转为人工编辑">
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => onSwitchToManual([task.id])}
                    size="small"
                  >
                    取消
                  </Button>
                </Tooltip>
              </>
            )}
            {task.ai_status === 'generating' && (
              <Popconfirm
                title="取消生成"
                description="确定要取消正在进行的 AI 生成吗？"
                onConfirm={() => {
                  onCancelGeneration(task.id);
                }}
                okText="确定"
                cancelText="取消"
              >
                <Button danger size="small" icon={<CloseCircleOutlined />}>
                  取消
                </Button>
              </Popconfirm>
            )}
            {task.ai_status === 'completed' && (
              <>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => onEditTask(task)}
                  size="small"
                >
                  修改草稿
                </Button>
                <Button
                  icon={<SyncOutlined />}
                  onClick={() => onRetry(task.id)}
                  size="small"
                >
                  重新生成
                </Button>
              </>
            )}
            {task.ai_status === 'failed' && (
              <>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={() => onRetry(task.id)}
                  size="small"
                >
                  重试
                </Button>
                <Popconfirm
                  title="转人工"
                  description="取消后文章内容将清空，确定吗？"
                  onConfirm={() => onSwitchToManual([task.id])}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button size="small" icon={<UserOutlined />}>
                    转人工
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        )
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Text strong style={{ fontSize: 16 }}>{task.city}</Text>
            {getWebsiteLabels(task.websites).map((site, idx) => (
              <Tag key={idx} color="green">{site}</Tag>
            ))}
          </Space>
          <StatusTag status="draft" aiStatus={task.ai_status} />
        </div>
        <Text type="secondary">
          提示词类型：{getPromptTypeLabel(task.prompt_type)} | 
          文章数：{task.quantity} | 
          截止：{dayjs(task.deadline).format('YYYY-MM-DD')}
        </Text>
        {task.writing_suggestions && (
          <Text type="secondary" ellipsis>
            写作建议：{task.writing_suggestions}
          </Text>
        )}
        {task.ai_status === 'generating' && (
          <Progress percent={50} size="small" status="active" />
        )}
        {task.ai_status === 'pending' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            <LoadingOutlined spin /> 等待 AI 处理中...
          </Text>
        )}
      </Space>
    </Card>
  );

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={[
          {
            key: 'generating',
            label: (
              <span>
                {generatingTasks.length > 0 ? (
                  <LoadingOutlined spin /> 
                ) : (
                  <FileTextOutlined />
                )} 生成中
                {generatingTasks.length > 0 && ` (${generatingTasks.length})`}
              </span>
            ),
            children: (
              <div>
                {generatingTasks.length === 0 ? (
                  <Empty description="暂无正在生成的任务" />
                ) : (
                  generatingTasks.map(task => renderTaskCard(task))
                )}
              </div>
            ),
          },
          {
            key: 'completed',
            label: (
              <span>
                <CheckCircleOutlined /> 已完成草稿
                {completedTasks.length > 0 && ` (${completedTasks.length})`}
              </span>
            ),
            children: (
              <div>
                {completedTasks.length === 0 ? (
                  <Empty description="暂无已完成的草稿" />
                ) : (
                  completedTasks.map(task => renderTaskCard(task))
                )}
              </div>
            ),
          },
          {
            key: 'failed',
            label: (
              <span>
                <StopOutlined /> 生成失败
                {failedTasks.length > 0 && ` (${failedTasks.length})`}
              </span>
            ),
            children: (
              <div>
                {failedTasks.length === 0 ? (
                  <Empty description="暂无生成失败的任务" />
                ) : (
                  failedTasks.map(task => renderTaskCard(task))
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

// 待发布页面组件（简单列表，不需要人工/AI区分）
function ReadyPublishSection({
  tasks,
  loading,
  onEditTask,
  onDeleteTask,
  websites,
  prompts,
}: {
  tasks: TaskWithArticles[];
  loading: boolean;
  onEditTask: (task: TaskWithArticles) => void;
  onDeleteTask: (task: TaskWithArticles, e: React.MouseEvent) => void;
  websites: any[];
  prompts: any[];
}) {
  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websites.length === 0) return [];
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const getPromptTypeLabel = (promptTypeId: string) => {
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  };

  const columns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 100,
    },
    {
      title: '提示词类型',
      dataIndex: 'prompt_type',
      key: 'prompt_type',
      width: 120,
      render: (promptTypeId: string) => getPromptTypeLabel(promptTypeId),
    },
    {
      title: '发布网站',
      dataIndex: 'websites',
      key: 'websites',
      width: 200,
      render: (websites: string[]) => (
        <Space wrap>
          {getWebsiteLabels(websites).map((site, idx) => (
            <Tag key={idx} color="green">{site}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '文章数',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty: number, record: TaskWithArticles) => `${record.completedCount}/${qty}`,
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (deadline: string) => dayjs(deadline).format('YYYY-MM-DD'),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => <Tag color="processing">准备发布</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TaskWithArticles) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => onEditTask(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除此任务吗？"
            onConfirm={() => onDeleteTask(record, { stopPropagation: () => {} } as any)}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        共 {tasks.length} 个任务待发布
      </Text>
      <Table
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={false}
        rowKey="id"
        locale={{ emptyText: '暂无待发布的任务' }}
      />
    </div>
  );
}

// 已完成页面组件
function CompletedSection({
  tasks,
  loading,
  onEditTask,
  onDeleteTask,
  websites,
  prompts,
}: {
  tasks: TaskWithArticles[];
  loading: boolean;
  onEditTask: (task: TaskWithArticles) => void;
  onDeleteTask: (task: TaskWithArticles, e: React.MouseEvent) => void;
  websites: any[];
  prompts: any[];
}) {
  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websites.length === 0) return [];
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const getPromptTypeLabel = (promptTypeId: string) => {
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  };

  const columns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 100,
    },
    {
      title: '提示词类型',
      dataIndex: 'prompt_type',
      key: 'prompt_type',
      width: 120,
      render: (promptTypeId: string) => getPromptTypeLabel(promptTypeId),
    },
    {
      title: '发布网站',
      dataIndex: 'websites',
      key: 'websites',
      width: 200,
      render: (websites: string[]) => (
        <Space wrap>
          {getWebsiteLabels(websites).map((site, idx) => (
            <Tag key={idx} color="green">{site}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '文章数',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (qty: number, record: TaskWithArticles) => `${record.completedCount}/${qty}`,
    },
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 120,
      render: (deadline: string) => dayjs(deadline).format('YYYY-MM-DD'),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => <Tag color="success">已完成</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: TaskWithArticles) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => onEditTask(record)}
            size="small"
          >
            查看
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除此任务吗？"
            onConfirm={() => onDeleteTask(record, { stopPropagation: () => {} } as any)}
            okText="删除"
            cancelText="取消"
          >
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        共 {tasks.length} 个任务已完成
      </Text>
      <Table
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={false}
        rowKey="id"
        locale={{ emptyText: '暂无已完成的任务' }}
      />
    </div>
  );
}

// 主组件
interface ContentWriterProps {
  defaultStatus?: string;
  onOpenSettings?: () => void;
}

export default function ContentWriter({ defaultStatus, onOpenSettings }: ContentWriterProps) {
  const { tasks, loading, error, deleteTask, refreshTasks, switchToAiMode, switchToManualMode, updateAiStatus } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithArticles | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // defaultStatus 决定显示模式：draft=未生成(人工/AI双Tab), ready=待发布, completed=已完成
  const [activeTab, setActiveTab] = useState(defaultStatus === 'draft' ? 'manual' : 'manual');
  const { settings } = useSettings();
  const { websites } = useWebsites();
  const { prompts } = usePrompts();

  // 筛选状态
  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterPromptType, setFilterPromptType] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());

  // 批量生成弹窗状态
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchTasks, setBatchTasks] = useState<TaskWithArticles[]>([]);

  // 单个任务生成弹窗状态
  const [singleTaskModalVisible, setSingleTaskModalVisible] = useState(false);
  const [singleTask, setSingleTask] = useState<TaskWithArticles | null>(null);

  // 分类任务（仅针对未生成页面）
  const manualTasks = useMemo(() => {
    return tasks.filter(task => {
      // 只显示人工模式的任务
      if (task.generation_mode !== 'manual') return false;
      // 排除已准备发布的任务（有 ready 状态的文章）
      if (task.articles.some(a => a.status === 'ready' || a.status === 'published')) return false;
      // 日期筛选
      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterPromptType && task.prompt_type !== filterPromptType) return false;
      return true;
    });
  }, [tasks, filterCity, filterPromptType, selectedDate]);

  const aiTasks = useMemo(() => {
    return tasks.filter(task => {
      // 只显示AI模式的任务
      if (task.generation_mode !== 'ai') return false;
      // 排除所有文章都是 ready/published 的任务（这些应该去待发布列表）
      if (task.articles.length > 0 && task.articles.every(a => a.status === 'ready' || a.status === 'published')) return false;
      // 日期筛选
      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterPromptType && task.prompt_type !== filterPromptType) return false;
      return true;
    });
  }, [tasks, filterCity, filterPromptType, selectedDate]);

  // 待发布任务（所有有 ready 状态文章的任务）
  const readyTasks = useMemo(() => {
    return tasks.filter(task => {
      // 至少有一篇文章状态为 ready 或 published
      const hasReadyArticle = task.articles.some(a => a.status === 'ready' || a.status === 'published');
      if (!hasReadyArticle) return false;
      // 没有全部完成（否则应该在已完成里）
      const allPublished = task.articles.every(a => a.status === 'published');
      if (allPublished) return false;
      // 日期筛选
      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterPromptType && task.prompt_type !== filterPromptType) return false;
      return true;
    });
  }, [tasks, filterCity, filterPromptType, selectedDate]);

  // 已完成任务（所有文章都已发布的任务）
  const completedTasks = useMemo(() => {
    return tasks.filter(task => {
      // 所有文章都已发布
      if (task.articles.length === 0 || !task.articles.every(a => a.status === 'published')) return false;
      // 日期筛选
      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterPromptType && task.prompt_type !== filterPromptType) return false;
      return true;
    });
  }, [tasks, filterCity, filterPromptType, selectedDate]);

  const promptTypes = useMemo(() => {
    return prompts.map(p => ({ id: p.id, type: p.type }));
  }, [prompts]);

  // 转为 AI 生成并触发生成（带标题输入）
  const handleSwitchToAi = async (taskIds: string[]) => {
    // 获取需要生成的任务
    const tasksToGenerate = tasks.filter(t => taskIds.includes(t.id));
    
    if (taskIds.length === 1) {
      // 单个任务：显示自定义弹窗
      setSingleTask(tasksToGenerate[0]);
      setSingleTaskModalVisible(true);
    } else {
      // 批量任务：显示弹窗
      setBatchTasks(tasksToGenerate);
      setBatchModalVisible(true);
    }
  };

  // 批量生成确认处理
  const handleBatchGenerate = async (data: { title: string; extraRequirement: string }[]) => {
    setBatchModalVisible(false);
    await generateWithAi(batchTasks, data);
  };
  
  // 实际执行 AI 生成的函数
  const generateWithAi = async (tasksToGenerate: TaskWithArticles[], batchData: { title: string; extraRequirement: string }[]) => {
    try {
      // 1. 先更新任务状态为 AI 模式
      const taskIds = tasksToGenerate.map(t => t.id);
      await switchToAiMode(taskIds);
      setSelectedRowKeys([]);
      setActiveTab('ai');
      refreshTasks();

      // 2. 并行调用 Edge Function 生成文章
      message.loading({ content: `正在调用 AI 生成 ${tasksToGenerate.length} 篇文章...`, key: 'ai-generate' });
      
      const generatePromises = tasksToGenerate.map(async (task, index) => {
        const userTitle = batchData[index]?.title || `${task.city} - ${dayjs(task.deadline).format('MM月DD日')}文章`;
        const extraRequirement = batchData[index]?.extraRequirement || '';
        
        try {
          // 更新状态为生成中
          await updateAiStatus(task.id, 'generating');
          refreshTasks();

          // 调用 Edge Function，传递用户输入的标题和额外要求
          const response = await fetch('/api/generate-articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tasks: [{
                city: task.city,
                prompt_type: task.prompt_type,
                writing_suggestions: task.writing_suggestions || '',
                title: userTitle, // 用户输入的标题
                extra_requirement: extraRequirement, // 用户输入的额外要求
              }],
            }),
          });

          const result = await response.json();

          if (result.success || (result.results && result.results[0]?.success)) {
            // 保存生成的文章内容（将换行符转换为 HTML）
            const articleContent = result.results?.[0]?.content;
            if (articleContent && task.articles.length > 0) {
              await supabase
                .from('articles')
                .update({
                  content: convertNewlinesToHtml(articleContent),
                  status: 'draft',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', task.articles[0].id);
            }
            // 保存标题和额外要求到浏览器 localStorage
            saveArticleData(task.id, userTitle, extraRequirement);
            // 更新状态为已完成
            await updateAiStatus(task.id, 'completed');
          } else {
            // 生成失败
            const errorMsg = result.error || result.results?.[0]?.error || '未知错误';
            message.error({ content: `${task.city}: ${errorMsg}`, key: 'ai-error' });
            await updateAiStatus(task.id, 'failed');
          }
        } catch (err: any) {
          console.error(`生成失败:`, err);
          await updateAiStatus(task.id, 'failed');
        }
        refreshTasks();
      });

      // 并行执行所有生成
      await Promise.all(generatePromises);
      
      message.success({ content: `AI 生成完成！`, key: 'ai-generate' });
      refreshTasks();
    } catch {
      message.error('操作失败');
    }
  };

  // 转为人工生成
  const handleSwitchToManual = async (taskIds: string[]) => {
    try {
      await switchToManualMode(taskIds);
      message.success(`已成功将 ${taskIds.length} 个任务转为人工生成`);
      refreshTasks();
    } catch {
      message.error('操作失败');
    }
  };

  // 取消 AI 生成
  const handleCancelGeneration = async (taskId: string) => {
    try {
      await updateAiStatus(taskId, 'failed');
      refreshTasks();
      message.info('已取消 AI 生成');
    } catch {
      message.error('操作失败');
    }
  };

  // 重新生成（带标题输入）
  const [retryModalVisible, setRetryModalVisible] = useState(false);
  const [retryTaskId, setRetryTaskId] = useState<string | null>(null);

  const handleRetry = async (taskId: string) => {
    setRetryTaskId(taskId);
    setRetryModalVisible(true);
  };

  const confirmRetry = async () => {
    const taskId = retryTaskId;
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const titleInput = document.getElementById('retry-title-input') as HTMLTextAreaElement;
    const title = titleInput?.value?.trim();
    
    if (!title) {
      message.warning('请输入文章标题');
      return;
    }

    setRetryModalVisible(false);

    try {
      message.loading({ content: '正在重新生成...', key: 'retry' });
      
      // 更新状态为生成中
      await updateAiStatus(taskId, 'generating');
      refreshTasks();

      // 调用 Edge Function，传递用户输入的标题
      const response = await fetch('/api/generate-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: [{
            city: task.city,
            prompt_type: task.prompt_type,
            writing_suggestions: task.writing_suggestions || '',
            title: title,
          }],
        }),
      });

      const result = await response.json();

      if (result.success || (result.results && result.results[0]?.success)) {
        const articleContent = result.results?.[0]?.content;
        if (articleContent && task.articles.length > 0) {
          await supabase
            .from('articles')
            .update({
              content: convertNewlinesToHtml(articleContent),
              status: 'draft',
              updated_at: new Date().toISOString(),
            })
            .eq('id', task.articles[0].id);
        }
        saveArticleTitle(taskId, title);
        await updateAiStatus(taskId, 'completed');
        message.success({ content: '重新生成成功！', key: 'retry' });
      } else {
        const errorMsg = result.error || result.results?.[0]?.error || '未知错误';
        message.error({ content: `生成失败: ${errorMsg}`, key: 'retry' });
        await updateAiStatus(taskId, 'failed');
      }
      
      refreshTasks();
    } catch {
      message.error('操作失败');
    }
  };

  // 删除任务
  const handleDeleteTask = (task: TaskWithArticles, e: React.MouseEvent) => {
    e.stopPropagation();
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除任务"${task.city}"吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteTask(task.id);
          message.success('任务已删除');
          refreshTasks();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  if (error) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <Title level={3}>内容生成任务列表</Title>
        <Card>
          <Typography.Text type="danger">连接数据库失败，请检查 Supabase 配置</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
{/* 批量生成弹窗 */}
      <Modal
        title="🤖 批量 AI 生成文章"
        open={batchModalVisible}
        onCancel={() => setBatchModalVisible(false)}
        footer={null}
        width={600}
      >
        <BatchTitleEditor
          tasks={batchTasks}
          onConfirm={handleBatchGenerate}
        />
      </Modal>

      {/* 单个任务生成弹窗 */}
      <Modal
        title="🤖 AI 生成文章"
        open={singleTaskModalVisible}
        onCancel={() => setSingleTaskModalVisible(false)}
        footer={null}
        width={500}
      >
        {singleTask && (
          <SingleTaskEditor
            task={singleTask}
            onConfirm={async (title, extraRequirement) => {
              setSingleTaskModalVisible(false);
              await generateWithAi([singleTask], [{ title, extraRequirement }]);
            }}
            onCancel={() => setSingleTaskModalVisible(false)}
          />
        )}
      </Modal>

      {/* 重新生成弹窗 */}
      {retryTaskId && (() => {
        const task = tasks.find(t => t.id === retryTaskId);
        return (
          <Modal
            title="🤖 重新生成文章"
            open={retryModalVisible}
            onCancel={() => setRetryModalVisible(false)}
            footer={null}
            width={500}
          >
            {task && (
              <RetryTaskEditor
                task={task}
                onConfirm={async (title, extraRequirement) => {
                  setRetryModalVisible(false);
                  try {
                    message.loading({ content: '正在重新生成...', key: 'retry' });
                    await updateAiStatus(retryTaskId, 'generating');
                    refreshTasks();

                    const response = await fetch('/api/generate-articles', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tasks: [{
                          city: task.city,
                          prompt_type: task.prompt_type,
                          writing_suggestions: task.writing_suggestions || '',
                          title,
                          extra_requirement: extraRequirement,
                        }],
                      }),
                    });

                    const result = await response.json();
                    if (result.success || (result.results && result.results[0]?.success)) {
                      const content = result.results?.[0]?.content;
                      if (content && task.articles.length > 0) {
                        await supabase
                          .from('articles')
                          .update({
                            content: convertNewlinesToHtml(content),
                            status: 'draft',
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', task.articles[0].id);
                      }
                      saveArticleTitle(retryTaskId, title);
                      await updateAiStatus(retryTaskId, 'completed');
                      message.success({ content: '重新生成成功！', key: 'retry' });
                    } else {
                      const errorMsg = result.error || result.results?.[0]?.error || '未知错误';
                      message.error({ content: `生成失败: ${errorMsg}`, key: 'retry' });
                      await updateAiStatus(retryTaskId, 'failed');
                    }
                    refreshTasks();
                  } catch {
                    message.error('操作失败');
                  }
                }}
                onCancel={() => setRetryModalVisible(false)}
              />
            )}
          </Modal>
        );
      })()}

      {/* 页面标题 */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>内容生成者</Title>
          <Text type="secondary" style={{ fontSize: 14, marginTop: 8, display: 'block' }}>
            管理您的内容生成任务
          </Text>
        </div>
        <Radio.Group
          value={settings['feishu_notify_mode'] || 'immediate'}
          onChange={async (e) => {
            await import('../hooks/useSettings').then(m => m.useSettings().setSetting('feishu_notify_mode', e.target.value));
            message.success(`已切换为${e.target.value === 'immediate' ? '即时通知' : '批量通知'}`);
          }}
          optionType="button"
          buttonStyle="solid"
          options={[
            { label: '即时通知', value: 'immediate' },
            { label: '批量通知', value: 'batch' },
          ]}
        />
      </div>

      {/* 根据页面类型显示不同内容 */}
      {defaultStatus === 'draft' ? (
        <>
          {/* 日期选择和统计（仅未生成页面显示人工/AI统计） */}
          <Card 
            style={{ 
              marginBottom: 24,
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
            }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space align="center" size="middle">
                <CalendarOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                <DatePicker
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  format="YYYY-MM-DD"
                  style={{ width: 140 }}
                />
                <Text style={{ fontSize: 16 }}>
                  人工区 <Text style={{ fontWeight: 'bold', color: '#1890ff' }}>{manualTasks.length}</Text> 个任务，
                  AI区 <Text style={{ fontWeight: 'bold', color: '#722ed1' }}>{aiTasks.length}</Text> 个任务
                </Text>
              </Space>
            </Space>
          </Card>

          {/* 筛选 */}
          <Card 
            style={{ 
              borderRadius: 20, 
              border: 'none',
              background: '#fff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
              marginBottom: 24,
            }}
            bodyStyle={{ padding: '20px 24px' }}
          >
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Space wrap>
                  <Select
                    placeholder="选择城市"
                    value={filterCity}
                    onChange={setFilterCity}
                    allowClear
                    style={{ width: 140, borderRadius: 12 }}
                    bordered={false}
                    options={CITIES.map(city => ({ label: city, value: city }))}
                  />
                  <Select
                    placeholder="选择提示词类型"
                    value={filterPromptType}
                    onChange={setFilterPromptType}
                    allowClear
                    style={{ width: 160, borderRadius: 12 }}
                    bordered={false}
                    options={promptTypes.map(pt => ({ label: pt.type, value: pt.id }))}
                  />
                  {(filterCity || filterPromptType) && (
                    <Button
                      type="link"
                      onClick={() => {
                        setFilterCity(undefined);
                        setFilterPromptType(undefined);
                      }}
                    >
                      清除筛选
                    </Button>
                  )}
                </Space>
              </Col>
            </Row>
          </Card>

          {/* 人工/AI Tab 切换（仅未生成页面） */}
          <Card style={{ borderRadius: 20 }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              type="card"
              items={[
                {
                  key: 'manual',
                  label: (
                    <span>
                      <UserOutlined /> 人工生成
                      {manualTasks.length > 0 && ` (${manualTasks.length})`}
                    </span>
                  ),
                  children: (
                    <ManualGenerateSection
                      tasks={manualTasks}
                      loading={loading}
                      selectedRowKeys={selectedRowKeys}
                      setSelectedRowKeys={setSelectedRowKeys}
                      onSwitchToAi={handleSwitchToAi}
                      onEditTask={setSelectedTask}
                      onDeleteTask={handleDeleteTask}
                      refreshTasks={refreshTasks}
                      websites={websites}
                      prompts={prompts}
                    />
                  ),
                },
                {
                  key: 'ai',
                  label: (
                    <span>
                      <RobotOutlined /> AI 生成
                      {aiTasks.length > 0 && ` (${aiTasks.length})`}
                    </span>
                  ),
                  children: (
                    <AiGenerateSection
                      tasks={aiTasks}
                      loading={loading}
                      onRetry={handleRetry}
                      onSwitchToManual={handleSwitchToManual}
                      onEditTask={setSelectedTask}
                      onCancelGeneration={handleCancelGeneration}
                      websites={websites}
                      prompts={prompts}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </>
      ) : defaultStatus === 'ready' ? (
        <>
          {/* 待发布页面统计 */}
          <Card 
            style={{ 
              marginBottom: 24,
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
            }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space align="center" size="middle">
                <CalendarOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                <DatePicker
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  format="YYYY-MM-DD"
                  style={{ width: 140 }}
                />
                <Text style={{ fontSize: 16 }}>
                  待发布任务 <Text style={{ fontWeight: 'bold', color: '#1890ff' }}>{readyTasks.length}</Text> 个
                </Text>
              </Space>
            </Space>
          </Card>

          {/* 待发布任务列表 */}
          <Card style={{ borderRadius: 20 }}>
            <ReadyPublishSection
              tasks={readyTasks}
              loading={loading}
              onEditTask={setSelectedTask}
              onDeleteTask={handleDeleteTask}
              websites={websites}
              prompts={prompts}
            />
          </Card>
        </>
      ) : (
        <>
          {/* 已完成页面统计 */}
          <Card 
            style={{ 
              marginBottom: 24,
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
            }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space align="center" size="middle">
                <CalendarOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                <DatePicker
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  format="YYYY-MM-DD"
                  style={{ width: 140 }}
                />
                <Text style={{ fontSize: 16 }}>
                  已完成任务 <Text style={{ fontWeight: 'bold', color: '#52c41a' }}>{completedTasks.length}</Text> 个
                </Text>
              </Space>
            </Space>
          </Card>

          {/* 已完成任务列表 */}
          <Card style={{ borderRadius: 20 }}>
            <CompletedSection
              tasks={completedTasks}
              loading={loading}
              onEditTask={setSelectedTask}
              onDeleteTask={handleDeleteTask}
              websites={websites}
              prompts={prompts}
            />
          </Card>
        </>
      )}

      {/* 文章编辑器弹窗 */}
      {selectedTask && (
        <ArticleEditor
          task={selectedTask}
          visible={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          settings={settings}
        />
      )}
    </div>
  );
}
