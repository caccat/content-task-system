import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, message, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../supabase';
import {
  CORPUS_KEY_PREFIX,
  CORPUS_PLACEHOLDER,
  parseCorpusEntries,
  type CorpusEntry,
  type CorpusRow,
} from '../utils/corpus.js';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CorpusFormValues {
  title: string;
  content: string;
}

export default function CorpusManager() {
  const [entries, setEntries] = useState<CorpusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CorpusEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CorpusFormValues>();
  const latestLoadId = useRef(0);

  const loadEntries = useCallback(async () => {
    const loadId = ++latestLoadId.current;
    try {
      const rows: CorpusRow[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await supabase
          .from('settings')
          .select('key,value,updated_at')
          .like('key', `${CORPUS_KEY_PREFIX}%`)
          .order('key')
          .range(offset, offset + pageSize - 1);
        if (queryError) throw queryError;
        const page = (data || []) as CorpusRow[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      const parsedEntries = parseCorpusEntries(rows);
      // 旧请求只让位给更新的一次读取；最新请求的结果会继续显示。
      if (loadId !== latestLoadId.current) {
        console.info('较早的语料库读取结果已被新请求取代');
        return;
      }
      setEntries(parsedEntries);
      setError(null);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : '未知错误';
      if (loadId !== latestLoadId.current) {
        console.warn('较早的语料库读取已被新请求取代:', detail);
        return;
      }
      setError(`读取语料库失败：${detail}`);
    } finally {
      if (loadId === latestLoadId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadIdRef = latestLoadId;
    const timer = window.setTimeout(() => void loadEntries(), 0);
    return () => {
      window.clearTimeout(timer);
      loadIdRef.current++;
    };
  }, [loadEntries]);

  const refreshEntries = () => {
    setLoading(true);
    void loadEntries();
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (entry: CorpusEntry) => {
    setEditing(entry);
    form.setFieldsValue({ title: entry.title, content: entry.content });
    setModalOpen(true);
  };

  const saveEntry = async () => {
    let values: CorpusFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    try {
      const value = JSON.stringify({ title: values.title.trim(), content: values.content.trim() });
      if (editing) {
        const { data, error: saveError } = await supabase
          .from('settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', editing.key)
          .select('key');
        if (saveError) throw saveError;
        if (!data?.length) throw new Error('原语料已不存在，请刷新后重试');
      } else {
        const { error: saveError } = await supabase
          .from('settings')
          .insert({ key: `${CORPUS_KEY_PREFIX}${crypto.randomUUID()}`, value });
        if (saveError) throw saveError;
      }
      setModalOpen(false);
      message.success(editing ? '语料已更新' : '语料已添加');
      await loadEntries();
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : '未知错误';
      setError(`保存语料失败：${detail}`);
      message.error(`保存语料失败：${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: CorpusEntry) => {
    try {
      const { data, error: deleteError } = await supabase
        .from('settings')
        .delete()
        .eq('key', entry.key)
        .select('key');
      if (deleteError) throw deleteError;
      if (!data?.length) throw new Error('语料已不存在，请刷新后重试');
      message.success('语料已删除');
      await loadEntries();
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : '未知错误';
      setError(`删除语料失败：${detail}`);
      message.error(`删除语料失败：${detail}`);
    }
  };

  return (
    <Card
      title={<Title level={4} style={{ margin: 0 }}>语料库</Title>}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshEntries}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增语料</Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        title="提示词联动"
        description={<>在文章提示词中插入 <Text code>{CORPUS_PLACEHOLDER}</Text>，AI 生成时会将这里的全部语料（标题和内容）填入该位置。没有占位符的提示词保持原样。</>}
        style={{ marginBottom: 16 }}
      />
      {error && (
        <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />
      )}
      <Table<CorpusEntry>
        rowKey="key"
        dataSource={entries}
        loading={loading}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: '暂无语料，请点击右上角添加' }}
        columns={[
          { title: '标题', dataIndex: 'title', key: 'title', width: 240 },
          { title: '内容', dataIndex: 'content', key: 'content', ellipsis: true },
          {
            title: '操作', key: 'actions', width: 180,
            render: (_, entry) => (
              <Space>
                <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(entry)}>编辑</Button>
                <Popconfirm
                  title="删除语料"
                  description={`确定删除“${entry.title}”吗？包含占位符的提示词将不再使用这条语料。`}
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => void deleteEntry(entry)}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑语料' : '新增语料'}
        open={modalOpen}
        onOk={() => void saveEntry()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="语料标题" rules={[{ required: true, whitespace: true, message: '请输入语料标题' }]}>
            <Input placeholder="例如：品牌介绍" maxLength={200} />
          </Form.Item>
          <Form.Item name="content" label="语料内容" rules={[{ required: true, whitespace: true, message: '请输入语料内容' }]}>
            <TextArea rows={12} placeholder="输入供 AI 写作参考的语料" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
