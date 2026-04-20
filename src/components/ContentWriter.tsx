import { useState, useMemo, useEffect } from 'react';
import { Card, List, Badge, Tag, Button, Modal, Input, message, Typography, Space, Progress, Popconfirm, Select, Row, Col, DatePicker, Radio } from 'antd';
import { EditOutlined, FileTextOutlined, DeleteOutlined, ExclamationCircleOutlined, EyeOutlined, CheckCircleOutlined, UndoOutlined, FilterOutlined, CalendarOutlined, SettingOutlined } from '@ant-design/icons';
import { useTasks, useArticles } from '../hooks/useSupabase';
import { useSettings } from '../hooks/useSettings';
import { usePrompts } from '../hooks/usePrompts';
import { useWebsites } from '../hooks/useWebsites';
import type { TaskWithArticles, Article } from '../types';
import { CITIES } from '../types';
import dayjs from 'dayjs';
import RichTextEditor from './RichTextEditor';

// 发送飞书通知（单条）
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

// 发送批量飞书通知
const sendBatchFeishuNotification = async (webhook: string, tasks: TaskWithArticles[]) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const totalArticles = tasks.reduce((sum, t) => sum + (t.articles?.length || 0), 0);
    const readyArticles = tasks.reduce((sum, t) => sum + (t.articles?.filter(a => a.status === 'ready').length || 0), 0);
    
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: {
          text: `📢 今日内容生产完成\n\n日期：${today}\n任务数：${tasks.length} 个\n文章总数：${totalArticles} 篇\n待发布：${readyArticles} 篇\n\n所有文章已生产完成，请安排发布。`
        }
      })
    });
    
    if (!response.ok) {
      console.error('批量飞书通知发送失败:', await response.text());
    }
  } catch (error) {
    console.error('发送批量飞书通知出错:', error);
  }
};

// 检查是否需要发送批量通知
const checkAndSendBatchNotification = async (allTasks: TaskWithArticles[], currentTaskId: string, settings: Record<string, string>) => {
  const notifyMode = settings['feishu_notify_mode'] || 'immediate';
  if (notifyMode !== 'batch') return;

  const feishuWebhook = settings['feishu_webhook'];
  if (!feishuWebhook) return;

  // 检查今天是否已发送过批量通知
  const today = dayjs().format('YYYY-MM-DD');
  const lastBatchNotify = settings['feishu_batch_notify_date'];
  if (lastBatchNotify === today) return;

  // 获取今天的所有任务
  const todayTasks = allTasks.filter(t => dayjs(t.deadline).format('YYYY-MM-DD') === today);
  if (todayTasks.length === 0) return;

  // 检查每个任务的文章是否都已完成（文章数量等于任务要求的数量，且所有文章都是 ready 或 published）
  const allCompleted = todayTasks.every(task => {
    const articles = task.articles || [];
    const readyOrPublishedCount = articles.filter(a => a.status === 'ready' || a.status === 'published').length;
    return readyOrPublishedCount === task.quantity;
  });

  if (allCompleted) {
    await sendBatchFeishuNotification(feishuWebhook, todayTasks);
    message.success('批量通知已发送');
  }
};

const { Text, Title } = Typography;

// 从 Supabase 读取提示词类型
const usePromptTypes = () => {
  const { prompts } = usePrompts();
  return prompts.map(p => ({ id: p.id, type: p.type }));
};

