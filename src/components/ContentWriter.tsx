import { useState, useMemo, useEffect } from 'react';
import { Card, List, Badge, Tag, Button, Modal, Input, message, Typography, Space, Progress, Popconfirm, Select, Row, Col, DatePicker, Form, Radio, Divider } from 'antd';
import { EditOutlined, FileTextOutlined, DeleteOutlined, ExclamationCircleOutlined, EyeOutlined, CheckCircleOutlined, UndoOutlined, FilterOutlined, CalendarOutlined, SettingOutlined, BellOutlined, NotificationOutlined, SaveOutlined } from '@ant-design/icons';
import { useTasks, useArticles } from '../hooks/useSupabase';
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
const checkAndSendBatchNotification = async (tasks: TaskWithArticles[]) => {
  const notifyMode = localStorage.getItem('feishu_notify_mode') || 'immediate';
  if (notifyMode !== 'batch') return;
  
  const feishuWebhook = localStorage.getItem('feishu_webhook');
  if (!feishuWebhook) return;
  
  // 检查今天是否已发送过批量通知
  const today = dayjs().format('YYYY-MM-DD');
  const lastBatchNotify = localStorage.getItem('feishu_batch_notify_date');
  if (lastBatchNotify === today) return;
  
  // 检查所有任务是否都已完成（所有文章都是 ready 或 published）
  const todayTasks = tasks.filter(t => dayjs(t.deadline).format('YYYY-MM-DD') === today);
  if (todayTasks.length === 0) return;
  
  const allCompleted = todayTasks.every(task => {
    const articles = task.articles || [];
    return articles.length > 0 && articles.every(a => a.status === 'ready' || a.status === 'published');
  });
  
  if (allCompleted) {
    await sendBatchFeishuNotification(feishuWebhook, todayTasks);
    localStorage.setItem('feishu_batch_notify_date', today);
  }
};

const { Text, Title } = Typography;

// 从 PromptManager 读取提示词类型
const usePromptTypes = () => {
  const [promptTypes, setPromptTypes] = useState<{ id: string; type: string }[]>([]);

  useEffect(() => {
    const loadPrompts = () => {
      const saved = localStorage.getItem('articlePrompts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setPromptTypes(parsed.map((p: any) => ({ id: p.id, type: p.type })));
        } catch {
          setPromptTypes([]);
        }
      }
    };
    loadPrompts();
  }, []);

  return promptTypes;
};

function ArticleEditor({ task, visible, onClose }: { task: TaskWithArticles; visible: boolean; onClose: () => void }) {
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
  const handleMarkReady = async (article: Article) => {
    try {
      await updateArticle(article.id, { status: 'ready' });
      message.success('已标记为准备发布');
      
      // 获取通知模式设置
      const notifyMode = localStorage.getItem('feishu_notify_mode') || 'immediate';
      const feishuWebhook = localStorage.getItem('feishu_webhook');
      
      if (feishuWebhook) {
        if (notifyMode === 'immediate') {
          // 即时通知：立即发送
          await sendFeishuNotification(feishuWebhook, task, article);
        } else {
          // 批量通知：检查今天是否全部完成
          await checkAndSendBatchNotification([task]);
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

  // 从 localStorage 获取网站名称
  const getWebsiteLabels = (websites: string[]) => {
    const saved = localStorage.getItem('managedWebsites');
    const managedWebsites = saved ? JSON.parse(saved) : [];
    return websites.map(w => {
      const site = managedWebsites.find((s: any) => s.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  // 从 localStorage 获取提示词类型名称
  const getPromptTypeLabel = (promptTypeId: string) => {
    const saved = localStorage.getItem('articlePrompts');
    const prompts = saved ? JSON.parse(saved) : [];
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
                  onClick={() => handleMarkReady(article)}
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
}

// 飞书通知设置组件
function FeishuSettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const savedWebhook = localStorage.getItem('feishu_webhook') || '';
      const savedNotifyMode = localStorage.getItem('feishu_notify_mode') || 'immediate';
      form.setFieldsValue({
        feishu_webhook: savedWebhook,
        notify_mode: savedNotifyMode,
      });
    }
  }, [visible, form]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      if (values.feishu_webhook) {
        localStorage.setItem('feishu_webhook', values.feishu_webhook);
      } else {
        localStorage.removeItem('feishu_webhook');
      }
      localStorage.setItem('feishu_notify_mode', values.notify_mode || 'immediate');
      message.success('设置已保存');
      onClose();
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    const webhook = form.getFieldValue('feishu_webhook');
    if (!webhook) {
      message.warning('请先填写 Webhook 地址');
      return;
    }

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: '🔔 测试消息\n\n飞书通知配置成功！当有内容准备发布时，您将收到通知。'
          }
        })
      });

      if (response.ok) {
        message.success('测试消息已发送，请检查飞书群');
      } else {
        message.error('发送失败，请检查 Webhook 地址是否正确');
      }
    } catch (error) {
      message.error('发送失败，请检查网络连接');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <BellOutlined />
          飞书通知设置
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={560}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
      >
        <Form.Item
          name="feishu_webhook"
          label="飞书群 Webhook 地址"
          extra="在飞书群设置中添加自定义机器人，复制 Webhook 地址粘贴到这里"
        >
          <Input.TextArea
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
            rows={2}
          />
        </Form.Item>

        <Form.Item
          name="notify_mode"
          label={
            <Space>
              <NotificationOutlined />
              通知模式
            </Space>
          }
        >
          <Radio.Group>
            <Radio value="immediate">
              <Space direction="vertical" size={0}>
                <Text strong>即时通知</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>每生产完一篇文章后立即通知</Text>
              </Space>
            </Radio>
            <Radio value="batch">
              <Space direction="vertical" size={0}>
                <Text strong>批量通知</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>当天文章全部生产完后再通知</Text>
              </Space>
            </Radio>
          </Radio.Group>
        </Form.Item>

        <Divider />

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
            >
              保存设置
            </Button>
            <Button onClick={testWebhook}>
              发送测试消息
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <div style={{ background: '#f6ffed', padding: '16px', borderRadius: '8px', border: '1px solid #b7eb8f', marginTop: 16 }}>
        <Text strong style={{ color: '#52c41a' }}>配置说明：</Text>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#666' }}>
          <li>在飞书群中点击右上角「...」→「群机器人」</li>
          <li>点击「添加机器人」，选择「自定义机器人」</li>
          <li>复制生成的 Webhook 地址，粘贴到上方输入框</li>
          <li>点击「保存设置」，然后可以「发送测试消息」验证</li>
        </ol>
      </div>
    </Modal>
  );
}

export default function ContentWriter({ defaultStatus }: ContentWriterProps) {
  const { tasks, loading, error, deleteTask, refreshTasks } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithArticles | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const promptTypes = usePromptTypes();

  // 筛选状态
  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterPromptType, setFilterPromptType] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(defaultStatus);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());

  // 当 defaultStatus 变化时更新 filterStatus
  useEffect(() => {
    setFilterStatus(defaultStatus);
  }, [defaultStatus]);

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
        <Button
          icon={<SettingOutlined />}
          onClick={() => setSettingsVisible(true)}
        >
          通知设置
        </Button>
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
        />
      )}

      <FeishuSettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </div>
  );
}
