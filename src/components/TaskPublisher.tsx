import { useState, useMemo, useEffect } from 'react';
import { Card, List, Badge, Tag, Button, Checkbox, message, Typography, Space, Progress, Modal, Input, Select, Row, Col, DatePicker, Tooltip } from 'antd';
import { CheckCircleOutlined, GlobalOutlined, DeleteOutlined, ExclamationCircleOutlined, CopyOutlined, FilterOutlined, CalendarOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import { useTasks, useArticles } from '../hooks/useSupabase';
import { useWebsites } from '../hooks/useWebsites';
import type { TaskWithArticles, Article } from '../types';
import { CITIES } from '../types';
import dayjs from 'dayjs';
import CompletedTasksTable from './CompletedTasksTable';

const { Text, Title } = Typography;

function ArticlePublisher({ task, visible, onClose }: { task: TaskWithArticles; visible: boolean; onClose: () => void }) {
  const { articles, publishArticle, loading } = useArticles(task.id);
  const [showConfirm, setShowConfirm] = useState<Article | null>(null);
  const { websites: managedWebsites, loading: websitesLoading } = useWebsites();
  const [publishingLutuitui, setPublishingLutuitui] = useState<string | null>(null);

  // 提取标题：取第一行文本，然后从 DOM 里删掉那个容器元素。
  const extractTitleAndBody = (html: string, fallback: string): { title: string; body: string } => {
    if (!html) return { title: fallback, body: '' };
    const div = document.createElement('div');
    div.innerHTML = html;

    // 按换行取第一行非空文本作为标题（innerText 返回纯文本，无 HTML 标签）
    const lines = (div.innerText || div.textContent || '').split('\n').map(l => l.trim()).filter(Boolean);
    const title = lines[0]?.substring(0, 100) || fallback;

    // 找到包含标题文本的第一个顶层元素，移除以避免正文重复
    const firstEl = div.firstElementChild;
    if (firstEl && firstEl.textContent?.trim()) {
      firstEl.remove();
    }

    return { title, body: div.innerHTML };
  };

  // 根据文章的 website 字段查找鹿推推 mediaId
  const getLutuituiMediaInfo = (article: Article): { mediaId: number | null; mediaName: string | null; mediaSource: string | null; disabled: boolean; reason: string } => {
    if (!article.website) {
      return { mediaId: null, mediaName: null, mediaSource: null, disabled: true, reason: '文章未关联发布网站' };
    }
    const website = managedWebsites.find(w => w.id === article.website);
    if (!website) {
      return { mediaId: null, mediaName: null, mediaSource: null, disabled: true, reason: '未找到对应网站' };
    }
    if (!website.lutuitui_media_id) {
      return { mediaId: null, mediaName: null, mediaSource: null, disabled: true, reason: `网站"${website.name}"未绑定鹿推推` };
    }
    return {
      mediaId: website.lutuitui_media_id,
      mediaName: website.lutuitui_media_name || String(website.lutuitui_media_id),
      mediaSource: website.lutuitui_media_source || null,
      disabled: false,
      reason: '',
    };
  };

  // 发布文章到鹿推推
  const publishToLutuitui = async (article: Article) => {
    const { mediaId, mediaSource, disabled, reason } = getLutuituiMediaInfo(article);
    if (disabled) {
      message.warning(reason);
      return;
    }
    if (!article.content) {
      message.warning('文章内容为空，无法发布');
      return;
    }
    setPublishingLutuitui(article.id);
    try {
      const { title, body } = extractTitleAndBody(article.content, `${task.city}文章`);
      const response = await fetch('/api/lutuitui-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: body,
          mediaId,
          mediaSource: mediaSource || 'media',
          outOrderNo: article.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success('已成功提交到鹿推推！');
        await publishArticle(article.id, '鹿推推');
        onClose();
      } else {
        message.error(result.error || '发布失败');
      }
    } catch {
      message.error('网络错误，请重试');
    } finally {
      setPublishingLutuitui(null);
    }
  };

  const handlePublish = async () => {
    if (!showConfirm) return;
    try {
      await publishArticle(showConfirm.id, '');
      message.success('文章标记为已发布');
      setShowConfirm(null);
      onClose();
    } catch {
      message.error('操作失败');
    }
  };

  // 从 managedWebsites 获取网站显示名称
  const getWebsiteLabels = (websites: string[]) => {
    if (websitesLoading || managedWebsites.length === 0) {
      return ['加载中...'];
    }
    return websites.map(w => {
      const site = managedWebsites.find(site => site.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const readyArticles = articles.filter(a => a.status === 'ready' || a.status === 'published');
  const publishedCount = articles.filter(a => a.status === 'published').length;

  return (
    <Modal
      title={`发布任务 - ${task.city}`}
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
            <Text strong>发布数量：</Text>
            <Text>{task.quantity} 篇</Text>
          </div>
          <div>
            <Text strong>已完成：</Text>
            <Text type="success">{publishedCount} 篇</Text>
          </div>
        </Space>
      </div>

      <Progress
        percent={Math.round((publishedCount / task.quantity) * 100)}
        status={publishedCount === task.quantity ? 'success' : 'active'}
        format={() => `${publishedCount}/${task.quantity}`}
        style={{ marginBottom: 16 }}
      />

      <Title level={5}>待发布文章列表</Title>
      <List
        loading={loading}
        dataSource={readyArticles}
        locale={{ emptyText: '暂无可发布的文章，请等待内容生成完成' }}
        renderItem={(article, index) => {
          const { mediaId, mediaName, disabled, reason } = getLutuituiMediaInfo(article);
          return (
            <List.Item
              actions={[
                <Button
                  key="copy"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    if (article.content) {
                      navigator.clipboard.writeText(article.content);
                      message.success('HTML 内容已复制到剪贴板');
                    } else {
                      message.warning('文章内容为空');
                    }
                  }}
                  disabled={!article.content}
                >
                  复制HTML
                </Button>,
                article.status !== 'published' && (
                  <Tooltip key="lutuitui-tip" title={disabled ? reason : `发布到: ${mediaName}`}>
                    <Button
                      key="lutuitui"
                      type="primary"
                      icon={disabled ? <WarningOutlined /> : <SendOutlined />}
                      onClick={() => publishToLutuitui(article)}
                      loading={publishingLutuitui === article.id}
                      disabled={disabled || !article.content}
                    >
                      发布到鹿推推
                    </Button>
                  </Tooltip>
                ),
                article.status === 'published' ? (
                  <Tag key="done" color="success" icon={<CheckCircleOutlined />}>
                    已发布 {article.published_by && `by ${article.published_by}`}
                  </Tag>
                ) : (
                  <Button
                    key="publish"
                    icon={<CheckCircleOutlined />}
                    onClick={() => setShowConfirm(article)}
                    disabled={article.status !== 'ready'}
                  >
                    标记为已发布
                  </Button>
                ),
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Checkbox
                    checked={article.status === 'published'}
                    disabled
                    style={{ marginTop: 4 }}
                  />
                }
                title={
                  <Space>
                    <span>文章 {index + 1}</span>
                    {article.website && managedWebsites.length > 0 && (
                      <Tag color="geekblue" style={{ fontSize: 11 }}>
                        {managedWebsites.find(w => w.id === article.website)?.name || article.website}
                      </Tag>
                    )}
                    {mediaName && !disabled && (
                      <Tag color="purple" style={{ fontSize: 11 }}>
                        → {mediaName}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <div>
                    {article.content ? (
                      <div
                        className="ql-editor"
                        dangerouslySetInnerHTML={{ __html: article.content.substring(0, 100) + '...' }}
                        style={{ maxWidth: 400, overflow: 'hidden' }}
                      />
                    ) : (
                      <Text type="secondary">暂无内容</Text>
                    )}
                    {article.published_at && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          发布时间：{dayjs(article.published_at).format('YYYY-MM-DD HH:mm')}
                        </Text>
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />

      <Modal
        title="确认发布"
        open={!!showConfirm}
        onCancel={() => setShowConfirm(null)}
        onOk={handlePublish}
        okText="确认发布"
        cancelText="取消"
      >
        <Text>请确认您已完成这篇文章的发布？</Text>
      </Modal>
    </Modal>
  );
}

interface TaskPublisherProps {
  defaultStatus?: string;
  onDateChange?: (date: dayjs.Dayjs) => void;
}

export default function TaskPublisher({ defaultStatus, onDateChange }: TaskPublisherProps) {
  if (defaultStatus === 'completed') {
    return <CompletedTasksTable defaultStatus={defaultStatus} />;
  }

  const { tasks, loading, error, deleteTask, refreshTasks } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithArticles | null>(null);
  const { websites: managedWebsites } = useWebsites();

  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterWebsite, setFilterWebsite] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(defaultStatus);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());

  const handleDateChange = (date: dayjs.Dayjs) => {
    setSelectedDate(date);
    onDateChange?.(date);
  };

  const overdueTasksInfo = useMemo(() => {
    const today = dayjs().startOf('day');
    const overdueTasks = tasks.filter(task => {
      const deadline = dayjs(task.deadline).startOf('day');
      if (!deadline.isBefore(today)) return false;
      const hasIncompleteArticle = task.articles.some(a => a.status !== 'published');
      return hasIncompleteArticle;
    });

    const groupedByDate: Record<string, { date: dayjs.Dayjs; readyCount: number; ungeneratedCount: number }> = {};
    overdueTasks.forEach(task => {
      const deadline = dayjs(task.deadline);
      const dateKey = deadline.format('M月D日');
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = { date: deadline, readyCount: 0, ungeneratedCount: 0 };
      }
      const ready = task.articles.filter(a => a.status === 'ready').length;
      const generatedCount = task.articles.filter(a => a.status === 'ready' || a.status === 'published').length;
      const ungeneratedCount = Math.max(0, task.quantity - generatedCount);
      groupedByDate[dateKey].readyCount += ready;
      groupedByDate[dateKey].ungeneratedCount += ungeneratedCount;
    });

    return groupedByDate;
  }, [tasks]);

  useEffect(() => {
    setFilterStatus(defaultStatus);
  }, [defaultStatus]);

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

  const getWebsiteLabels = (websites: string[]) => {
    if (managedWebsites.length === 0) return [];
    return websites.map(w => {
      const site = managedWebsites.find(site => site.id === w);
      return site ? `${site.name} (${site.platform})` : w;
    });
  };

  const dateStats = useMemo(() => {
    const dateStr = selectedDate.format('YYYY-MM-DD');
    const dateTasks = tasks.filter(task => dayjs(task.deadline).format('YYYY-MM-DD') === dateStr);

    let totalArticles = 0;
    let generatedArticles = 0;
    let publishedArticles = 0;
    let readyArticles = 0;

    dateTasks.forEach(task => {
      totalArticles += task.quantity;
      task.articles.forEach(article => {
        if (article.status === 'published') {
          publishedArticles++;
          generatedArticles++;
        } else if (article.status === 'ready') {
          generatedArticles++;
          readyArticles++;
        }
      });
    });

    return {
      totalTasks: dateTasks.length,
      totalArticles,
      generatedArticles,
      publishedArticles,
      readyArticles,
    };
  }, [tasks, selectedDate]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const progress = getTaskProgress(task);

      if (dayjs(task.deadline).format('YYYY-MM-DD') !== selectedDate.format('YYYY-MM-DD')) return false;
      if (filterCity && task.city !== filterCity) return false;
      if (filterWebsite && !task.websites.includes(filterWebsite)) return false;
      if (filterStatus && progress.value !== filterStatus) return false;

      return true;
    });
  }, [tasks, filterCity, filterWebsite, filterStatus, selectedDate]);

  if (error) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <Title level={3}>发布任务列表</Title>
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
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>
          {defaultStatus === 'ready' ? '待发布任务' :
           defaultStatus === 'completed' ? '已完成任务' :
           '发布任务列表'}
        </Title>
        <Text type="secondary" style={{ fontSize: 14, marginTop: 8, display: 'block' }}>
          管理您的内容发布任务
        </Text>
      </div>

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
              onChange={(date) => date && handleDateChange(date)}
              format="YYYY-MM-DD"
              style={{ width: 140 }}
            />
            <Text style={{ fontSize: 16 }}>
              任务 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>{dateStats.totalArticles}</Text> 篇，
              已发布 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff', background: '#f6ffed', padding: '0 8px', borderRadius: 4 }}>{dateStats.publishedArticles}</Text> 篇，
              待发布 <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff', background: '#fff2e8', padding: '0 8px', borderRadius: 4 }}>{dateStats.readyArticles}</Text> 篇
            </Text>
          </Space>
          <div style={{ color: '#666', fontSize: 14 }}>
            {selectedDate.isSame(dayjs(), 'day') ? '今天' : selectedDate.format('M月D日')}还有 <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{dateStats.readyArticles}</Text> 篇待发布，{dateStats.readyArticles === 0 ? '真棒！' : '快快加油吧！'}
          </div>
        </Space>
      </Card>

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
            {Object.entries(overdueTasksInfo).map(([date, info]) => (
              <Space key={date} align="center">
                <Text style={{ fontSize: 14, color: '#d4380d' }}>
                  {date} 有{' '}
                  {info.readyCount > 0 && <Text strong style={{ color: '#fa8c16' }}>{info.readyCount} 个待发布</Text>}
                  {info.readyCount > 0 && info.ungeneratedCount > 0 && '，'}
                  {info.ungeneratedCount > 0 && <Text strong style={{ color: '#ff4d4f' }}>{info.ungeneratedCount} 个未生成</Text>}
                </Text>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleDateChange(info.date)}
                  style={{ borderRadius: 16 }}
                >
                  回到 {date}
                </Button>
              </Space>
            ))}
          </Space>
        </Card>
      )}

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
          <Col>
            <Space align="center">
              <CalendarOutlined style={{ color: '#667eea', fontSize: 18 }} />
              <DatePicker
                value={selectedDate}
                onChange={(date) => date && handleDateChange(date)}
                format="YYYY-MM-DD"
                style={{
                  width: 140,
                  borderRadius: 12,
                  border: '1px solid #e8e8e8',
                }}
              />
            </Space>
          </Col>
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
                placeholder="选择发布网站"
                value={filterWebsite}
                onChange={setFilterWebsite}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                style={{ width: 180, borderRadius: 12 }}
                bordered={false}
                options={managedWebsites.map(w => ({ label: `${w.name} (${w.platform})`, value: w.id }))}
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
              {(filterCity || filterWebsite || filterStatus) && (
                <Button
                  type="link"
                  onClick={() => {
                    setFilterCity(undefined);
                    setFilterWebsite(undefined);
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
                      <div style={{ fontSize: 12, color: '#888' }}>发布网站</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getWebsiteLabels(task.websites).join('、')}
                      </div>
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
        <ArticlePublisher
          task={selectedTask}
          visible={!!selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
