import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Popconfirm,
  Typography,
  Tag,
  message,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
} from '@ant-design/icons';

const { Title } = Typography;
const { TextArea } = Input;

interface Prompt {
  id: string;
  type: string;
  content: string;
  exampleUrl: string;
  createdAt: string;
}

const STORAGE_KEY = 'articlePrompts';

export default function PromptManager() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [form] = Form.useForm();

  // 从 localStorage 加载数据
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setPrompts(JSON.parse(stored));
      } catch {
        setPrompts([]);
      }
    }
  }, []);

  // 保存到 localStorage
  const savePrompts = (newPrompts: Prompt[]) => {
    setPrompts(newPrompts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrompts));
  };

  const handleAdd = () => {
    setEditingPrompt(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Prompt) => {
    setEditingPrompt(record);
    form.setFieldsValue({
      type: record.type,
      content: record.content,
      exampleUrl: record.exampleUrl,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    const newPrompts = prompts.filter((p) => p.id !== id);
    savePrompts(newPrompts);
    message.success('删除成功');
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editingPrompt) {
        // 编辑
        const newPrompts = prompts.map((p) =>
          p.id === editingPrompt.id
            ? { ...p, ...values }
            : p
        );
        savePrompts(newPrompts);
        message.success('更新成功');
      } else {
        // 新增
        const newPrompt: Prompt = {
          id: Date.now().toString(),
          ...values,
          createdAt: new Date().toISOString(),
        };
        savePrompts([...prompts, newPrompt]);
        message.success('添加成功');
      }
      setIsModalOpen(false);
    });
  };

  const columns = [
    {
      title: '提示词类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '提示词内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 400,
    },
    {
      title: '文章示例链接',
      dataIndex: 'exampleUrl',
      key: 'exampleUrl',
      render: (url: string) =>
        url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            <LinkOutlined /> 查看示例
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: Prompt) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个提示词吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={<Title level={4}>文章提示词管理</Title>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增提示词
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={prompts}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无提示词，请点击右上角添加' }}
        />
      </Card>

      <Modal
        title={editingPrompt ? '编辑提示词' : '新增提示词'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="type"
            label="提示词类型"
            rules={[{ required: true, message: '请输入提示词类型' }]}
          >
            <Input placeholder="例如：产品推广、品牌故事" />
          </Form.Item>

          <Form.Item
            name="content"
            label="提示词具体内容"
            rules={[{ required: true, message: '请输入提示词内容' }]}
          >
            <TextArea
              rows={6}
              placeholder="请输入详细的提示词内容..."
            />
          </Form.Item>

          <Form.Item
            name="exampleUrl"
            label="文章示例链接"
            rules={[
              {
                type: 'url',
                message: '请输入有效的URL地址',
                warningOnly: true,
              },
            ]}
          >
            <Input placeholder="https://example.com/article" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
