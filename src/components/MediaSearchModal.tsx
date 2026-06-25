import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Input, Table, Tag, Space, message, Empty, Button } from 'antd';
import { SearchOutlined, LinkOutlined } from '@ant-design/icons';
import type { LutuituiMedia } from '../types';

interface MediaSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: Pick<LutuituiMedia, 'id' | 'name' | 'platformName' | 'regionName' | 'costPrice'>) => void;
  initialKeyword?: string;
}

export default function MediaSearchModal({ open, onClose, onSelect, initialKeyword = '' }: MediaSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [allRecords, setAllRecords] = useState<LutuituiMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // 打开弹窗时重置
  useEffect(() => {
    if (open) {
      setKeyword(initialKeyword);
      setAllRecords([]);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalRecords(0);
      setHasSearched(false);
      // 如果有初始关键词，自动搜索
      if (initialKeyword) {
        fetchPage(1);
      }
    }
  }, [open, initialKeyword]);

  const fetchPage = useCallback(async (page: number) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch('/api/lutuitui-media-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: page, size: 50 }),
      });
      const result = await response.json();
      if (result.success) {
        setAllRecords(prev => {
          // 去重：替换已加载页面的数据
          const existingIds = new Set(prev.map(r => r.id));
          const newRecords = result.data.records.filter((r: LutuituiMedia) => !existingIds.has(r.id));
          return [...prev, ...newRecords];
        });
        setCurrentPage(page);
        setTotalPages(result.data.pages);
        setTotalRecords(result.data.total);
      } else {
        message.error(result.error || '加载失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  // 客户端过滤
  const filteredRecords = useMemo(() => {
    if (!keyword.trim()) return allRecords;
    const kw = keyword.toLowerCase();
    return allRecords.filter(r =>
      r.name.toLowerCase().includes(kw) ||
      r.platformName.toLowerCase().includes(kw) ||
      r.regionName.toLowerCase().includes(kw) ||
      String(r.id).includes(kw)
    );
  }, [allRecords, keyword]);

  const handleSelect = (media: LutuituiMedia) => {
    onSelect({
      id: media.id,
      name: media.name,
      platformName: media.platformName,
      regionName: media.regionName,
      costPrice: media.costPrice,
    });
    onClose();
  };

  const columns = [
    {
      title: '媒体名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '平台',
      dataIndex: 'platformName',
      key: 'platformName',
      width: 100,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '地区',
      dataIndex: 'regionName',
      key: 'regionName',
      width: 100,
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: '价格',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 80,
      render: (price: number) => (
        <Tag color="green">{price != null ? `¥${price}` : '-'}</Tag>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 60,
      render: (_: unknown, record: LutuituiMedia) => (
        <Button
          type="primary"
          size="small"
          icon={<LinkOutlined />}
          onClick={() => handleSelect(record)}
        >
          绑定
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title="搜索并绑定鹿推推自媒体"
      open={open}
      onCancel={onClose}
      width={750}
      footer={null}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            placeholder="搜索媒体名称、平台、地区或ID..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            style={{ flex: 1 }}
            onPressEnter={() => {
              if (allRecords.length === 0) fetchPage(1);
            }}
          />
          <Button
            type="default"
            size="large"
            onClick={() => fetchPage(1)}
            loading={loading}
          >
            搜索
          </Button>
        </div>

        <div style={{ color: '#999', fontSize: 12 }}>
          {hasSearched && !loading && (
            <>
              共 {totalRecords.toLocaleString()} 个媒体，已加载 {allRecords.length.toLocaleString()} 条
              {keyword && filteredRecords.length !== allRecords.length && (
                <span style={{ color: '#1890ff' }}>，匹配 {filteredRecords.length} 条</span>
              )}
            </>
          )}
        </div>

        <Table
          dataSource={filteredRecords}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 360 }}
          locale={{ emptyText: hasSearched ? <Empty description="未找到匹配的媒体，尝试其他关键词" /> : <Empty description="输入关键词搜索鹿推推自媒体" /> }}
        />

        {totalPages > 1 && filteredRecords.length === allRecords.length && !keyword && (
          <div style={{ textAlign: 'center' }}>
            <Space>
              <Button
                disabled={currentPage <= 1}
                onClick={() => fetchPage(currentPage - 1)}
              >
                上一页
              </Button>
              <span style={{ color: '#666' }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                disabled={currentPage >= totalPages}
                onClick={() => fetchPage(currentPage + 1)}
              >
                下一页
              </Button>
            </Space>
          </div>
        )}

        {keyword && filteredRecords.length < allRecords.length && currentPage < totalPages && (
          <div style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
            本地过滤结果，加载更多数据可能找到更多匹配项
            <br />
            <Button type="link" size="small" onClick={() => fetchPage(currentPage + 1)}>
              加载第 {currentPage + 1} 页数据
            </Button>
          </div>
        )}
      </Space>
    </Modal>
  );
}
