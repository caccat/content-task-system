import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Input, Table, Tag, Space, message, Empty, Button, Progress } from 'antd';
import { SearchOutlined, LinkOutlined, StopOutlined } from '@ant-design/icons';
import type { LutuituiMedia } from '../types';

const BATCH_SIZE = 10; // 每批并发加载 10 页
const MIN_MATCHES_BEFORE_STOP = 10; // 找到 10 个匹配后停止

interface MediaSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: Pick<LutuituiMedia, 'id' | 'name' | 'platformName' | 'regionName' | 'costPrice'>) => void;
  initialKeyword?: string;
}

// 过滤函数
function matchesKeyword(record: LutuituiMedia, kw: string): boolean {
  return (
    record.name.toLowerCase().includes(kw) ||
    record.platformName.toLowerCase().includes(kw) ||
    record.regionName.toLowerCase().includes(kw) ||
    String(record.id).includes(kw)
  );
}

export default function MediaSearchModal({ open, onClose, onSelect, initialKeyword = '' }: MediaSearchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [allRecords, setAllRecords] = useState<LutuituiMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [autoPagesLoaded, setAutoPagesLoaded] = useState(0);
  const stopAutoRef = useRef(false);
  const totalPagesRef = useRef(0);

  // 打开弹窗时重置
  useEffect(() => {
    if (open) {
      setKeyword(initialKeyword);
      setAllRecords([]);
      setCurrentPage(1);
      totalPagesRef.current = 0;
      setTotalRecords(0);
      setHasSearched(false);
      setAutoLoading(false);
      setAutoPagesLoaded(0);
      stopAutoRef.current = false;
      if (initialKeyword) {
        startSearch(initialKeyword);
      }
    }
  }, [open, initialKeyword]);

  const fetchPage = useCallback(async (page: number): Promise<{ records: LutuituiMedia[]; total: number; pages: number }> => {
    const response = await fetch('/api/lutuitui-media-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: page, size: 20 }),
    });
    const result = await response.json();
    if (result.success) {
      return {
        records: result.data.records || [],
        total: result.data.total || 0,
        pages: result.data.pages || 0,
      };
    }
    throw new Error(result.error || '加载失败');
  }, []);

  // 并发批量加载：每批 BATCH_SIZE 页，直到遍历全部或用户停止
  const concurrentSearch = useCallback(async (startPage: number, searchKeyword: string) => {
    setAutoLoading(true);
    stopAutoRef.current = false;
    const totalPages = totalPagesRef.current;
    if (totalPages <= 0) { setAutoLoading(false); setLoading(false); return; }

    let batchStart = startPage;
    let foundEnough = false;

    while (batchStart <= totalPages && !stopAutoRef.current && !foundEnough) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
      const pages: number[] = [];
      for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

      try {
        const results = await Promise.allSettled(pages.map(p => fetchPage(p)));

        const newRecords: LutuituiMedia[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            newRecords.push(...r.value.records);
          }
        }

        setAllRecords(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const deduped = newRecords.filter(r => !existingIds.has(r.id));
          const merged = [...prev, ...deduped];

          // 检查是否已有足够匹配
          const kw = searchKeyword.toLowerCase();
          if (merged.filter(r => matchesKeyword(r, kw)).length >= MIN_MATCHES_BEFORE_STOP) {
            foundEnough = true;
          }
          return merged;
        });

        setCurrentPage(batchEnd);
        setAutoPagesLoaded(batchEnd);
      } catch {
        // 单批失败不中断，继续下一批
      }

      batchStart = batchEnd + 1;
    }

    setAutoLoading(false);
    setLoading(false);
  }, [fetchPage]);

  // 开始搜索
  const startSearch = useCallback((kw?: string) => {
    const searchKeyword = (kw ?? keyword).trim();
    if (!searchKeyword) return;

    setLoading(true);
    setHasSearched(true);
    setAllRecords([]);
    setCurrentPage(1);
    setTotalRecords(0);
    setAutoPagesLoaded(0);
    stopAutoRef.current = false;

    fetchPage(1).then(data => {
      if (stopAutoRef.current) { setLoading(false); return; }

      totalPagesRef.current = data.pages;
      setTotalRecords(data.total);
      setAllRecords(data.records);
      setCurrentPage(1);
      setAutoPagesLoaded(1);

      const kw = searchKeyword.toLowerCase();
      const firstMatches = data.records.filter(r => matchesKeyword(r, kw));

      if (firstMatches.length < MIN_MATCHES_BEFORE_STOP && data.pages > 1) {
        concurrentSearch(2, searchKeyword);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      message.error('网络错误，请重试');
      setLoading(false);
    });
  }, [keyword, fetchPage, concurrentSearch]);

  const handleStopAuto = () => {
    stopAutoRef.current = true;
    setAutoLoading(false);
    setLoading(false);
  };

  // 客户端过滤
  const filteredRecords = useMemo(() => {
    if (!keyword.trim()) return allRecords;
    const kw = keyword.toLowerCase();
    return allRecords.filter(r => matchesKeyword(r, kw));
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

  const progressPercent = totalPagesRef.current > 0
    ? Math.min(Math.round((autoPagesLoaded / totalPagesRef.current) * 100), 99)
    : 0;

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
            onPressEnter={() => startSearch()}
          />
          <Button
            type="default"
            size="large"
            onClick={() => startSearch()}
            loading={loading && !autoLoading}
            disabled={autoLoading}
          >
            搜索
          </Button>
          {autoLoading && (
            <Button
              type="default"
              size="large"
              danger
              icon={<StopOutlined />}
              onClick={handleStopAuto}
            >
              停止
            </Button>
          )}
        </div>

        {hasSearched && (
          <div style={{ color: '#999', fontSize: 12 }}>
            共 {totalRecords.toLocaleString()} 个媒体，已加载 {allRecords.length.toLocaleString()} 条
            {keyword && (
              <span style={{ color: '#1890ff', marginLeft: 8 }}>
                匹配 {filteredRecords.length} 条
              </span>
            )}
            {autoLoading && (
              <span style={{ marginLeft: 8, color: '#faad14' }}>
                搜索中... {autoPagesLoaded}/{totalPagesRef.current} 页
              </span>
            )}
          </div>
        )}

        {autoLoading && (
          <Progress
            percent={progressPercent}
            status="active"
            showInfo={false}
            strokeColor="#1677ff"
            size="small"
          />
        )}

        <Table
          dataSource={filteredRecords}
          columns={columns}
          rowKey="id"
          loading={loading && !autoLoading}
          size="small"
          pagination={false}
          scroll={{ y: 360 }}
          locale={{
            emptyText: autoLoading
              ? <Empty description={`正在搜索中，已加载 ${allRecords.length.toLocaleString()} 条...`} />
              : hasSearched
                ? <Empty description="未找到匹配的媒体，尝试其他关键词" />
                : <Empty description="输入关键词搜索鹿推推自媒体" />
          }}
        />

        {hasSearched && !autoLoading && currentPage < totalPagesRef.current && (
          <div style={{ textAlign: 'center' }}>
            <Button
              type="dashed"
              onClick={() => concurrentSearch(currentPage + 1, keyword)}
              loading={autoLoading}
            >
              继续搜索更多（已搜索 {currentPage}/{totalPagesRef.current} 页）
            </Button>
          </div>
        )}

        {hasSearched && !autoLoading && currentPage >= totalPagesRef.current && filteredRecords.length === 0 && totalRecords > 0 && (
          <div style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
            已搜索全部 {totalRecords.toLocaleString()} 条数据，未找到匹配项
          </div>
        )}
      </Space>
    </Modal>
  );
}
