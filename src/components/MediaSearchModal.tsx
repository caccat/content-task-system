import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Input, Table, Tag, Space, message, Empty, Button, Progress } from 'antd';
import { SearchOutlined, LinkOutlined, StopOutlined } from '@ant-design/icons';
import type { LutuituiMedia } from '../types';

const MAX_AUTO_PAGES = 125; // 125 页 × 20 条 = 2500 条，足够覆盖绝大多数搜索
const MIN_MATCHES_BEFORE_STOP = 10; // 找到 10 个匹配后停止自动翻页

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
  const [autoLoading, setAutoLoading] = useState(false); // 是否在自动翻页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [autoPagesLoaded, setAutoPagesLoaded] = useState(0);
  const stopAutoRef = useRef(false);
  const totalPagesRef = useRef(0); // 用 ref 避免闭包陈旧问题

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
      // 如果有初始关键词，自动搜索
      if (initialKeyword) {
        startSearch(1, initialKeyword);
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

  // 自动翻页搜索：从 startPage 开始逐页加载，直到找到足够匹配或达到上限
  const autoPaginateSearch = useCallback(async (startPage: number, searchKeyword: string) => {
    setAutoLoading(true);
    stopAutoRef.current = false;
    let totalFound = 0;
    let page = startPage;
    const maxPage = Math.min(startPage + MAX_AUTO_PAGES - 1, totalPagesRef.current || 9999);

    while (page <= maxPage && !stopAutoRef.current) {
      try {
        const data = await fetchPage(page);
        totalPagesRef.current = data.pages;
        setTotalRecords(data.total);

        // 去重添加
        setAllRecords(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const newRecords = data.records.filter((r: LutuituiMedia) => !existingIds.has(r.id));
          return [...prev, ...newRecords];
        });
        setCurrentPage(page);
        setAutoPagesLoaded(page - startPage + 1);

        // 检查当前所有已加载的记录中有多少匹配
        setAllRecords(prev => {
          const kw = searchKeyword.toLowerCase();
          const matches = prev.filter(r =>
            r.name.toLowerCase().includes(kw) ||
            r.platformName.toLowerCase().includes(kw) ||
            r.regionName.toLowerCase().includes(kw) ||
            String(r.id).includes(kw)
          );
          totalFound = matches.length;
          return prev;
        });

        if (totalFound >= MIN_MATCHES_BEFORE_STOP) {
          break;
        }

        page++;
      } catch {
        message.error('加载失败，已停止搜索');
        break;
      }
    }

    setAutoLoading(false);
    setLoading(false);
  }, [fetchPage]);

  // 开始搜索
  const startSearch = useCallback((page: number, kw?: string) => {
    const searchKeyword = kw ?? keyword;
    if (!searchKeyword.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setAllRecords([]);
    setCurrentPage(1);
    totalPagesRef.current = 0;
    setTotalRecords(0);
    setAutoPagesLoaded(0);
    stopAutoRef.current = false;

    // 先加载第一页，然后自动翻页
    fetchPage(page).then(data => {
      if (stopAutoRef.current) {
        setLoading(false);
        return;
      }
      setAllRecords(data.records);
      totalPagesRef.current = data.pages;
      setTotalRecords(data.total);
      setCurrentPage(page);
      setAutoPagesLoaded(1);

      // 检查第一页是否有足够匹配
      const kw = searchKeyword.toLowerCase();
      const firstPageMatches = data.records.filter((r: LutuituiMedia) =>
        r.name.toLowerCase().includes(kw) ||
        r.platformName.toLowerCase().includes(kw) ||
        r.regionName.toLowerCase().includes(kw) ||
        String(r.id).includes(kw)
      );

      if (firstPageMatches.length < MIN_MATCHES_BEFORE_STOP && data.pages > 1) {
        // 继续自动翻页
        autoPaginateSearch(page + 1, searchKeyword);
      } else {
        setLoading(false);
      }
    }).catch(() => {
      message.error('网络错误');
      setLoading(false);
    });
  }, [keyword, fetchPage, autoPaginateSearch]);

  const handleStopAuto = () => {
    stopAutoRef.current = true;
    setAutoLoading(false);
    setLoading(false);
  };

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
            onPressEnter={() => startSearch(1)}
          />
          <Button
            type="default"
            size="large"
            onClick={() => startSearch(1)}
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
                自动搜索中... (第 {currentPage} 页)
              </span>
            )}
          </div>
        )}

        {autoLoading && (
          <Progress
            percent={Math.min(Math.round((autoPagesLoaded / MAX_AUTO_PAGES) * 100), 99)}
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
              ? <Empty description={`正在搜索中，已加载 ${allRecords.length} 条...`} />
              : hasSearched
                ? <Empty description="未找到匹配的媒体，尝试其他关键词" />
                : <Empty description="输入关键词搜索鹿推推自媒体" />
          }}
        />

        {hasSearched && !autoLoading && filteredRecords.length < MIN_MATCHES_BEFORE_STOP && currentPage < totalPagesRef.current && (
          <div style={{ textAlign: 'center' }}>
            <Button
              type="dashed"
              onClick={() => autoPaginateSearch(currentPage + 1, keyword)}
              loading={autoLoading}
            >
              加载更多数据（当前匹配 {filteredRecords.length} 条，可能更多）
            </Button>
          </div>
        )}

        {hasSearched && !autoLoading && currentPage >= totalPagesRef.current && filteredRecords.length === 0 && totalRecords > 0 && (
          <div style={{ textAlign: 'center', color: '#999', fontSize: 12 }}>
            已加载全部 {totalRecords.toLocaleString()} 条数据，未找到匹配项
          </div>
        )}
      </Space>
    </Modal>
  );
}
