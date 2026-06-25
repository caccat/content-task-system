import { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Table, Tag, Space, message, Empty, Button } from 'antd';
import { SearchOutlined, LinkOutlined } from '@ant-design/icons';
import type { LutuituiMedia } from '../types';

interface MediaSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: Pick<LutuituiMedia, 'id' | 'name' | 'platformName' | 'regionName' | 'costPrice'>) => void;
  initialKeyword?: string;
}

const sourceColors: Record<string, string> = { media: 'purple', selfMedia: 'orange' };
const sourceLabels: Record<string, string> = { media: '媒体', selfMedia: '自媒体' };

export default function MediaSearchModal({ open, onClose, onSelect, initialKeyword = '' }: MediaSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [records, setRecords] = useState<LutuituiMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 打开弹窗时重置
  useEffect(() => {
    if (open) {
      setKeyword(initialKeyword);
      setRecords([]);
      setHasSearched(false);
      setLoading(false);
      if (initialKeyword) {
        doSearch(initialKeyword);
      }
    }
  }, [open, initialKeyword]);

  const doSearch = useCallback(async (kw?: string) => {
    const searchKeyword = (kw ?? keyword).trim();
    if (!searchKeyword) return;

    setLoading(true);
    setHasSearched(true);
    setRecords([]);

    try {
      const response = await fetch('/api/lutuitui-media-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: searchKeyword }),
      });
      const result = await response.json();
      if (result.success) {
        setRecords(result.data.records || []);
      } else {
        message.error(result.error || '搜索失败');
      }
    } catch {
      message.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

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
      width: 200,
      render: (text: string, record: LutuituiMedia) => (
        <Space>
          <strong>{text}</strong>
          {record.source && (
            <Tag color={sourceColors[record.source]} style={{ fontSize: 11 }}>
              {sourceLabels[record.source]}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '平台/门户',
      dataIndex: 'platformName',
      key: 'platformName',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '地区',
      dataIndex: 'regionName',
      key: 'regionName',
      width: 80,
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
      title="搜索并绑定鹿推推媒体"
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
            onPressEnter={() => doSearch()}
          />
          <Button
            type="primary"
            size="large"
            onClick={() => doSearch()}
            loading={loading}
          >
            搜索
          </Button>
        </div>

        {hasSearched && (
          <div style={{ color: '#999', fontSize: 12 }}>
            {loading ? (
              <span style={{ color: '#faad14' }}>正在搜索中，同时检索媒体库和自媒体库...</span>
            ) : (
              <span>
                找到 <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{records.length}</span> 条匹配结果
              </span>
            )}
          </div>
        )}

        <Table
          dataSource={records}
          columns={columns}
          rowKey={r => `${r.source || 'media'}-${r.id}`}
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 360 }}
          locale={{
            emptyText: loading
              ? <Empty description="正在搜索中..." />
              : hasSearched
                ? <Empty description="未找到匹配的媒体，尝试其他关键词" />
                : <Empty description="输入关键词搜索鹿推推自媒体和媒体库" />
          }}
        />
      </Space>
    </Modal>
  );
}
