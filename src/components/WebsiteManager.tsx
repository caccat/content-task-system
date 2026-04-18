import { useState, useEffect } from 'react';
import { Card, Table, Button, Input, InputNumber, Space, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';

interface Website {
  id: string;
  name: string;
  platform: string;
  price: number;
}

export default function WebsiteManager() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Website>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newWebsite, setNewWebsite] = useState<Partial<Website>>({ name: '', platform: '', price: 0 });

  // 从 localStorage 加载数据
  useEffect(() => {
    const saved = localStorage.getItem('managedWebsites');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setWebsites(parsed);
      } catch {
        console.error('Failed to parse websites');
      }
    }
  }, []);

  // 保存到 localStorage
  const saveWebsites = (data: Website[]) => {
    localStorage.setItem('managedWebsites', JSON.stringify(data));
    setWebsites(data);
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
  const saveEdit = () => {
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

    const updated = websites.map(w => 
      w.id === editingId 
        ? { ...w, ...editingData } as Website
        : w
    );
    saveWebsites(updated);
    setEditingId(null);
    setEditingData({});
    message.success('保存成功');
  };

  // 删除
  const handleDelete = (id: string) => {
    const updated = websites.filter(w => w.id !== id);
    saveWebsites(updated);
    message.success('删除成功');
  };

  // 开始添加
  const startAdd = () => {
    setIsAdding(true);
    setNewWebsite({ name: '', platform: '', price: 0 });
  };

  // 取消添加
  const cancelAdd = () => {
    setIsAdding(false);
    setNewWebsite({ name: '', platform: '', price: 0 });
  };

  // 确认添加
  const confirmAdd = () => {
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

    const website: Website = {
      id: 'website_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: newWebsite.name.trim(),
      platform: newWebsite.platform.trim(),
      price: newWebsite.price,
    };

    saveWebsites([...websites, website]);
    setIsAdding(false);
    setNewWebsite({ name: '', platform: '', price: 0 });
    message.success('添加成功');
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
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
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
        {isAdding && (
          <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Input
                  value={newWebsite.name}
                  onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })}
                  placeholder="网站名称"
                  style={{ width: 180 }}
                />
                <Input
                  value={newWebsite.platform}
                  onChange={(e) => setNewWebsite({ ...newWebsite, platform: e.target.value })}
                  placeholder="投稿平台"
                  style={{ width: 180 }}
                />
                <InputNumber
                  value={newWebsite.price}
                  onChange={(value) => setNewWebsite({ ...newWebsite, price: value || 0 })}
                  min={0}
                  precision={2}
                  style={{ width: 120 }}
                  placeholder="发布单价"
                  prefix="¥"
                />
              </Space>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={confirmAdd}>
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
          dataSource={websites}
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
