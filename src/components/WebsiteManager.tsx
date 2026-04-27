import { useState, useMemo } from 'react';
import { Card, Table, Button, Input, InputNumber, Space, message, Popconfirm, Tag, Select } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useWebsites } from '../hooks/useWebsites';
import type { Website, WebsiteStatus } from '../types';
import { WEBSITE_STATUS_OPTIONS } from '../types';

export default function WebsiteManager() {
  const { websites, loading, createWebsite, updateWebsite, updateWebsiteStatus, deleteWebsite } = useWebsites();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Website>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newWebsite, setNewWebsite] = useState<Partial<Website>>({ name: '', platform: '', price: 0, status: undefined });
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WebsiteStatus | 'all'>('all');

  // 筛选后的网站列表
  const filteredWebsites = useMemo(() => {
    if (statusFilter === 'all') return websites;
    return websites.filter(w => w.status === statusFilter);
  }, [websites, statusFilter]);

  // 获取状态标签颜色
  const getStatusColor = (status: WebsiteStatus) => {
    switch (status) {
      case 'round1_test': return 'orange';
      case 'round2_test': return 'blue';
      case 'approved': return 'green';
      default: return 'default';
    }
  };

  // 获取状态显示文本
  const getStatusLabel = (status: WebsiteStatus) => {
    const option = WEBSITE_STATUS_OPTIONS.find(o => o.value === status);
    return option?.label || status;
  };

  // 格式化时间
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

  // 开始编辑
  const startEdit = (record: Website) => {
    setEditingId(record.id);
    setEditingData({ ...record });
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setEditingData({});
  };

  // 保存编辑
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

  // 更新状态
  const handleStatusChange = async (id: string, status: WebsiteStatus) => {
    try {
      await updateWebsiteStatus(id, status);
      message.success('状态更新成功');
    } catch {
      message.error('状态更新失败');
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    try {
      await deleteWebsite(id);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  // 开始添加
  const startAdd = () => {
    setIsAdding(true);
    setNewWebsite({ name: '', platform: '', price: 0, status: undefined });
  };

  // 取消添加
  const cancelAdd = () => {
    setIsAdding(false);
    setNewWebsite({ name: '', platform: '', price: 0, status: undefined });
  };

  // 确认添加
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

  const columns = [
    {
      title: '网站名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
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
      width: 200,
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
      width: 150,
      render: (price: number, record: Website) => {
        if (editingId === record.id) {
          return (
            <InputNumber
              value={editingData.price}
              onChange={(value) => setEditingData({ ...editingData, price: value || 0 })}
              min={0}
              precision={2}
              style={{ width: 120 }}
              placeholder="单价"
            />
          );
        }
        return <Tag color="green">¥{price.toFixed(2)}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: WebsiteStatus, record: Website) => {
        if (editingId === record.id) {
          return (
            <Select
              value={editingData.status}
              onChange={(value) => setEditingData({ ...editingData, status: value })}
              style={{ width: 120 }}
              options={WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
            />
          );
        }
        return (
          <Select
            value={status}
            onChange={(value) => handleStatusChange(record.id, value)}
            style={{ width: 120 }}
            options={WEBSITE_STATUS_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
          />
        );
      },
    },
    {
      title: '状态更新时间',
      dataIndex: 'status_updated_at',
      key: 'status_updated_at',
      width: 170,
      render: (date: string) => formatDateTime(date),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Website) => {
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
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
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Input
                  value={newWebsite.name}
                  onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })}
                  placeholder="网站名称"
                  style={{ width: 150 }}
                />
                <Input
                  value={newWebsite.platform}
                  onChange={(e) => setNewWebsite({ ...newWebsite, platform: e.target.value })}
                  placeholder="投稿平台"
                  style={{ width: 150 }}
                />
                <InputNumber
                  value={newWebsite.price}
                  onChange={(value) => setNewWebsite({ ...newWebsite, price: value || 0 })}
                  min={0}
                  precision={2}
                  style={{ width: 100 }}
                  placeholder="发布单价"
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
          locale={{ emptyText: '暂无网站数据，请点击右上角添加' }}
        />
      </Card>
    </div>
  );
}
