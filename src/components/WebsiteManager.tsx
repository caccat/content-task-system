import { useState, useMemo } from 'react';
import { Card, Table, Button, Input, InputNumber, Space, message, Popconfirm, Tag, Select, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { useWebsites } from '../hooks/useWebsites';
import type { Website, WebsiteStatus, LutuituiMedia } from '../types';
import { WEBSITE_STATUS_OPTIONS } from '../types';
import MediaSearchModal from './MediaSearchModal';

export default function WebsiteManager() {
  const { websites, loading, createWebsite, updateWebsite, updateWebsiteStatus, deleteWebsite } = useWebsites();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Website>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newWebsite, setNewWebsite] = useState<Partial<Website>>({ name: '', platform: '', price: 0, status: undefined });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WebsiteStatus | 'all'>('all');

  // 鹿推推搜索弹窗
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaModalTarget, setMediaModalTarget] = useState<'edit' | 'add' | null>(null);
  const [mediaSearchKeyword, setMediaSearchKeyword] = useState('');

  // 筛选后的网站列表
  const filteredWebsites = useMemo(() => {
    if (statusFilter === 'all') return websites;
    return websites.filter(w => w.status === statusFilter);
  }, [websites, statusFilter]);

  const getStatusColor = (status: WebsiteStatus) => {
    switch (status) {
      case 'round1_test': return 'orange';
      case 'round2_test': return 'blue';
      case 'approved': return 'green';
      default: return 'default';
    }
  };

  const getStatusLabel = (status: WebsiteStatus) => {
    const option = WEBSITE_STATUS_OPTIONS.find(o => o.value === status);
    return option?.label || status;
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const startEdit = (record: Website) => {
    setEditingId(record.id);
    setEditingData({ ...record });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingData({});
  };

  const saveEdit = async () => {
    if (!editingData.name?.trim()) {
      message.error('请输入网站名称');
      return;
    }
    if (!editingData.platform?.trim()) {
      message.error('请输入投稿平台');
      return;
    }
    if (editingData.price === undefined || editingData.price < 0) {
      message.error('请输入有效的发布单价');
      return;
    }

    setSaving(true);
    try {
      await updateWebsite(editingId!, {
        name: editingData.name.trim(),
        platform: editingData.platform.trim(),
        price: editingData.price,
        lutuitui_media_id: editingData.lutuitui_media_id,
        lutuitui_media_name: editingData.lutuitui_media_name,
      });
      setEditingId(null);
      setEditingData({});
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: WebsiteStatus) => {
    try {
      await updateWebsiteStatus(id, status);
      message.success('状态更新成功');
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebsite(id);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  const startAdd = () => {
    setIsAdding(true);
    setNewWebsite({ name: '', platform: '', price: 0, status: undefined });
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setNewWebsite({ name: '', platform: '', price: 0, status: undefined });
  };

  const confirmAdd = async () => {
    if (!newWebsite.name?.trim()) {
      message.error('请输入网站名称');
      return;
    }
    if (!newWebsite.platform?.trim()) {
      message.error('请输入投稿平台');
      return;
    }
    if (newWebsite.price === undefined || newWebsite.price < 0) {
      message.error('请输入有效的发布单价');
      return;
    }
    if (!newWebsite.status) {
      message.error('请选择网站状态');
      return;
    }

    setSaving(true);
    try {
      await createWebsite({
        name: newWebsite.name.trim(),
        platform: newWebsite.platform.trim(),
        price: newWebsite.price,
        status: newWebsite.status,
        lutuitui_media_id: newWebsite.lutuitui_media_id,
        lutuitui_media_name: newWebsite.lutuitui_media_name,
      });
      setIsAdding(false);
      setNewWebsite({ name: '', platform: '', price: 0, status: undefined });
      message.success('添加成功');
    } catch {
      message.error('添加失败');
    } finally {
      setSaving(false);
    }
  };

  // 打开鹿推推搜索弹窗
  const openMediaSearch = (target: 'edit' | 'add') => {
    setMediaModalTarget(target);
    const name = target === 'edit' ? editingData.name : newWebsite.name;
    setMediaSearchKeyword(name || '');
    setMediaModalOpen(true);
  };

  // 选中媒体后的回调
  const onMediaSelect = (media: Pick<LutuituiMedia, 'id' | 'name' | 'platformName' | 'regionName' | 'costPrice'>) => {
    const update: Partial<Website> = {
      lutuitui_media_id: media.id,
      lutuitui_media_name: `${media.name} (${media.platformName}·${media.regionName}·¥${media.costPrice})`,
    };
    if (mediaModalTarget === 'edit') {
      setEditingData(prev => ({ ...prev, ...update }));
    } else {
      setNewWebsite(prev => ({ ...prev, ...update }));
    }
  };

  // 清除已绑定的鹿推推媒体
  const clearMediaBinding = (target: 'edit' | 'add') => {
    if (target === 'edit') {
      setEditingData(prev => ({ ...prev, lutuitui_media_id: null, lutuitui_media_name: null }));
    } else {
      setNewWebsite(prev => ({ ...prev, lutuitui_media_id: undefined, lutuitui_media_name: undefined }));
    }
    message.info('已解除绑定');
  };

  const columns = [
    {
      title: '网站名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (text: string, record: Website) => {
        if (editingId === record.id) {
          return (
            <Input
              value={editingData.name}
              onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
              placeholder="网站名称"
            />
          );
        }
        return <Tag color="blue">{text}</Tag>;
      },
    },
    {
      title: '投稿平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 120,
      render: (text: string, record: Website) => {
        if (editingId === record.id) {
          return (
            <Input
              value={editingData.platform}
              onChange={(e) => setEditingData({ ...editingData, platform: e.target.value })}
              placeholder="投稿平台"
            />
          );
        }
        return text;
      },
    },
    {
      title: '发布单价（元）',
      dataIndex: 'price',
      key: 'price',
      width: 120,
      render: (price: number, record: Website) => {
        if (editingId === record.id) {
          return (
            <InputNumber
              value={editingData.price}
              onChange={(value) => setEditingData({ ...editingData, price: value || 0 })}
              min={0}
              precision={2}
              style={{ width: 100 }}
              placeholder="单价"
            />
          );
        }
        return <Tag color="green">¥{price.toFixed(2)}</Tag>;
      },
    },
    {
      title: '鹿推推媒体',
      dataIndex: 'lutuitui_media_name',
      key: 'lutuitui_media',
      width: 220,
      render: (_text: string | null, record: Website) => {
        if (editingId === record.id) {
          return (
            <Space size={4}>
              {editingData.lutuitui_media_name ? (
                <>
                  <Tooltip title={editingData.lutuitui_media_name}>
                    <Tag color="purple" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}>
                      {editingData.lutuitui_media_name}
                    </Tag>
                  </Tooltip>
                  <Button size="small" type="link" danger onClick={() => clearMediaBinding('edit')}>解除</Button>
                </>
              ) : (
                <Button
                  size="small"
                  icon={<SearchOutlined />}
                  onClick={() => openMediaSearch('edit')}
                >
                  搜索绑定
                </Button>
              )}
            </Space>
          );
        }
        return record.lutuitui_media_name ? (
          <Tooltip title={record.lutuitui_media_name}>
            <Tag color="purple" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}>
              {record.lutuitui_media_name}
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="default">未绑定</Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: WebsiteStatus, record: Website) => {
        if (editingId === record.id) {
          return (
            <Select
              value={editingData.status}
              onChange={(value) => setEditingData({ ...editingData, status: value })}
              style={{ width: 100 }}
              options={WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
            />
          );
        }
        return (
          <Select
            value={status}
            onChange={(value) => handleStatusChange(record.id, value)}
            style={{ width: 100 }}
            options={WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
          />
        );
      },
    },
    {
      title: '状态更新时间',
      dataIndex: 'status_updated_at',
      key: 'status_updated_at',
      width: 150,
      render: (date: string) => formatDateTime(date),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: Website) => {
        if (editingId === record.id) {
          return (
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                onClick={saveEdit}
                loading={saving}
              >
                保存
              </Button>
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={cancelEdit}
              >
                取消
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => startEdit(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除"
              description="确定要删除这个网站吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
            >
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <Card
        title="发布网站管理"
        bordered={false}
        extra={
          !isAdding && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={startAdd}
            >
              添加网站
            </Button>
          )
        }
      >
        {/* 状态筛选 */}
        <div style={{ marginBottom: 16 }}>
          <Space>
            <span>筛选状态：</span>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              options={[
                { label: '全部', value: 'all' },
                ...WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value })),
              ]}
            />
            <span style={{ color: '#999' }}>
              共 {filteredWebsites.length} 个网站
            </span>
          </Space>
        </div>

        {isAdding && (
          <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              <Space wrap>
                <Input
                  value={newWebsite.name}
                  onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })}
                  placeholder="网站名称"
                  style={{ width: 140 }}
                />
                <Input
                  value={newWebsite.platform}
                  onChange={(e) => setNewWebsite({ ...newWebsite, platform: e.target.value })}
                  placeholder="投稿平台"
                  style={{ width: 140 }}
                />
                <InputNumber
                  value={newWebsite.price}
                  onChange={(value) => setNewWebsite({ ...newWebsite, price: value || 0 })}
                  min={0}
                  precision={2}
                  style={{ width: 100 }}
                  placeholder="单价"
                  prefix="¥"
                />
                <Select
                  value={newWebsite.status}
                  onChange={(value) => setNewWebsite({ ...newWebsite, status: value })}
                  style={{ width: 140 }}
                  placeholder="请选择状态"
                  options={WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
                />
              </Space>
              <Space>
                {newWebsite.lutuitui_media_name ? (
                  <>
                    <Tag color="purple">{newWebsite.lutuitui_media_name}</Tag>
                    <Button size="small" onClick={() => openMediaSearch('add')}>更换</Button>
                    <Button size="small" danger onClick={() => clearMediaBinding('add')}>解除</Button>
                  </>
                ) : (
                  <Button size="small" icon={<SearchOutlined />} onClick={() => openMediaSearch('add')}>
                    绑定鹿推推媒体
                  </Button>
                )}
              </Space>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={confirmAdd} loading={saving}>
                  确认添加
                </Button>
                <Button icon={<CloseOutlined />} onClick={cancelAdd}>
                  取消
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        <Table
          dataSource={filteredWebsites}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
          locale={{ emptyText: '暂无网站数据，请点击右上角添加' }}
        />
      </Card>

      <MediaSearchModal
        open={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        onSelect={onMediaSelect}
        initialKeyword={mediaSearchKeyword}
      />
    </div>
  );
}
