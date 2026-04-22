import { useState } from 'react';
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
import type { ArticleExample } from '../types';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { usePrompts } from '../hooks/usePrompts';
import type { Prompt } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

export default function PromptManager() {
  const { prompts, loading, createPrompt, updatePrompt, deletePrompt } = usePrompts();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [exampleList, setExampleList] = useState<ArticleExample[]>([]);

  // 处理编辑时初始化示例列表
  const initExampleList = (record: Prompt) => {
    if (record.example_urls && Array.isArray(record.example_urls)) {
      setExampleList(record.example_urls);
    } else if (record.example_url) {
      // 兼容旧数据：只有一个 example_url
      setExampleList([{ note: '', url: record.example_url }]);
    } else {
      setExampleList([]);
    }
  };

  // 添加示例
  const addExample = () => {
    setExampleList([...exampleList, { note: '', url: '' }]);
  };

  // 移除示例
  const removeExample = (index: number) => {
    const newList = exampleList.filter((_, i) => i !== index);
    setExampleList(newList);
  };

  // 更新示例
  const updateExample = (index: number, field: 'note' | 'url', value: string) => {
    const newList = [...exampleList];
    newList[index] = { ...newList[index], [field]: value };
    setExampleList(newList);
  };

  const handleAdd = () => {
    setExampleList([]);
    setEditingPrompt(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: Prompt) => {
    setEditingPrompt(record);
    form.setFieldsValue({
      type: record.type,
      content: record.content,
    });
    initExampleList(record);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePrompt(id);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // 过滤掉空链接的示例
      const validExamples = exampleList.filter(ex => ex.url.trim() !== '');

      if (editingPrompt) {
        await updatePrompt(editingPrompt.id, {
          type: values.type,
          content: values.content,
          example_urls: validExamples.length > 0 ? validExamples : null,
        });
        message.success('更新成功');
      } else {
        await createPrompt({
          type: values.type,
          content: values.content,
          example_urls: validExamples.length > 0 ? validExamples : null,
        });
        message.success('添加成功');
      }
      setIsModalOpen(false);
    } catch {
      // validation or save error
    } finally {
      setSaving(false);
    }
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
      title: '文章示例',
      dataIndex: 'example_urls',
      key: 'example_urls',
      render: (exampleUrls: ArticleExample[] | null, record: Prompt) => {
        // 兼容旧数据
        if (!exampleUrls && record.example_url) {
          return (
            <a href={record.example_url} target="_blank" rel="noopener noreferrer">
              <LinkOutlined /> 1个示例
            </a>
          );
        }
        if (!exampleUrls || exampleUrls.length === 0) return '-';
        return (
          <span>
            <LinkOutlined /> {exampleUrls.length}个示例
          </span>
        );
      },
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
          loading={loading}
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
        confirmLoading={saving}
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

          <Form.Item label="文章示例链接">
            <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: 16 }}>
              {exampleList.map((example, index) => (
                <div key={index} style={{ marginBottom: index < exampleList.length - 1 ? 12 : 0 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="备注说明（如：优秀案例）"
                      value={example.note}
                      onChange={(e) => updateExample(index, 'note', e.target.value)}
                      style={{ width: '30%' }}
                    />
                    <Input
                      placeholder="示例链接 URL"
                      value={example.url}
                      onChange={(e) => updateExample(index, 'url', e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      danger
                      onClick={() => removeExample(index)}
                      disabled={exampleList.length === 1}
                    >
                      删除
                    </Button>
                  </Space.Compact>
                </div>
              ))}
              <Button
                type="dashed"
                onClick={addExample}
                icon={<PlusOutlined />}
                style={{ marginTop: 8, width: '100%' }}
              >
                添加示例
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
