import { useState, useMemo, useCallback } from 'react';
import { Table, Button, Modal, Input, DatePicker, Tag, Space, Tooltip, message, Typography } from 'antd';
import {
  EyeOutlined, CopyOutlined, LinkOutlined, ExportOutlined,
  EditOutlined, CheckOutlined, CloseOutlined
} from '@ant-design/icons';
import type { TaskWithArticles, Article } from '../types';
import { useTasks, usePrompts } from '../hooks/useSupabase';
import { useWebsites } from '../hooks/useWebsites';
import { CITIES } from '../types';
import dayjs from 'dayjs';

const { Text } = Typography;

// 从 HTML 内容中提取 h1 标题
const extractTitle = (content: string): string => {
  if (!content) return '无标题';
  const match = content.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (match) {
    // 去除 HTML 标签，只保留文本
    return match[1].replace(/<[^>]+>/g, '').trim();
  }
  return '无标题';
};

// 截断文本
const truncateText = (text: string, maxLength: number = 30): string => {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

interface CompletedTasksTableProps {
  defaultStatus?: string;
}

export default function CompletedTasksTable({ defaultStatus }: CompletedTasksTableProps) {
  const { tasks, loading, error } = useTasks();
  const { prompts } = usePrompts();
  const { websites: managedWebsites } = useWebsites();

  // 筛选状态
  const [filterCity, setFilterCity] = useState<string | undefined>(undefined);
  const [filterPromptType, setFilterPromptType] = useState<string | undefined>(undefined);
  const [filterPlatform, setFilterPlatform] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  // 文章预览弹窗
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);

  // 编辑状态
  const [editingCell, setEditingCell] = useState<{ articleId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // 获取网站信息
  const getWebsiteInfo = useCallback((websiteId: string) => {
    return managedWebsites.find(w => w.id === websiteId);
  }, [managedWebsites]);

  // 获取提示词类型名称（从prompts表动态获取）
  const getPromptTypeLabel = useCallback((promptTypeId: string): string => {
    const prompt = prompts.find(p => p.id === promptTypeId);
    return prompt ? prompt.type : promptTypeId;
  }, [prompts]);

  // 展平所有已发布的文章为表格行
  const tableData = useMemo(() => {
    const rows: {
      key: string;
      article: Article;
      task: TaskWithArticles;
      markCompletedTime: string;
      title: string;
      city: string;
      promptType: string;
      platform: string;
      websiteName: string;
      publishedUrl: string | null;
      mediaPublishedAt: string | null;
    }[] = [];

    tasks.forEach(task => {
      // 只显示已发布的文章
      const publishedArticles = task.articles.filter(a => a.status === 'published');

      publishedArticles.forEach(article => {
        const websiteInfo = article.website ? getWebsiteInfo(article.website) : null;

        rows.push({
          key: article.id,
          article,
          task,
          markCompletedTime: article.published_at || '',
          title: extractTitle(article.content),
          city: task.city,
          promptType: task.prompt_type,
          platform: websiteInfo?.platform || '-',
          websiteName: websiteInfo?.name || '-',
          publishedUrl: article.published_url || null,
          mediaPublishedAt: article.media_published_at || null,
        });
      });
    });

    return rows;
  }, [tasks, getWebsiteInfo]);

  // 筛选后的数据
  const filteredData = useMemo(() => {
    return tableData.filter(row => {
      if (filterCity && row.city !== filterCity) return false;
      if (filterPromptType && row.promptType !== filterPromptType) return false;
      if (filterPlatform && row.platform !== filterPlatform) return false;
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const searchable = `${row.title} ${row.city} ${row.promptType} ${row.platform} ${row.websiteName} ${row.publishedUrl || ''}`.toLowerCase();
        if (!searchable.includes(searchLower)) return false;
      }
      return true;
    });
  }, [tableData, filterCity, filterPromptType, filterPlatform, searchText]);

  // 更新文章字段
  const updateArticleField = async (articleId: string, field: string, value: any) => {
    try {
      const supabase = (await import('../supabase')).supabase;
      const { error } = await supabase
        .from('articles')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', articleId);

      if (error) throw error;

      message.success('保存成功');
      // 刷新数据
      window.location.reload();
    } catch (err) {
      message.error('保存失败');
      console.error(err);
    }
  };

  // 开始编辑单元格
  const startEditing = (articleId: string, field: string, currentValue: string | null) => {
    setEditingCell({ articleId, field });
    setEditValue(currentValue || '');
  };

  // 保存编辑
  const saveEdit = () => {
    if (!editingCell) return;
    updateArticleField(editingCell.articleId, editingCell.field, editValue);
    setEditingCell(null);
    setEditValue('');
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string, successMsg: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(successMsg);
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // 导出 Excel
  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const exportData = filteredData.map((row, index) => ({
        '序号': index + 1,
        '标记完成时间': row.markCompletedTime ? dayjs(row.markCompletedTime).format('YYYY-MM-DD HH:mm') : '',
        '标题': row.title,
        '城市': row.city,
        '提示词类型': getPromptTypeLabel(row.promptType),
        '投稿平台': row.platform,
        '发布网站': row.websiteName,
        '回链': row.publishedUrl || '',
        '平台发稿时间': row.mediaPublishedAt ? dayjs(row.mediaPublishedAt).format('YYYY-MM-DD HH:mm') : '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '已完成任务');

      // 设置列宽
      ws['!cols'] = [
        { wch: 6 },   // 序号
        { wch: 18 },  // 标记完成时间
        { wch: 40 },  // 标题
        { wch: 10 },  // 城市
        { wch: 12 },  // 提示词类型
        { wch: 12 },  // 投稿平台
        { wch: 20 },  // 发布网站
        { wch: 50 },  // 回链
        { wch: 18 },  // 平台发稿时间
      ];

      XLSX.writeFile(wb, `已完成任务_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
      console.error(err);
    }
  };

  // 导出 CSV
  const exportToCSV = () => {
    try {
      const headers = ['序号,标记完成时间,标题,城市,提示词类型,投稿平台,发布网站,回链,平台发稿时间'];
      const rows = filteredData.map((row, index) => [
        index + 1,
        row.markCompletedTime ? dayjs(row.markCompletedTime).format('YYYY-MM-DD HH:mm') : '',
        `"${(row.title).replace(/"/g, '""')}"`,
        row.city,
        getPromptTypeLabel(row.promptType),
        row.platform,
        row.websiteName,
        row.publishedUrl || '',
        row.mediaPublishedAt ? dayjs(row.mediaPublishedAt).format('YYYY-MM-DD HH:mm') : '',
      ].join(','));

      const csvContent = '\uFEFF' + [...headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `已完成任务_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      link.click();
      message.success('导出成功');
    } catch (err) {
      message.error('导出失败');
      console.error(err);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '#',
      dataIndex: 'index',
      key: 'index',
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '标记完成时间',
      dataIndex: 'markCompletedTime',
      key: 'markCompletedTime',
      width: 140,
      sorter: (a: any, b: any) =>
        new Date(a.markCompletedTime).getTime() - new Date(b.markCompletedTime).getTime(),
      render: (time: string) => time ? dayjs(time).format('MM-DD HH:mm') : '-',
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      render: (title: string, record: any) => (
        <Tooltip title={title}>
          <a
            onClick={() => setPreviewArticle(record.article)}
            style={{ color: '#1890ff', cursor: 'pointer' }}
          >
            <EyeOutlined style={{ marginRight: 4 }} />
            {truncateText(title)}
          </a>
        </Tooltip>
      ),
    },
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 80,
      filters: CITIES.map(city => ({ text: city, value: city })),
      onFilter: (value: any, record: any) => record.city === value,
    },
    {
      title: '提示词类型',
      dataIndex: 'promptType',
      key: 'promptType',
      width: 110,
      render: (type: string) => (
        <Tag color="blue">{getPromptTypeLabel(type)}</Tag>
      ),
    },
    {
      title: '投稿平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
    },
    {
      title: '发布网站',
      dataIndex: 'websiteName',
      key: 'websiteName',
      width: 140,
    },
    {
      title: '回链',
      dataIndex: 'publishedUrl',
      key: 'publishedUrl',
      width: 200,
      render: (url: string | null, record: any) => {
        const isEditing = editingCell?.articleId === record.article.id && editingCell?.field === 'published_url';

        if (isEditing) {
          return (
            <Space>
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="粘贴回链接..."
                onPressEnter={saveEdit}
                size="small"
                style={{ width: 180 }}
                autoFocus
              />
              <CheckOutlined onClick={saveEdit} style={{ color: '#52c41a', cursor: 'pointer' }} />
              <CloseOutlined onClick={cancelEdit} style={{ color: '#ff4d4f', cursor: 'pointer' }} />
            </Space>
          );
        }

        if (url) {
          return (
            <Space>
              <Tooltip title={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ maxWidth: 140, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <LinkOutlined /> {truncateText(url, 20)}
                </a>
              </Tooltip>
              <CopyOutlined
                onClick={() => copyToClipboard(url, '回链已复制')}
                style={{ cursor: 'pointer', color: '#666' }}
              />
              <EditOutlined
                onClick={() => startEditing(record.article.id, 'published_url', url)}
                style={{ cursor: 'pointer', color: '#666' }}
              />
            </Space>
          );
        }

        return (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => startEditing(record.article.id, 'published_url', null)}
          >
            添加回链
          </Button>
        );
      },
    },
    {
      title: '平台发稿时间',
      dataIndex: 'mediaPublishedAt',
      key: 'mediaPublishedAt',
      width: 150,
      sorter: (a: any, b: any) => {
        if (!a.mediaPublishedAt && !b.mediaPublishedAt) return 0;
        if (!a.mediaPublishedAt) return 1;
        if (!b.mediaPublishedAt) return -1;
        return new Date(a.mediaPublishedAt).getTime() - new Date(b.mediaPublishedAt).getTime();
      },
      render: (time: string | null, record: any) => {
        const isEditing = editingCell?.articleId === record.article.id && editingCell?.field === 'media_published_at';

        if (isEditing) {
          return (
            <DatePicker
              showTime
              value={editValue ? dayjs(editValue) : null}
              onChange={(date) => {
                setEditValue(date?.toISOString() || '');
                // 选择日期后自动保存
                if (date) saveEdit();
              }}
              onBlur={cancelEdit}
              size="small"
              style={{ width: 160 }}
            />
          );
        }

        if (time) {
          return (
            <span
              onClick={() => startEditing(record.article.id, 'media_published_at', time)}
              style={{ cursor: 'pointer' }}
            >
              {dayjs(time).format('YYYY-MM-DD HH:mm')} <EditOutlined style={{ marginLeft: 4, color: '#666' }} />
            </span>
          );
        }

        return (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => startEditing(record.article.id, 'media_published_at', null)}
          >
            设置时间
          </Button>
        );
      },
    },
  ];

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <Text type="danger">连接数据库失败，请检查 Supabase 配置</Text>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {/* 页面标题和操作栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>已完成任务</h2>
          <Text type="secondary">共 {filteredData.length} 条记录</Text>
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={exportToExcel}>
            导出 Excel
          </Button>
          <Button icon={<ExportOutlined />} onClick={exportToCSV}>
            导出 CSV
          </Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <div style={{
        background: '#fff',
        padding: '12px 20px',
        borderRadius: 8,
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}>
        <Space wrap>
          <select
            value={filterCity || ''}
            onChange={(e) => setFilterCity(e.target.value || undefined)}
            style={{ padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 6, minWidth: 100 }}
          >
            <option value="">全部城市</option>
            {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
          </select>

          <select
            value={filterPromptType || ''}
            onChange={(e) => setFilterPromptType(e.target.value || undefined)}
            style={{ padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 6, minWidth: 120 }}
          >
            <option value="">全部类型</option>
            {prompts.map(prompt => (
              <option key={prompt.id} value={prompt.id}>{prompt.type}</option>
            ))}
          </select>

          <select
            value={filterPlatform || ''}
            onChange={(e) => setFilterPlatform(e.target.value || undefined)}
            style={{ padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 6, minWidth: 120 }}
          >
            <option value="">全部平台</option>
            {[...new Set(managedWebsites.map(w => w.platform))].map(platform => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>

          <Input
            placeholder="搜索标题/城市/网站..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 200 }}
            prefix={<span>🔍</span>}
          />

          {(filterCity || filterPromptType || filterPlatform || searchText) && (
            <Button
              type="link"
              onClick={() => {
                setFilterCity(undefined);
                setFilterPromptType(undefined);
                setFilterPlatform(undefined);
                setSearchText('');
              }}
            >
              清除筛选
            </Button>
          )}
        </Space>
      </div>

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={filteredData}
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={{
          pageSize: 20,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        size="middle"
        locale={{ emptyText: '暂无已完成的任务' }}
        rowClassName={() => 'completed-table-row'}
        style={{
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      />

      {/* 文章预览弹窗 */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>文章预览</span>
          </Space>
        }
        open={!!previewArticle}
        onCancel={() => setPreviewArticle(null)}
        width={800}
        footer={[
          <Button key="copy-html" icon={<CopyOutlined />} onClick={() => {
            if (previewArticle?.content) copyToClipboard(previewArticle.content, 'HTML内容已复制');
          }}>
            复制HTML
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreviewArticle(null)}>
            关闭
          </Button>,
        ]}
      >
        {previewArticle && (
          <div>
            <h3 style={{ marginBottom: 16, color: '#1a1a1a' }}>
              {extractTitle(previewArticle.content)}
            </h3>
            <div
              className="ql-editor"
              style={{
                border: '1px solid #e8e8e8',
                borderRadius: 8,
                padding: 20,
                minHeight: 300,
                maxHeight: 500,
                overflowY: 'auto',
              }}
              dangerouslySetInnerHTML={{ __html: previewArticle.content }}
            />
          </div>
        )}
      </Modal>

      {/* 自定义样式 */}
      <style>{`
        .completed-table-row:hover {
          background-color: #fafafa !important;
        }
        .ant-table-thead > tr > th {
          background-color: #f5f7fa !important;
          font-weight: 600 !important;
          color: #333 !important;
        }
      `}</style>
    </div>
  );
}