function ArticleEditor({ task, visible, onClose, settings }: { task: TaskWithArticles; visible: boolean; onClose: () => void; settings: Record<string, string> }) {
  const { articles, updateArticle, loading } = useArticles(task.id);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [content, setContent] = useState('');

  const handleEdit = (article: Article) => {
    setEditingArticle(article);
    setContent(article.content);
  };

  const handleSave = async () => {
    if (!editingArticle) return;
    try {
      // 保存内容，但保持当前状态不变
      const newStatus = editingArticle.status === 'published' ? 'published' : 
                        editingArticle.status === 'ready' ? 'ready' :
                        'draft';
      await updateArticle(editingArticle.id, {
        content,
        status: newStatus,
      });
      message.success('文章已保存');
      setEditingArticle(null);
    } catch {
      message.error('保存失败');
    }
  };

  // 标记为准备发布（ready 状态）
  const handleMarkReady = async (article: Article, settings: Record<string, string>) => {
    try {
      await updateArticle(article.id, { status: 'ready' });
      message.success('已标记为准备发布');

      // 获取通知模式设置
      const notifyMode = settings['feishu_notify_mode'] || 'immediate';
      const feishuWebhook = settings['feishu_webhook'];

      if (feishuWebhook) {
        if (notifyMode === 'immediate') {
          // 即时通知：立即发送
          await sendFeishuNotification(feishuWebhook, task, article);
        }
      }
    } catch {
      message.error('操作失败');
    }
  };

  // 取消准备发布（恢复为 draft）
  const handleCancelReady = async (article: Article) => {
    try {
      await updateArticle(article.id, { status: 'draft' });
      message.success('已取消，恢复为草稿');
    } catch {
      message.error('操作失败');
    }
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    switch (status) {
      case 'published':
        return <Tag color="success">已发布</Tag>;
      case 'ready':
        return <Tag color="processing">准备发布</Tag>;
      default:
        return <Tag color="default">草稿</Tag>;
    }
  };

  // 使用 hooks 获取数据
  const { websites, loading: websitesLoading } = useWebsites();
  const { prompts, loading: promptsLoading } = usePrompts();

  // 获取网站名称
  const getWebsiteLabels = (websiteIds: string[]) => {
    if (websitesLoading || websites.length === 0) {
      return ['加载中...'];
    }
    return websiteIds.map(w => {
      const site = websites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  // 获取提示词类型名称
  const getPromptTypeLabel = (promptTypeId: string) => {
    if (promptsLoading || prompts.length === 0) {
      return '加载中...';
    }
    const prompt = prompts.find((p: any) => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
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
          </div>
          <div>
            <Text strong>发布网站：</Text>
            {getWebsiteLabels(task.websites).map((site, idx) => (
              <Tag key={idx} color="green">{site}</Tag>
            ))}
          </div>
          <div>
            <Text strong>提示词类型：</Text>
            <Tag color="purple">{getPromptTypeLabel(task.prompt_type)}</Tag>
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
              // 准备发布/取消按钮
              article.status === 'ready' ? (
                <Popconfirm
                  key="cancel"
                  title="取消准备发布"
                  description="确定要取消吗？文章将恢复为草稿状态。"
                  onConfirm={() => handleCancelReady(article)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    icon={<UndoOutlined />}
                    size="small"
                  >
                    取消发布
                  </Button>
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
                  {getStatusTag(article.status)}
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
    </Modal>
  );
}

interface ContentWriterProps {
  defaultStatus?: string;
  onOpenSettings?: () => void;
}

export default function ContentWriter({ defaultStatus, onOpenSettings }: ContentWriterProps) {
  const { tasks, loading, error, deleteTask, refreshTasks } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithArticles | null>(null);
  const promptTypes = usePromptTypes();
  const { settings, setSetting } = useSettings();

  // 筛选状态
  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterPromptType, setFilterPromptType] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(defaultStatus);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());

  // 当 defaultStatus 变化时更新 filterStatus
  useEffect(() => {
    setFilterStatus(defaultStatus);
  }, [defaultStatus]);

  // 检查批量通知 - 当任务数据变化时自动检查
  useEffect(() => {
    const checkBatch = async () => {
      if (!loading && tasks.length > 0) {
        await checkAndSendBatchNotification(tasks, '', settings);
      }
    };
    checkBatch();
  }, [tasks, loading]);

  // 内容生产者视角：根据文章状态判断任务进度
  const getTaskProgress = (task: TaskWithArticles) => {
    const readyCount = task.articles.filter(a => a.status === 'ready').length;
    const publishedCount = task.articles.filter(a => a.status === 'published').length;

    if (publishedCount === task.quantity) {
      return { color: 'success', text: '已完成', value: 'completed' };
    }
    if (readyCount > 0 || publishedCount > 0) {
      return { color: 'processing', text: '待发布', value: 'ready' };
    }
    return { color: 'default', text: '未生成', value: 'draft' };
  };

  // 按选择日期统计（按截止日期）
  const dateStats = useMemo(() => {
    const dateStr = selectedDate.format('YYYY-MM-DD');
    const dateTasks = tasks.filter(task => dayjs(task.deadline).format('YYYY-MM-DD') === dateStr);

    let totalArticles = 0;
    let generatedArticles = 0;
    let publishedArticles = 0;
    let draftArticles = 0;

    dateTasks.forEach(task => {
      totalArticles += task.quantity;
      task.articles.forEach(article => {
        if (article.status === 'published') {
          publishedArticles++;
          generatedArticles++;
        } else if (article.status === 'ready') {
          generatedArticles++;
        } else {
          draftArticles++;
        }
      });
    });

    return {
      totalTasks: dateTasks.length,
      totalArticles,
      generatedArticles,
      publishedArticles,
      draftArticles,
    };
  }, [tasks, selectedDate]);

  // 筛选后的任务列表
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const progress = getTaskProgress(task);

      // 按选择日期筛选（截止日期）
      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterPromptType && task.prompt_type !== filterPromptType) return false;
      if (filterStatus && progress.value !== filterStatus) return false;

      return true;
    });
  }, [tasks, filterCity, filterPromptType, filterStatus, selectedDate]);

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

  const handleDelete = (task: TaskWithArticles, e: React.MouseEvent) => {
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

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={2} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>
            {defaultStatus === 'draft' ? '未生成任务' : 
             defaultStatus === 'ready' ? '待发布任务' : 
             defaultStatus === 'completed' ? '已完成任务' : 
             '任务列表'}
          </Title>
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

      {/* 统计区域 */}
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
              任务 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>{dateStats.totalArticles}</Text> 篇，
              已生产 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff', background: '#fff2e8', padding: '0 8px', borderRadius: 4 }}>{dateStats.generatedArticles}</Text> 篇，
              已发布 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff', background: '#f6ffed', padding: '0 8px', borderRadius: 4 }}>{dateStats.publishedArticles}</Text> 篇
            </Text>
          </Space>
          <div style={{ color: '#666', fontSize: 14 }}>
            {selectedDate.isSame(dayjs(), 'day') ? '今天' : selectedDate.format('M月D日')}还有 <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{dateStats.draftArticles}</Text> 篇待生成，{dateStats.draftArticles === 0 ? '真棒！' : '快快加油吧！'}
          </div>
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
              <Select
                placeholder="选择状态"
                value={filterStatus}
                onChange={setFilterStatus}
                allowClear
                style={{ width: 140, borderRadius: 12 }}
                bordered={false}
                options={[
                  { label: '未生成', value: 'draft' },
                  { label: '待发布', value: 'ready' },
                  { label: '已完成', value: 'completed' },
                ]}
              />
              {(filterCity || filterPromptType || filterStatus) && (
                <Button
                  type="link"
                  onClick={() => {
                    setFilterCity(undefined);
                    setFilterPromptType(undefined);
                    setFilterStatus(undefined);
                  }}
                >
                  清除筛选
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 任务列表 */}
      <List
        loading={loading}
        grid={{ gutter: 24, xs: 1, sm: 2, lg: 3 }}
        dataSource={filteredTasks}
        locale={{ emptyText: '暂无符合条件的任务' }}
        renderItem={(task) => {
          const progress = getTaskProgress(task);
          const progressPercent = Math.round((task.completedCount / task.quantity) * 100);
          return (
            <List.Item>
              <Card
                hoverable
                onClick={() => setSelectedTask(task)}
                style={{
                  borderRadius: 20,
                  border: 'none',
                  background: '#fff',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                }}
                bodyStyle={{ padding: '20px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                      {task.city}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {dayjs(task.deadline).format('MM月DD日')} 截止
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    background: progress.value === 'completed' ? '#e6f7e6' : progress.value === 'ready' ? '#e6f4ff' : '#f5f5f5',
                    color: progress.value === 'completed' ? '#52c41a' : progress.value === 'ready' ? '#1890ff' : '#888',
                  }}>
                    {progress.text}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: '#666' }}>进度</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{progressPercent}%</span>
                  </div>
                  <div style={{
                    height: 8,
                    background: '#f0f0f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      background: progress.value === 'completed' ? 'linear-gradient(90deg, #52c41a, #73d13d)' : 
                                 progress.value === 'ready' ? 'linear-gradient(90deg, #1890ff, #40a9ff)' : 
                                 'linear-gradient(90deg, #faad14, #ffc53d)',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#888' }}>数量</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{task.quantity} 篇</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#888' }}>平台</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{task.websites.length} 个</div>
                    </div>
                  </div>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDelete(task, e)}
                    style={{ borderRadius: 8 }}
                  />
                </div>
              </Card>
            </List.Item>
          );
        }}
      />

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
