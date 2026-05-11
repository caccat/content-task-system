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
    console.log('[调试] 保存 localStorage，taskId:', taskId, 'title:', title, 'extraRequirement:', extraRequirement);
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

function getArticleData(taskId: string): { title: string | null; extraRequirement: string } {
  try {
    const stored = localStorage.getItem(ARTICLE_DATA_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      console.log('[调试] 读取 localStorage，taskId:', taskId, '数据:', data[taskId]);
      return {
        title: data[taskId]?.title || null,
        extraRequirement: data[taskId]?.extraRequirement || ''
      };
    }
  } catch (e) {
    console.error('读取数据失败:', e);
  }
  console.log('[调试] localStorage 中没有找到 taskId:', taskId);
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
  onConfirm,
  onSaveData,
}: { 
  tasks: TaskWithArticles[]; 
  onConfirm: (data: { title: string; extraRequirement: string }[])=> void;
  onSaveData?: (taskId: string, title: string, extraRequirement: string) => void;
}) {
  // 存储每个任务的标题和额外要求（优先从数据库字段读取）
  const [batchData, setBatchData] = useState<Record<string, { title: string; extraRequirement: string }>>(() => {
    const initial: Record<string, { title: string; extraRequirement: string }> = {};
    tasks.forEach((task) => {
      // 优先读数据库，再读 localStorage（兼容旧数据），最后用默认值
      const dbTitle = (task as any).user_title || null;
      const dbExtra = (task as any).extra_requirement || '';
      const localData = getArticleTitle(task.id);
      
      initial[task.id] = {
        title: dbTitle || localData || `${task.city}相关文章`,
        extraRequirement: dbExtra || task.writing_suggestions || '',
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
          // 保存每条数据到数据库
          if (onSaveData) {
            tasks.forEach(t => {
              const d = batchData[t.id];
              if (d) onSaveData(t.id, d.title, d.extraRequirement);
            });
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
  onCancel,
  onSaveData,
}: {
  task: TaskWithArticles;
  onConfirm: (title: string, extraRequirement: string) => void;
  onCancel: () => void;
  onSaveData?: (taskId: string, title: string, extraRequirement: string) => void;
}) {
  // 优先从数据库字段读取，再读 localStorage（兼容旧数据）
  const dbTitle = (task as any).user_title || null;
  const dbExtra = (task as any).extra_requirement || '';
  const articleData = getArticleData(task.id);
  
  const [title, setTitle] = useState(() => dbTitle || articleData.title || `${task.city}相关文章`);
  const [extraRequirement, setExtraRequirement] = useState(dbExtra || articleData.extraRequirement);

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
          onClick={() => {
            // 保存到数据库
            if (onSaveData) onSaveData(task.id, title.trim(), extraRequirement.trim());
            onConfirm(title.trim(), extraRequirement.trim());
          }}
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
  onCancel,
  onSaveData,
}: {
  task: TaskWithArticles;
  onConfirm: (title: string, extraRequirement: string) => void;
  onCancel: () => void;
  onSaveData?: (taskId: string, title: string, extraRequirement: string) => void;
}) {
  // 优先从数据库字段读取，再读 localStorage（兼容旧数据）
  const dbTitle = (task as any).user_title || null;
  const dbExtra = (task as any).extra_requirement || '';
  const articleData = getArticleData(task.id);
  
  console.log('[RetryTaskEditor] 初始化数据:', {
    taskId: task.id,
    dbTitle,
    dbExtra,
    localStorageTitle: articleData.title,
    localStorageExtra: articleData.extraRequirement,
    taskKeys: Object.keys(task),
  });
  
  const [title, setTitle] = useState(() => dbTitle || articleData.title || `${task.city}相关文章`);
  const [extraRequirement, setExtraRequirement] = useState(dbExtra || articleData.extraRequirement);

  // 当 task.id 变化时，重新从数据库（优先）或 localStorage 读取数据
  useEffect(() => {
    const dbTitle = (task as any).user_title || null;
    const dbExtra = (task as any).extra_requirement || '';
    const localData = getArticleData(task.id);
    
    console.log('[RetryTaskEditor] useEffect 更新数据:', {
      taskId: task.id,
      dbTitle,
      dbExtra,
      localTitle: localData.title,
      localExtra: localData.extraRequirement,
    });
    
    setTitle(dbTitle || localData.title || `${task.city}相关文章`);
    setExtraRequirement(dbExtra || localData.extraRequirement);
  }, [task.id, task.city, (task as any).user_title, (task as any).extra_requirement]);

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
          onClick={() => {
            // 保存到数据库
            if (onSaveData) onSaveData(task.id, title.trim(), extraRequirement.trim());
            onConfirm(title.trim(), extraRequirement.trim());
          }}
        >
          重新生成
        </Button>
      </Space>
    </div>
  );
}

// 发送飞书通知（通过 API 端点，避免 webhook 暴露在前端）
const sendFeishuNotification = async (task: TaskWithArticles, article: Article) => {
  try {
    // 调用 API 端点发送通知，webhook 地址保存在服务端
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const response = await fetch(`${apiUrl}/api/send-feishu-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: task.city,
        deadline: dayjs(task.deadline).format('YYYY-MM-DD'),
        content: `文章状态：准备发布\n\n请尽快安排发布。`
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
  const { articles, updateArticle, loading, refreshArticles } = useArticles(task.id);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [content, setContent] = useState('');
  const [promptDetailVisible, setPromptDetailVisible] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<any>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalContentRef = useRef<string>(''); // 记录打开时的原始内容
  // 独立的编辑内容标记，用于区分"初始加载"和"用户编辑"
  const editingArticleIdRef = useRef<string | null>(null);

  // 当弹窗打开时，重新获取最新文章数据
  useEffect(() => {
    if (visible) {
      refreshArticles();
    }
  }, [visible, refreshArticles]);

  // 【核心】当 editingArticle 变化时，从文章对象自身设置内容（不依赖 articles 数组）
  // 使用 editingArticleIdRef 防止重复设置
  useEffect(() => {
    if (editingArticle && editingArticle.id !== editingArticleIdRef.current) {
      console.log('[ArticleEditor] editingArticle 变化，从文章对象加载内容:', {
        id: editingArticle.id,
        contentLength: editingArticle.content?.length || 0,
      });
      const newContent = editingArticle.content || '';
      // 优先使用草稿
      const draft = getArticleDraft(editingArticle.id);
      const finalContent = draft || newContent;
      
      setContent(finalContent);
      originalContentRef.current = finalContent;
      editingArticleIdRef.current = editingArticle.id;
      
      console.log('[ArticleEditor] 内容已加载:', { 
        hasDraft: !!draft,
        length: finalContent.length,
      });
    }
    
    // 当编辑器关闭时重置
    if (!editingArticle) {
      editingArticleIdRef.current = null;
    }
  }, [editingArticle?.id]);

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

  const handleEdit = async (article: Article) => {
    console.log('[ArticleEditor.handleEdit] 开始编辑:', article.id);
    
    // 始终从 DB 直接查询最新内容（绕过 articles 数组的 400 问题）
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', article.id)
        .single();
      
      if (data && !error) {
        console.log('[ArticleEditor.handleEdit] DB 查询成功，content 长度:', data.content?.length || 0);
        setEditingArticle(data as Article);
        return;
      }
      console.error('[ArticleEditor.handleEdit] DB 失败，使用传入的 article:', error);
    } catch (err) {
      console.error('[ArticleEditor.handleEdit] 异常:', err);
    }

    // DB 失败时 fallback 到传入的文章对象
    setEditingArticle(article);
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

      // 通过 API 发送通知，webhook 保存在服务端
      if (notifyMode === 'immediate') {
        await sendFeishuNotification(task, article);
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

      {/* key 强制每次打开不同文章时完整重建 Modal 和编辑器，避免状态残留 */}
      <Modal
        key={editingArticle?.id || 'article-editor'}
        title={`编辑文章 ${editingArticle && articles ? articles.findIndex(a => a.id === editingArticle.id) + 1 : ''}`}
        open={!!editingArticle}
        onCancel={() => setEditingArticle(null)}
        onOk={handleSave}
        width={900}
        okText="保存"
        cancelText="取消"
        styles={{ body: { paddingBottom: 60 } }}
        destroyOnHidden  // 关闭时销毁内容
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
        <Space>
          <Text type="secondary">
            共 {tasks.length} 个任务{tasks.filter(t => t.articles.some(a => a.content)).length > 0 && `（其中 ${tasks.filter(t => t.articles.some(a => a.content)).length} 个已有内容）`}
          </Text>
          {tasks.length > 0 && (
            <Button
              type="link"
              size="small"
              onClick={() => setSelectedRowKeys(selectedRowKeys.length === tasks.length ? [] : tasks.map(t => t.id))}
            >
              {selectedRowKeys.length === tasks.length ? '取消全选' : '全选'}
            </Button>
          )}
        </Space>
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
  onBatchRetry,
  onBatchSwitchToManual,
}: {
  tasks: TaskWithArticles[];
  loading: boolean;
  onRetry: (taskId: string) => void;
  onSwitchToManual: (taskIds: string[]) => void;
  onEditTask: (task: TaskWithArticles) => void;
  onCancelGeneration: (taskId: string) => void;
  websites: any[];
  prompts: any[];
  onBatchRetry?: (taskIds: string[]) => void;
  onBatchSwitchToManual?: (taskIds: string[]) => void;
}) {
  const [activeTab, setActiveTab] = useState('generating');
  
  // 失败任务的批量选择
  const [selectedFailedKeys, setSelectedFailedKeys] = useState<React.Key[]>([]);

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
                  <>
                    {/* 批量操作栏 */}
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>
                        <Button
                          size="small"
                          onClick={() => {
                            if (selectedFailedKeys.length === failedTasks.length) {
                              setSelectedFailedKeys([]);
                            } else {
                              setSelectedFailedKeys(failedTasks.map(t => t.id));
                            }
                          }}
                        >
                          {selectedFailedKeys.length === failedTasks.length ? '取消全选' : '全选'}
                        </Button>
                        {selectedFailedKeys.length > 0 && (
                          <Text type="secondary">已选 {selectedFailedKeys.length} 项</Text>
                        )}
                      </Space>
                      <Space>
                        {selectedFailedKeys.length > 0 && (
                          <>
                            <Button
                              type="primary"
                              size="small"
                              icon={<SyncOutlined />}
                              onClick={() => onBatchRetry?.(selectedFailedKeys as string[])}
                            >
                              批量重试 ({selectedFailedKeys.length})
                            </Button>
                            <Popconfirm
                              title={`确定将 ${selectedFailedKeys.length} 个任务转为人工吗？`}
                              description="转人工后文章内容将清空，需重新编辑。"
                              onConfirm={() => onBatchSwitchToManual?.(selectedFailedKeys as string[])}
                              okText="确定"
                              cancelText="取消"
                            >
                              <Button size="small" icon={<UserOutlined />} danger>
                                批量转人工 ({selectedFailedKeys.length})
                              </Button>
                            </Popconfirm>
                          </>
                        )}
                      </Space>
                    </div>
                    {/* 失败任务列表（带复选框） */}
                    {failedTasks.map(task => (
                      <div key={task.id} style={{ position: 'relative' }}>
                        <Checkbox
                          checked={selectedFailedKeys.includes(task.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFailedKeys([...selectedFailedKeys, task.id]);
                            } else {
                              setSelectedFailedKeys(selectedFailedKeys.filter(k => k !== task.id));
                            }
                          }}
                          style={{ position: 'absolute', left: -28, top: 12, zIndex: 1 }}
                        />
                        {renderTaskCard(task)}
                      </div>
                    ))}
                  </>
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
  const { tasks, loading, error, deleteTask, refreshTasks, switchToAiMode, switchToManualMode, updateAiStatus, updateTaskFields } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithArticles | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // defaultStatus 决定显示模式：draft=未生成(人工/AI双Tab), ready=待发布, completed=已完成
  const [activeTab, setActiveTab] = useState(defaultStatus === 'draft' ? 'manual' : 'manual');
  const { settings, setSetting } = useSettings();
  const { websites } = useWebsites();
  const { prompts } = usePrompts();

  // 筛选状态
  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterPromptType, setFilterPromptType] = useState<string | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());

  // 计算逾期任务（截止日期早于今天且未完成的任务，按人工/AI模式分别统计）
  const overdueTasksInfo = useMemo(() => {
    const today = dayjs().startOf('day');
    const overdueTasks = tasks.filter(task => {
      const deadline = dayjs(task.deadline).startOf('day');
      // 截止日期早于今天
      if (!deadline.isBefore(today)) return false;
      // 已全部发布的任务不算逾期
      if (task.articles.length > 0 && task.articles.every(a => a.status === 'published')) return false;

      // 人工模式：与 manualTasks 过滤一致 — 排除已完成 + 有ready/published文章
      if (task.generation_mode === 'manual') {
        if (task.status === 'completed') return false;
        if (task.articles.length > 0 && task.articles.some(a => a.status === 'ready' || a.status === 'published')) return false;
        if (task.completedCount >= task.quantity) return false;
        return true;
      }

      // AI模式：与 aiTasks 过滤一致 — AI已生成完成的应去待发布列表
      if (task.generation_mode === 'ai') {
        if (task.ai_status === 'completed') return false;
        if (task.articles.length > 0 && task.articles.every(a => a.status === 'published')) return false;
        if (task.completedCount >= task.quantity) return false;
        return true;
      }

      return true;
    });

    // 按逾期日期分组，同时区分人工/AI 模式
    const groupedByDate: Record<string, { date: dayjs.Dayjs; manualCount: number; aiCount: number; readyCount: number }> = {};
    overdueTasks.forEach(task => {
      const deadline = dayjs(task.deadline);
      const dateKey = deadline.format('M月D日');
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = { date: deadline, manualCount: 0, aiCount: 0, readyCount: 0 };
      }
      
      // 按生成模式分别计数（用任务数而非文章数量，与下方列表一致）
      if (task.generation_mode === 'manual') {
        groupedByDate[dateKey].manualCount += 1;
      } else if (task.generation_mode === 'ai') {
        groupedByDate[dateKey].aiCount += 1;
      }
      
      // 统计待发布数量
      const ready = task.articles.filter(a => a.status === 'ready').length;
      groupedByDate[dateKey].readyCount += ready;
      
      console.log('[逾期统计]', { 
        city: task.city, 
        deadline: task.deadline, 
        mode: task.generation_mode,
        aiStatus: task.ai_status,
        articlesLength: task.articles.length,
        articleStatuses: task.articles.map(a => a.status),
      });
    });

    return groupedByDate;
  }, [tasks]);

  // 保存标题和额外要求到数据库（供编辑器组件使用）
  const saveTaskDataToDb = async (taskId: string, title: string, extraRequirement: string) => {
    try {
      await updateTaskFields(taskId, { user_title: title, extra_requirement: extraRequirement });
    } catch (err) {
      console.error('保存到数据库失败:', err);
    }
  };
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchTasks, setBatchTasks] = useState<TaskWithArticles[]>([]);

  // 单个任务生成弹窗状态
  const [singleTaskModalVisible, setSingleTaskModalVisible] = useState(false);
  const [singleTask, setSingleTask] = useState<TaskWithArticles | null>(null);

  // 分类任务（仅针对未生成页面）：显示所有尚未完全发布的任务
  const manualTasks = useMemo(() => {
    return tasks.filter(task => {
      // 只显示人工模式的任务
      if (task.generation_mode !== 'manual') return false;
      // 只排除所有文章都已发布的任务（这些去已完成列表）
      if (task.articles.length > 0 && task.articles.every(a => a.status === 'published')) return false;
      // 兜底：completedCount 达到 quantity 也排除
      if (task.completedCount >= task.quantity) return false;
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
      // AI已生成完成的应去「待发布」列表，不在「未生成」
      if (task.ai_status === 'completed') return false;
      // 只排除所有文章都已发布的任务（这些去已完成列表）
      if (task.articles.length > 0 && task.articles.every(a => a.status === 'published')) return false;
      // 兜底：completedCount 达到 quantity 也排除
      if (task.completedCount >= task.quantity) return false;
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
      // 兜底：AI 已完成但 articles 查询可能失败(400)，也放入待发布列表
      const aiCompletedNoArticles = task.generation_mode === 'ai' && task.ai_status === 'completed'
        && (!task.articles || task.articles.length === 0);
      if (!hasReadyArticle && !aiCompletedNoArticles) return false;
      // 没有全部完成（否则应该在已完成里）
      const allPublished = task.articles.length > 0 && task.articles.every(a => a.status === 'published');
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

          console.log('[generateWithAi] API返回结果:', {
            taskId: task.id,
            city: task.city,
            resultSuccess: result.success,
            resultsCount: result.results?.length,
            firstResultSuccess: result.results?.[0]?.success,
            firstResultContentLength: result.results?.[0]?.content?.length,
            firstResultError: result.results?.[0]?.error,
            taskArticlesCount: task.articles.length,
            taskArticleIds: task.articles.map(a => a.id),
          });

          if (result.success || (result.results && result.results[0]?.success)) {
            // 保存生成的文章内容（将换行符转换为 HTML）
            const articleContent = result.results?.[0]?.content;
            
            // 情况1：有文章记录，直接更新
            if (articleContent && task.articles.length > 0) {
              console.log('[generateWithAi] 更新已有文章:', { 
                articleId: task.articles[0].id, 
                contentLen: articleContent.length 
              });
              const { error: updateErr } = await supabase
                .from('articles')
                .update({
                  content: convertNewlinesToHtml(articleContent),
                  status: 'draft',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', task.articles[0].id);
              
              if (updateErr) {
                console.error('[generateWithAi] 文章更新失败:', updateErr);
              } else {
                console.log('[generateWithAi] 文章更新成功');
              }
            } else if (articleContent && (!task.articles || task.articles.length === 0)) {
              // 情况2：task.articles 为空（可能因为400查询失败），先查找 DB 中是否已有文章
              console.log('[generateWithAi] task.articles 为空，尝试按 task_id 查找文章:', { taskId: task.id });
              
              const { data: existingArticles, error: findErr } = await supabase
                .from('articles')
                .select('id')
                .eq('task_id', task.id)
                .limit(1);
              
              if (findErr) {
                console.error('[generateWithAi] 查找文章失败:', findErr);
              }
              
              if (existingArticles && existingArticles.length > 0) {
                // 找到已有文章，更新它而不是创建新的
                console.log('[generateWithAi] 找到已有文章，更新内容:', existingArticles[0].id);
                await supabase
                  .from('articles')
                  .update({
                    content: convertNewlinesToHtml(articleContent),
                    status: 'draft',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingArticles[0].id);
              } else {
                // ⚠️ 创建任务时已根据 quantity 创建了文章记录，这里不应再创建
                // 如果走到这里说明 DB 中确实没有该任务的文章，可能是异常情况
                console.error('[generateWithAi] ❌ 严重: 未找到文章且不创建新文章! taskId=', task.id,
                  '原因: createTask 时应已创建文章记录，此处缺失可能是数据库异常');
                message.error(`${task.city}: 文章记录丢失，无法保存AI生成内容，请检查数据库`);
              }
            } else {
              console.warn('[generateWithAi] 跳过保存: articleContent=', !!articleContent, 'articlesCount=', task.articles.length);
            }
            // 保存标题和额外要求到浏览器 localStorage（兼容旧数据）
            saveArticleData(task.id, userTitle, extraRequirement);
            // 保存到数据库（独立try-catch，不影响文章生成状态）
            try {
              console.log('[generateWithAi] 正在保存到DB:', { taskId: task.id, userTitle, extraRequirement });
              await updateTaskFields(task.id, { user_title: userTitle, extra_requirement: extraRequirement });
              console.log('[generateWithAi] DB保存成功:', { taskId: task.id });
            } catch (dbErr) {
              console.error('[generateWithAi] DB保存失败（不影响生成）:', dbErr);
              message.warning(`${task.city}: 标题/额外要求保存失败，请重试`);
            }
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
  // 存储重新生成任务的最新数据（从DB实时获取）
  const [retryTaskData, setRetryTaskData] = useState<TaskWithArticles | null>(null);

  const handleRetry = async (taskId: string) => {
    setRetryTaskId(taskId);
    
    // 从数据库获取该任务的最新数据（确保包含 user_title 和 extra_requirement）
    try {
      const { data: taskData, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (error) {
        console.error('[handleRetry] 获取任务数据失败:', error);
      } else if (taskData) {
        console.log('[handleRetry] 从DB获取到最新任务数据:', {
          taskId,
          user_title: taskData.user_title,
          extra_requirement: taskData.extra_requirement,
        });
        
        // 合并articles信息
        const currentTask = tasks.find(t => t.id === taskId);
        setRetryTaskData({
          ...taskData,
          articles: currentTask?.articles || [],
          completedCount: currentTask?.completedCount || 0,
        });
      }
    } catch (err) {
      console.error('[handleRetry] 查询异常:', err);
    }
    
    setRetryModalVisible(true);
  };

  // 批量重试（直接重试，使用数据库中已保存的标题和额外要求）
  const handleBatchRetry = async (taskIds: string[]) => {
    const tasksToRetry = tasks.filter(t => taskIds.includes(t.id));
    message.loading({ content: `正在批量重试 ${tasksToRetry.length} 个任务...`, key: 'batch-retry' });
    
    for (const task of tasksToRetry) {
      try {
        await updateAiStatus(task.id, 'generating');
        
        // 从数据库读取之前保存的标题和额外要求
        const savedTitle = (task as any).user_title || `${task.city}相关文章`;
        const savedExtra = (task as any).extra_requirement || '';
        
        const response = await fetch('/api/generate-articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tasks: [{
              city: task.city,
              prompt_type: task.prompt_type,
              writing_suggestions: task.writing_suggestions || '',
              title: savedTitle,
              extra_requirement: savedExtra,
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
          if (task.articles.length > 0) clearArticleDraft(task.articles[0].id);
          await updateAiStatus(task.id, 'completed');
        } else {
          await updateAiStatus(task.id, 'failed');
        }
      } catch (err) {
        console.error(`批量重试失败 [${task.city}]:`, err);
        try { await updateAiStatus(task.id, 'failed'); } catch {}
      }
    }
    
    refreshTasks();
    message.success({ content: `批量重试完成！共 ${tasksToRetry.length} 个任务`, key: 'batch-retry' });
  };

  // 批量转人工
  const handleBatchSwitchToManual = async (taskIds: string[]) => {
    try {
      await switchToManualMode(taskIds);
      // 清空文章内容
      for (const taskId of taskIds) {
        const task = tasks.find(t => t.id === taskId);
        if (task && task.articles.length > 0) {
          await supabase
            .from('articles')
            .update({ content: '', status: 'draft', updated_at: new Date().toISOString() } as any)
            .eq('id', task.articles[0].id);
        }
      }
      message.success(`已成功将 ${taskIds.length} 个任务转为人工生成`);
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
          onSaveData={saveTaskDataToDb}
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
            onSaveData={saveTaskDataToDb}
          />
        )}
      </Modal>

      {/* 重新生成弹窗 */}
      {retryTaskId && (() => {
        // 优先使用从数据库实时获取的数据，否则从 tasks 状态中查找
        const task = retryTaskData || tasks.find(t => t.id === retryTaskId);
        console.log('[重新生成弹窗] 渲染task数据:', {
          retryTaskId,
          hasRetryTaskData: !!retryTaskData,
          taskId: task?.id,
          user_title: (task as any)?.user_title,
          extra_requirement: (task as any)?.extra_requirement,
        });
        return (
          <Modal
            title="🤖 重新生成文章"
            open={retryModalVisible}
            onCancel={() => {
              setRetryModalVisible(false);
              setRetryTaskData(null); // 关闭时清除缓存数据
            }}
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
                    
                    console.log('[重新生成] API返回结果:', {
                      taskId: retryTaskId,
                      success: result.success,
                      resultsCount: result.results?.length,
                      firstResultSuccess: result.results?.[0]?.success,
                      firstResultContentLength: result.results?.[0]?.content?.length,
                      firstResultError: result.results?.[0]?.error,
                      taskArticlesCount: task.articles?.length || 0,
                      taskArticleIds: task.articles?.map(a => a.id) || [],
                    });

                    if (result.success || (result.results && result.results[0]?.success)) {
                      const content = result.results?.[0]?.content;
                      
                      if (content && task.articles && task.articles.length > 0) {
                        console.log('[重新生成] 更新已有文章:', { 
                          articleId: task.articles[0].id, 
                          contentLen: content.length 
                        });
                        const { error } = await supabase
                          .from('articles')
                          .update({
                            content: convertNewlinesToHtml(content),
                            status: 'draft',
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', task.articles[0].id);
                        
                        if (error) {
                          console.error('[重新生成] 文章更新失败:', error);
                        } else {
                          console.log('[重新生成] 文章更新成功');
                        }
                      } else if (content) {
                        // task.articles 为空（可能因为 400 查询失败），尝试查找或创建文章
                        console.log('[重新生成] task.articles 为空，尝试查找文章:', { taskId: retryTaskId });
                        
                        // 先按 task_id 查找已有的文章
                        const { data: existingArticles, error: findErr } = await supabase
                          .from('articles')
                          .select('id')
                          .eq('task_id', retryTaskId)
                          .limit(1);

                        if (findErr) {
                          console.error('[重新生成] 查找文章失败:', findErr);
                        }
                        
                        if (existingArticles && existingArticles.length > 0) {
                          // 找到已有文章，更新它
                          console.log('[重新生成] 找到已有文章，更新内容:', existingArticles[0].id);
                          await supabase
                            .from('articles')
                            .update({
                              content: convertNewlinesToHtml(content),
                              status: 'draft',
                              updated_at: new Date().toISOString(),
                            })
                            .eq('id', existingArticles[0].id);
                        } else {
                          // ⚠️ 创建任务时已根据 quantity 创建了文章记录，这里不应再创建
                          console.error('[重新生成] ❌ 严重: 未找到文章且不创建新文章! taskId=', retryTaskId,
                            '原因: createTask 时应已创建文章记录，此处缺失可能是数据库异常');
                          message.error(`文章记录丢失，无法保存重新生成的内容，请检查数据库`);
                        }
                      } else {
                        console.warn('[重新生成] 跳过保存: content=', !!content, 'articlesCount=', task.articles?.length || 0);
                      }
                      
                      // 清除旧草稿，因为文章内容已经更新
                      if (task.articles && task.articles.length > 0) {
                        clearArticleDraft(task.articles[0].id);
                      }
                      // 保存到数据库
                      await updateTaskFields(retryTaskId, { user_title: title, extra_requirement: extraRequirement });
                      saveArticleData(retryTaskId, title, extraRequirement);
                      await updateAiStatus(retryTaskId, 'completed');
                      message.success({ content: '重新生成成功！', key: 'retry' });
                    } else {
                      const errorMsg = result.error || result.results?.[0]?.error || '未知错误';
                      console.error('重新生成失败详情:', result);
                      message.error({ content: `生成失败: ${errorMsg}`, key: 'retry' });
                      await updateAiStatus(retryTaskId, 'failed');
                    }
                    refreshTasks();
                  } catch (err) {
                    console.error('重新生成异常:', err);
                    message.error({ content: `操作失败: ${err instanceof Error ? err.message : '网络错误'}`, key: 'retry' });
                    try {
                      await updateAiStatus(retryTaskId, 'failed');
                    } catch {
                      console.error('更新状态失败也出错:', err);
                    }
                    refreshTasks();
                  }
                }}
                onCancel={() => setRetryModalVisible(false)}
                onSaveData={saveTaskDataToDb}
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
            await setSetting('feishu_notify_mode', e.target.value);
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

          {/* 逾期任务提示 */}
          {Object.keys(overdueTasksInfo).length > 0 && (
            <Card
              style={{
                marginBottom: 24,
                background: '#fff2e8',
                border: '1px solid #ffbb96',
              }}
              bodyStyle={{ padding: '12px 24px' }}
            >
              <Space direction="vertical" size={4}>
                <Space align="center">
                  <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                  <Text style={{ fontSize: 14, color: '#d4380d', fontWeight: 500 }}>逾期任务</Text>
                </Space>
                {Object.entries(overdueTasksInfo).map(([date, info]) => {
                  const totalCount = info.manualCount + info.aiCount;
                  return (
                    <Space key={date} align="center" wrap>
                      <Text style={{ fontSize: 14, color: '#d4380d' }}>
                        {date} 有 <Text strong style={{ color: '#ff4d4f' }}>{totalCount} 个</Text> 任务未生成
                        {info.manualCount > 0 && <>（<Text strong>{info.manualCount} 人工</Text></>}
                        {info.aiCount > 0 && <><Text strong>，{info.aiCount} AI</Text>）</>}
                        {info.readyCount > 0 && <>，<Text strong style={{ color: '#fa8c16' }}>{info.readyCount} 个待发布</Text></>}
                      </Text>
                      <Button
                        type="primary"
                        size="small"
                        onClick={() => setSelectedDate(info.date)}
                        style={{ borderRadius: 16 }}
                      >
                        回到 {date}
                      </Button>
                    </Space>
                  );
                })}
              </Space>
            </Card>
          )}

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
                      onBatchRetry={handleBatchRetry}
                      onBatchSwitchToManual={handleBatchSwitchToManual}
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
