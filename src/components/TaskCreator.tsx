import { useState, useEffect, useMemo } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Button, Card, message, Space, Tabs, Table, Tag, Divider, Typography, Collapse, Modal, Empty, Row, Col, Badge, Popconfirm, Checkbox, DatePicker as AntDatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined, CheckCircleOutlined, SettingOutlined, EyeOutlined, CalendarOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTasks } from '../hooks/useSupabase';
import { useWebsites } from '../hooks/useWebsites';
import { usePrompts } from '../hooks/usePrompts';
import { supabase } from '../supabase';
import { CITIES, WEBSITES as DEFAULT_WEBSITES, type Article } from '../types';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { Panel } = Collapse;

// 草稿存储键
const DRAFT_STORAGE_KEY = 'batch_task_draft';

// 从 Supabase 读取提示词类型
const usePromptTypes = () => {
  const { prompts } = usePrompts();
  // 转换为组件需要的格式
  return prompts.map(p => ({
    id: p.id,
    type: p.type,
    content: p.content,
    exampleUrl: p.example_url || '',
    createdAt: p.created_at,
  }));
};

// 自定义提示词类型选择组件
function PromptTypeSelect({
  value,
  onChange,
  placeholder = "请选择文章提示词类型",
  size = "large"
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "large" | "middle" | "small";
}) {
  const promptTypes = usePromptTypes();

  if (promptTypes.length === 0) {
    return (
      <Select
        value={value}
        onChange={onChange}
        placeholder="暂无提示词类型，请先在「文章提示词管理」中添加"
        style={{ width: '100%' }}
        size={size}
        disabled
      />
    );
  }

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
      size={size}
    >
      {promptTypes.map((prompt) => (
        <Select.Option key={prompt.id} value={prompt.id}>
          {prompt.type}
        </Select.Option>
      ))}
    </Select>
  );
}

// 自定义网站选择组件 - 从 Supabase 读取已管理的网站
function CustomWebsiteSelect({
  value = [],
  onChange,
  placeholder = "请选择发布网站"
}: {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
}) {
  const { websites, loading } = useWebsites();

  // 转换为 Select 需要的格式
  const websiteOptions = websites.map(w => ({
    value: w.id,
    label: `${w.name} (${w.platform})`,
  }));

  // 获取显示标签
  const getTagLabel = (id: string) => {
    const site = websites.find(w => w.id === id);
    return site ? `${site.name} (${site.platform})` : id;
  };

  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
      loading={loading}
      tokenSeparators={[]}
      tagRender={(props) => {
        const { value: tagValue, closable, onClose } = props;
        return (
          <Tag
            color="blue"
            closable={closable}
            onClose={onClose}
            style={{ marginRight: 3 }}
          >
            {getTagLabel(tagValue as string)}
          </Tag>
        );
      }}
    >
      {websiteOptions.map(site => (
        <Select.Option key={site.value} value={site.value}>
          {site.label}
        </Select.Option>
      ))}
    </Select>
  );
}

// 单条文章配置
interface ArticleConfig {
  id: string;
  city: string;
  type: string;
  typeLabel: string;
  websites: string[];
  writingSuggestions: string;
}

// 数量矩阵行 - 动态根据提示词类型生成
type QuantityRow = {
  city: string;
} & {
  [key: string]: number | string;
};

// 单个任务表单
function SingleTaskForm({ onSubmit, loading }: { onSubmit: (values: any) => void; loading: boolean }) {
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    await onSubmit({
      city: values.city,
      quantity: values.quantity,
      websites: values.websites,
      prompt_type: values.prompt_type,
      writing_suggestions: values.writing_suggestions || null,
      deadline: values.deadline.format('YYYY-MM-DD'),
      status: 'pending',
      created_by: '任务创建者',
    });
    form.resetFields();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{ quantity: 1 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Form.Item
          name="city"
          label="发布城市"
          rules={[{ required: true, message: '请选择发布城市' }]}
        >
          <Select placeholder="请选择发布城市" size="large">
            {CITIES.map(city => (
              <Select.Option key={city} value={city}>{city}</Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="quantity"
          label="发布数量"
          rules={[{ required: true, message: '请输入发布数量' }]}
        >
          <InputNumber
            min={1}
            max={100}
            style={{ width: '100%' }}
            size="large"
            placeholder="请输入需要发布的文章数量"
          />
        </Form.Item>

            <Form.Item
              name="websites"
              label="发布网站"
              rules={[{ required: true, message: '请选择发布网站' }]}
            >
              <CustomWebsiteSelect placeholder="请选择或添加发布网站" />
            </Form.Item>

        <Form.Item
          name="prompt_type"
          label="文章提示词类型"
          rules={[{ required: true, message: '请选择文章提示词类型' }]}
        >
          <PromptTypeSelect />
        </Form.Item>

        <Form.Item
          name="writing_suggestions"
          label="文章写作建议"
        >
          <TextArea
            rows={4}
            placeholder="请输入文章写作建议（可选）"
            showCount
            maxLength={500}
          />
        </Form.Item>

        <Form.Item
          name="deadline"
          label="文章完成日期"
          rules={[{ required: true, message: '请设置文章完成日期' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            size="large"
            disabledDate={(current) => current && current < dayjs().startOf('day')}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            icon={<PlusOutlined />}
            loading={loading}
            block
          >
            创建任务
          </Button>
        </Form.Item>
      </Space>
    </Form>
  );
}

// 网站配置项
interface WebsiteConfig {
  websiteId: string;
  count: number;
  notes: string[]; // 每篇文章的备注
}

// 批量任务行数据
interface BatchTaskRow {
  id: string;
  city: string;
  totalCount: number;
  deadline: dayjs.Dayjs;
  promptTypeConfigs: Record<string, WebsiteConfig[]>; // key: promptTypeId
}

// 批量任务创建 - 新设计
function BatchTaskForm({ onSubmit, loading, hideCreatedTab = false }: { onSubmit: (tasks: any[]) => void; loading: boolean; hideCreatedTab?: boolean }) {
  const [activeTab, setActiveTab] = useState<'create' | 'created'>('create');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [activePromptType, setActivePromptType] = useState<string>('');
  const promptTypes = usePromptTypes();
  const { websites: managedWebsites } = useWebsites();

  // 创建空行
  const createEmptyRow = (): BatchTaskRow => {
    const configs: Record<string, WebsiteConfig[]> = {};
    promptTypes.forEach(type => {
      configs[type.id] = [];
    });
    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      city: '',
      totalCount: 0,
      deadline: dayjs(),
      promptTypeConfigs: configs,
    };
  };

  const [rows, setRows] = useState<BatchTaskRow[]>([createEmptyRow()]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // 页面加载时恢复草稿
  useEffect(() => {
    if (draftRestored) return; // 避免重复恢复
    
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (Array.isArray(draft) && draft.length > 0) {
          // 将 deadline 字符串转换为 dayjs 对象
          const restoredRows = draft.map((row: any) => ({
            ...row,
            deadline: dayjs(row.deadline),
          }));
          setRows(restoredRows);
          setDraftRestored(true);
          message.info('已恢复上次保存的草稿');
        }
      } catch (e) {
        console.error('恢复草稿失败:', e);
      }
    }
  }, [draftRestored]);

  // 当提示词类型变化时，如果还没有恢复过草稿，则初始化数据
  useEffect(() => {
    if (promptTypes.length > 0 && !draftRestored) {
      // 只有在没有恢复过草稿时才创建空行
      const configs: Record<string, WebsiteConfig[]> = {};
      promptTypes.forEach(type => {
        configs[type.id] = [];
      });
      setRows([{
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        city: '',
        totalCount: 0,
        deadline: dayjs(),
        promptTypeConfigs: configs,
      }]);
    }
  }, [promptTypes.length, draftRestored]);

  // 添加行
  const addRow = () => {
    setRows([...rows, createEmptyRow()]);
  };

  // 删除行
  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      message.warning('至少保留一行');
      return;
    }
    setRows(rows.filter(r => r.id !== id));
    setSelectedRowKeys(selectedRowKeys.filter(k => k !== id));
  };

  // 删除选中行
  const removeSelectedRows = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的行');
      return;
    }
    if (rows.length - selectedRowKeys.length < 1) {
      message.warning('至少保留一行');
      return;
    }
    setRows(rows.filter(r => !selectedRowKeys.includes(r.id)));
    setSelectedRowKeys([]);
  };

  // 更新行数据
  const updateRow = (id: string, updates: Partial<BatchTaskRow>) => {
    setRows(rows.map(row => row.id === id ? { ...row, ...updates } : row));
  };

  // 更新城市的网站配置
  const updateWebsiteConfig = (rowId: string, promptTypeId: string, configs: WebsiteConfig[]) => {
    setRows(rows.map(row => {
      if (row.id !== rowId) return row;
      const newConfigs = { ...row.promptTypeConfigs, [promptTypeId]: configs };
      // 重新计算总数
      let total = 0;
      Object.values(newConfigs).forEach(typeConfigs => {
        typeConfigs.forEach(c => total += c.count);
      });
      return { ...row, promptTypeConfigs: newConfigs, totalCount: total };
    }));
  };

  // 获取网站名称
  const getWebsiteName = (id: string) => {
    const site = managedWebsites.find(w => w.id === id);
    return site ? `${site.name} (${site.platform})` : id;
  };

  // 渲染网站配置单元格 - 可点击编辑
  const renderWebsiteCell = (row: BatchTaskRow, promptTypeId: string) => {
    const configs = row.promptTypeConfigs[promptTypeId] || [];
    const totalCount = configs.reduce((sum, c) => sum + c.count, 0);
    
    if (totalCount === 0) {
      return (
        <Button 
          type="link" 
          size="small" 
          onClick={() => {
            setDetailRowId(row.id);
            setActivePromptType(promptTypeId);
            setDetailModalVisible(true);
          }}
        >
          配置网站
        </Button>
      );
    }

    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {configs.filter(c => c.count > 0).map((config, idx) => (
          <div key={idx}>
            <Tag>{getWebsiteName(config.websiteId)} × {config.count}</Tag>
          </div>
        ))}
        <Button 
          type="link" 
          size="small"
          onClick={() => {
            setDetailRowId(row.id);
            setActivePromptType(promptTypeId);
            setDetailModalVisible(true);
          }}
        >
          编辑
        </Button>
      </Space>
    );
  };

  // 处理城市批量粘贴
  const handleCityPaste = (rowId: string, pasteText: string) => {
    const cities = pasteText.split(/[\n,，;；]/).map(c => c.trim()).filter(c => c);
    if (cities.length === 0) return;
    
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    
    const newRows = [...rows];
    
    // 第一个城市填入当前行
    newRows[rowIndex] = { ...newRows[rowIndex], city: cities[0] };
    
    // 剩余的城市自动添加新行
    for (let i = 1; i < cities.length; i++) {
      const newRow = createEmptyRow();
      newRow.city = cities[i];
      // 复制当前行的其他配置
      newRow.totalCount = newRows[rowIndex].totalCount;
      newRow.deadline = newRows[rowIndex].deadline;
      newRow.promptTypeConfigs = JSON.parse(JSON.stringify(newRows[rowIndex].promptTypeConfigs));
      newRows.splice(rowIndex + i, 0, newRow);
    }
    
    setRows(newRows);
    message.success(`已粘贴 ${cities.length} 个城市`);
  };

  // 使用全局变量存储复制的配置（避免剪贴板权限问题）
  const [copiedConfig, setCopiedConfig] = useState<{ configs: WebsiteConfig[]; sourceKey: string } | null>(null);

  // 复制提示词配置
  const copyPromptConfig = (row: BatchTaskRow, promptTypeId: string) => {
    const configs = row.promptTypeConfigs[promptTypeId] || [];
    setCopiedConfig({ configs: JSON.parse(JSON.stringify(configs)), sourceKey: `${row.id}-${promptTypeId}` });
    message.success('配置已复制，点击其他格的"粘贴"按钮即可应用');
  };

  // 粘贴提示词配置
  const pastePromptConfig = (rowId: string, promptTypeId: string) => {
    if (!copiedConfig) {
      message.error('请先复制一个配置');
      return;
    }
    
    // 防止粘贴到同一个格
    if (copiedConfig.sourceKey === `${rowId}-${promptTypeId}`) {
      message.warning('不能粘贴到同一个格');
      return;
    }
    
    updateWebsiteConfig(rowId, promptTypeId, copiedConfig.configs);
    message.success('配置已粘贴');
  };

  // 表格列定义
  const columns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 140,
      render: (city: string, record: BatchTaskRow) => (
        <Input
          value={city}
          placeholder="输入城市"
          onChange={(e) => updateRow(record.id, { city: e.target.value })}
          onPaste={(e) => {
            e.preventDefault();
            const pasteText = e.clipboardData.getData('text');
            handleCityPaste(record.id, pasteText);
          }}
          size="small"
        />
      ),
    },
    {
      title: '文章总数',
      dataIndex: 'totalCount',
      key: 'totalCount',
      width: 90,
      render: (count: number, record: BatchTaskRow) => (
        <InputNumber
          min={0}
          value={count}
          onChange={(value) => updateRow(record.id, { totalCount: value || 0 })}
          style={{ width: 70 }}
          size="small"
        />
      ),
    },
    ...promptTypes.map(type => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{type.type}</span>
        </div>
      ),
      key: type.id,
      width: 180,
      render: (_: any, record: BatchTaskRow) => {
        const configs = record.promptTypeConfigs[type.id] || [];
        const totalCount = configs.reduce((sum, c) => sum + c.count, 0);
        
        return (
          <div 
            style={{ 
              position: 'relative', 
              padding: '4px',
              background: totalCount > 0 ? '#f6ffed' : 'transparent',
              borderRadius: 4,
            }}
          >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {totalCount > 0 && (
                <>
                  {configs.filter(c => c.count > 0).map((config, idx) => (
                    <Tag key={idx} color="blue">
                      {getWebsiteName(config.websiteId)} × {config.count}
                    </Tag>
                  ))}
                </>
              )}
              <Space size="small">
                <Button 
                  type="link" 
                  size="small"
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailRowId(record.id);
                    setActivePromptType(type.id);
                    setDetailModalVisible(true);
                  }}
                >
                  {totalCount === 0 ? '配置' : '编辑'}
                </Button>
                {totalCount > 0 && (
                  <Button 
                    type="link" 
                    size="small"
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPromptConfig(record, type.id);
                    }}
                  >
                    复制
                  </Button>
                )}
                <Button 
                  type="link" 
                  size="small"
                  style={{ padding: 0, fontSize: 12 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    pastePromptConfig(record.id, type.id);
                  }}
                >
                  粘贴
                </Button>
                {totalCount > 0 && (
                  <Button 
                    type="link" 
                    size="small"
                    danger
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateWebsiteConfig(record.id, type.id, []);
                      message.success('已清空');
                    }}
                  >
                    清空
                  </Button>
                )}
              </Space>
            </Space>
          </div>
        );
      },
    })),
    {
      title: '截止日期',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 130,
      render: (deadline: dayjs.Dayjs, record: BatchTaskRow) => (
        <DatePicker
          value={deadline}
          onChange={(date) => updateRow(record.id, { deadline: date || dayjs() })}
          style={{ width: 110 }}
          size="small"
          format="MM-DD"
        />
      ),
    },
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  // 生成任务数据
  const generateTasks = () => {
    const tasks: any[] = [];
    rows.forEach(row => {
      if (!row.city) return;
      
      // 为每个提示词类型的每个网站配置生成任务
      Object.entries(row.promptTypeConfigs).forEach(([promptTypeId, configs]) => {
        configs.forEach(config => {
          for (let i = 0; i < config.count; i++) {
            tasks.push({
              city: row.city,
              quantity: 1,
              websites: [config.websiteId],
              prompt_type: promptTypeId,
              writing_suggestions: config.notes[i] || null,
              deadline: row.deadline.format('YYYY-MM-DD'),
              status: 'pending',
              created_by: '任务创建者',
            });
          }
        });
      });
    });
    return tasks;
  };

  // 打开详细配置
  const openDetailConfig = () => {
    if (selectedRowKeys.length !== 1) {
      message.warning('请选中一行进行详细配置');
      return;
    }
    setDetailRowId(selectedRowKeys[0] as string);
    setDetailModalVisible(true);
  };

  // 预览并创建
  const handlePreview = () => {
    const validRows = rows.filter(r => r.city && r.totalCount > 0);
    if (validRows.length === 0) {
      message.error('请至少填写一个城市及文章数量');
      return;
    }
    setPreviewVisible(true);
  };

  // 保存草稿
  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(rows));
    message.success('草稿已保存');
  };

  // 清空草稿
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  // 确认创建
  const handleCreate = async () => {
    const tasks = generateTasks();
    if (tasks.length === 0) {
      message.error('没有可创建的任务');
      return;
    }
    await onSubmit(tasks);
    setPreviewVisible(false);
    setRows([createEmptyRow()]);
    setSelectedRowKeys([]);
    clearDraft(); // 创建成功后清空草稿
  };

  // 计算统计
  const stats = useMemo(() => {
    const totalCities = rows.filter(r => r.city).length;
    const totalArticles = rows.reduce((sum, r) => sum + r.totalCount, 0);
    const typeStats: Record<string, number> = {};
    rows.forEach(row => {
      Object.entries(row.promptTypeConfigs).forEach(([typeId, configs]) => {
        const count = configs.reduce((s, c) => s + c.count, 0);
        typeStats[typeId] = (typeStats[typeId] || 0) + count;
      });
    });
    return { totalCities, totalArticles, typeStats };
  }, [rows]);

  // 如果没有提示词类型，显示提示
  if (promptTypes.length === 0) {
    return (
      <Empty
        description={
          <Space direction="vertical" size="small">
            <Text>暂无提示词类型</Text>
            <Text type="secondary">请先在"内容生成者 → 文章提示词管理"中添加提示词类型</Text>
          </Space>
        }
      />
    );
  }

  const tabItems = [
    {
      key: 'create',
      label: '批量创建',
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Table
            rowSelection={rowSelection}
            dataSource={rows}
            columns={columns}
            pagination={false}
            size="small"
            bordered
            rowKey="id"
            scroll={{ x: 'max-content' }}
          />

          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={addRow}>
              添加行
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={removeSelectedRows} disabled={selectedRowKeys.length === 0}>
              删除选中
            </Button>
            <Button icon={<SettingOutlined />} onClick={openDetailConfig} disabled={selectedRowKeys.length !== 1}>
              详细配置
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleSaveDraft}>
              保存草稿
            </Button>
            <Button type="primary" icon={<EyeOutlined />} onClick={handlePreview}>
              预览并全部创建
            </Button>
          </Space>

          <Text type="secondary" style={{ fontSize: 12 }}>
            选中单元格后：⌘+C 复制  ⌘+V 粘贴  Delete 清空
          </Text>

          <Card size="small" style={{ background: '#f6ffed' }}>
            <Row gutter={16}>
              <Col>统计：共 {stats.totalCities} 个城市，{stats.totalArticles} 篇文章</Col>
              {promptTypes.map(type => (
                <Col key={type.id}>
                  {type.type}：{stats.typeStats[type.id] || 0} 篇
                </Col>
              ))}
            </Row>
          </Card>
        </Space>
      ),
    },
  ];

  if (!hideCreatedTab) {
    tabItems.push({
      key: 'created',
      label: '已创建任务',
      children: <CreatedTasksList />,
    });
  }

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'create' | 'created')}
        items={tabItems}
      />

      {/* 详细配置弹窗 */}
      <Modal
        title="详细配置"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>关闭</Button>,
        ]}
      >
        {detailRowId && (
          <DetailConfigPanel
            row={rows.find(r => r.id === detailRowId)!}
            promptTypes={promptTypes}
            managedWebsites={managedWebsites}
            defaultActiveType={activePromptType}
            onUpdate={(configs) => updateWebsiteConfig(detailRowId, configs.promptTypeId, configs.websiteConfigs)}
          />
        )}
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title="确认创建任务"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        onOk={handleCreate}
        confirmLoading={loading}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>共 {stats.totalCities} 个城市，{stats.totalArticles} 篇文章，将全部创建</Text>
          <Table
            dataSource={rows.filter(r => r.city)}
            columns={[
              { title: '城市', dataIndex: 'city', key: 'city' },
              { title: '文章总数', dataIndex: 'totalCount', key: 'totalCount' },
              ...promptTypes.map(type => ({
                title: type.type,
                key: type.id,
                render: (_: any, record: BatchTaskRow) => {
                  const configs = record.promptTypeConfigs[type.id] || [];
                  const count = configs.reduce((s, c) => s + c.count, 0);
                  return count > 0 ? count : '-';
                },
              })),
              { 
                title: '截止日期', 
                dataIndex: 'deadline', 
                key: 'deadline',
                render: (d: dayjs.Dayjs) => d.format('YYYY-MM-DD'),
              },
            ]}
            pagination={false}
            size="small"
          />
        </Space>
      </Modal>
    </>
  );
}

// 详细配置面板
function DetailConfigPanel({
  row,
  promptTypes,
  managedWebsites,
  defaultActiveType,
  onUpdate,
}: {
  row: BatchTaskRow;
  promptTypes: { id: string; type: string; content: string; exampleUrl: string; createdAt: string }[];
  managedWebsites: {id: string; name: string; platform: string}[];
  defaultActiveType?: string;
  onUpdate: (configs: { promptTypeId: string; websiteConfigs: WebsiteConfig[] }) => void;
}) {
  const [activeType, setActiveType] = useState(defaultActiveType || promptTypes[0]?.id);

  const addWebsiteConfig = (promptTypeId: string) => {
    const configs = row.promptTypeConfigs[promptTypeId] || [];
    onUpdate({
      promptTypeId,
      websiteConfigs: [...configs, { websiteId: '', count: 1, notes: [] }],
    });
  };

  const updateConfig = (promptTypeId: string, index: number, updates: Partial<WebsiteConfig>) => {
    const configs = [...(row.promptTypeConfigs[promptTypeId] || [])];
    configs[index] = { ...configs[index], ...updates };
    onUpdate({ promptTypeId, websiteConfigs: configs });
  };

  const removeConfig = (promptTypeId: string, index: number) => {
    const configs = (row.promptTypeConfigs[promptTypeId] || []).filter((_, i) => i !== index);
    onUpdate({ promptTypeId, websiteConfigs: configs });
  };

  const updateNote = (promptTypeId: string, configIndex: number, noteIndex: number, value: string) => {
    const configs = [...(row.promptTypeConfigs[promptTypeId] || [])];
    const config = configs[configIndex];
    const newNotes = [...config.notes];
    newNotes[noteIndex] = value;
    configs[configIndex] = { ...config, notes: newNotes };
    onUpdate({ promptTypeId, websiteConfigs: configs });
  };

  return (
    <div>
      <Title level={5}>{row.city} - 详细配置</Title>
      <Tabs activeKey={activeType} onChange={setActiveType}>
        {promptTypes.map(type => (
          <Tabs.TabPane tab={type.type} key={type.id}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {(row.promptTypeConfigs[type.id] || []).map((config, idx) => (
                <Card key={idx} size="small" title={`配置 ${idx + 1}`}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <Select
                        value={config.websiteId || undefined}
                        placeholder="选择网站"
                        style={{ width: 200 }}
                        onChange={(value) => updateConfig(type.id, idx, { websiteId: value })}
                      >
                        {managedWebsites.map(w => (
                          <Select.Option key={w.id} value={w.id}>
                            {w.name} ({w.platform})
                          </Select.Option>
                        ))}
                      </Select>
                      <InputNumber
                        min={1}
                        value={config.count}
                        onChange={(value) => updateConfig(type.id, idx, { count: value || 1 })}
                        style={{ width: 80 }}
                      />
                      <Button danger size="small" onClick={() => removeConfig(type.id, idx)}>
                        删除
                      </Button>
                    </Space>
                    
                    {/* 每篇文章的备注 */}
                    {Array.from({ length: config.count }).map((_, noteIdx) => (
                      <Input
                        key={noteIdx}
                        placeholder={`文章 ${noteIdx + 1} 备注`}
                        value={config.notes[noteIdx] || ''}
                        onChange={(e) => updateNote(type.id, idx, noteIdx, e.target.value)}
                        size="small"
                      />
                    ))}
                  </Space>
                </Card>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => addWebsiteConfig(type.id)}>
                添加网站配置
              </Button>
            </Space>
          </Tabs.TabPane>
        ))}
      </Tabs>
    </div>
  );
}

// 进度条组件
function ProgressBar({ percent, color, icon, label, onClick }: { percent: number; color: string; icon: string; label: string; onClick?: () => void }) {
  return (
    <div style={{ cursor: onClick ? 'pointer' : 'default', marginBottom: 4 }} onClick={onClick}>
      <Space size="small">
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ width: 120, background: '#f0f0f0', borderRadius: 4, height: 16, overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
        </div>
        <Text style={{ fontSize: 12, width: 40 }}>{percent}%</Text>
      </Space>
    </div>
  );
}

// 文章编辑弹窗
function ArticleEditModal({
  visible,
  article,
  onCancel,
  onSave,
  managedWebsites,
}: {
  visible: boolean;
  article: Article | null;
  onCancel: () => void;
  onSave: (values: { website: string; notes: string }) => void;
  managedWebsites: { id: string; name: string; platform: string }[];
}) {
  const [form] = Form.useForm();

  // 当 article 变化时，重置表单值
  useEffect(() => {
    if (article && visible) {
      console.log('ArticleEditModal - article data:', article);
      console.log('ArticleEditModal - website:', article.website);
      console.log('ArticleEditModal - notes:', article.notes);
      form.setFieldsValue({
        website: article.website || undefined,
        notes: article.notes || '',
      });
    }
  }, [article, visible, form]);

  return (
    <Modal
      title="编辑文章"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
      >
        <Form.Item
          name="website"
          label="发布网站"
        >
          <Select
            placeholder="选择发布网站"
            allowClear
            options={managedWebsites.map(w => ({
              label: `${w.name} (${w.platform})`,
              value: w.id,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="notes"
          label="备注"
        >
          <Input.TextArea
            placeholder="输入备注信息"
            rows={3}
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={onCancel}>
              取消
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// 文章详情弹窗
function ArticleDetailModal({ 
  visible, 
  onCancel, 
  articles, 
  title,
  onDelete,
  onEdit 
}: { 
  visible: boolean; 
  onCancel: () => void; 
  articles: Article[]; 
  title: string;
  onDelete: (article: Article) => void;
  onEdit: (article: Article) => void;
}) {
  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80, render: (id: string) => id.slice(0, 8) + '...' },
    { title: '内容预览', dataIndex: 'content', key: 'content', render: (content: string) => content?.slice(0, 50) + '...' || '无内容' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => s === 'published' ? '已发布' : s === 'ready' ? '待发布' : '草稿' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Article) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => onEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除?" onConfirm={() => onDelete(record)}>
            <Button type="link" danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal title={title} open={visible} onCancel={onCancel} footer={null} width={800}>
      <Table dataSource={articles} columns={columns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
    </Modal>
  );
}

// 已创建任务列表
function CreatedTasksList() {
  const { tasks, loading, error, refreshTasks, deleteTask } = useTasks();
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModal, setDetailModal] = useState<{ visible: boolean; articles: Article[]; title: string }>({ visible: false, articles: [], title: '' });
  const [editModal, setEditModal] = useState<{ visible: boolean; record: any; tasks: any[] }>({ visible: false, record: null, tasks: [] });
  const [articleEditModal, setArticleEditModal] = useState<{ visible: boolean; article: Article | null }>({ visible: false, article: null });
  const { websites: managedWebsites } = useWebsites();
  const promptTypes = usePromptTypes();

  // 如果有错误，显示错误信息
  if (error) {
    return (
      <Empty
        description={
          <Space direction="vertical" size="small">
            <Text type="danger">加载失败: {error}</Text>
            <Button onClick={refreshTasks} size="small">重试</Button>
          </Space>
        }
      />
    );
  }

  // 过滤任务（按日期）
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const taskDate = dayjs(task.deadline);
      return taskDate.format('YYYY-MM-DD') === selectedDate.format('YYYY-MM-DD');
    });
  }, [tasks, selectedDate]);

  // 按城市和提示词类型分组统计（基于文章真实状态）
  const groupedStats = useMemo(() => {
    const groups: Record<string, { 
      city: string; 
      promptType: string; 
      total: number;
      draft: number;
      ready: number;
      published: number;
      articles: Article[];
    }> = {};
    
    filteredTasks.forEach(task => {
      const key = `${task.city}-${task.prompt_type}`;
      if (!groups[key]) {
        groups[key] = {
          city: task.city,
          promptType: task.prompt_type,
          total: 0,
          draft: 0,
          ready: 0,
          published: 0,
          articles: [],
        };
      }
      
      // 统计文章状态
      const taskArticles = task.articles || [];
      groups[key].articles.push(...taskArticles);
      
      taskArticles.forEach(article => {
        groups[key].total++;
        if (article.status === 'published') {
          groups[key].published++;
        } else if (article.status === 'ready') {
          groups[key].ready++;
        } else {
          groups[key].draft++;
        }
      });
    });
    
    return Object.values(groups);
  }, [filteredTasks]);

  // 获取提示词类型名称
  const getPromptTypeName = (id: string) => {
    const type = promptTypes.find(t => t.id === id);
    return type?.type || id;
  };

  // 打开文章详情
  const openArticleDetail = (record: any, type: 'draft' | 'ready' | 'published') => {
    const filtered = record.articles.filter((a: Article) => {
      if (type === 'draft') return a.status === 'draft';
      if (type === 'ready') return a.status === 'ready';
      return a.status === 'published';
    });
    
    const titles = { draft: '生产中的文章', ready: '待发布的文章', published: '已完成的文章' };
    setDetailModal({ visible: true, articles: filtered, title: `${record.city} - ${titles[type]}` });
  };

  // 处理文章删除
  const handleDeleteArticle = async (article: Article) => {
    try {
      const { error } = await supabase.from('articles').delete().eq('id', article.id);
      if (error) throw error;
      message.success('删除成功');
      refreshTasks();
      setDetailModal(prev => ({ ...prev, articles: prev.articles.filter(a => a.id !== article.id) }));
    } catch {
      message.error('删除失败');
    }
  };

  // 处理文章编辑
  const handleEditArticle = (article: Article) => {
    setArticleEditModal({ visible: true, article });
  };

  // 保存文章编辑
  const handleSaveArticleEdit = async (values: { website: string; notes: string }) => {
    if (!articleEditModal.article) return;
    
    try {
      const article = articleEditModal.article;
      
      // 更新文章（保留原字段）
      const { error: articleError } = await supabase
        .from('articles')
        .update({
          website: values.website || null,
          notes: values.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', article.id);

      if (articleError) throw articleError;

      // 同时更新关联任务的任务级网站和写作建议
      if (article.task_id) {
        const { error: taskError } = await supabase
          .from('tasks')
          .update({
            websites: values.website ? [values.website] : [],
            writing_suggestions: values.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', article.task_id);
        
        if (taskError) throw taskError;
      }

      message.success('修改成功');
      setArticleEditModal({ visible: false, article: null });
      refreshTasks();
      // 更新详情弹窗中的文章数据
      setDetailModal(prev => ({
        ...prev,
        articles: prev.articles.map(a =>
          a.id === articleEditModal.article!.id
            ? { ...a, website: values.website || null, notes: values.notes || null }
            : a
        ),
      }));
    } catch (err) {
      message.error('修改失败');
    }
  };

  // 处理任务编辑
  const handleEditTask = (record: any, tasksToEdit: any[]) => {
    setEditModal({ visible: true, record, tasks: tasksToEdit });
  };

  // 保存任务编辑
  const handleSaveEdit = async (values: any) => {
    try {
      for (const task of editModal.tasks) {
        const { error } = await supabase
          .from('tasks')
          .update({
            websites: values.websites,
            prompt_type: values.prompt_type,
            writing_suggestions: values.writing_suggestions,
          })
          .eq('id', task.id);
        
        if (error) throw error;
      }
      
      message.success('修改成功');
      setEditModal({ visible: false, record: null, tasks: [] });
      refreshTasks();
    } catch (err) {
      message.error('修改失败');
    }
  };

  // 处理批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的任务');
      return;
    }
    
    try {
      for (const key of selectedRowKeys) {
        const record = groupedStats.find(g => `${g.city}-${g.promptType}` === key);
        if (record) {
          const tasksToDelete = filteredTasks.filter(
            t => t.city === record.city && t.prompt_type === record.promptType
          );
          for (const task of tasksToDelete) {
            await deleteTask(task.id);
          }
        }
      }
      
      message.success('批量删除成功');
      setSelectedRowKeys([]);
      refreshTasks();
    } catch (err) {
      message.error('批量删除失败');
    }
  };

  const columns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 100,
    },
    {
      title: '文章数量',
      dataIndex: 'total',
      key: 'total',
      width: 80,
    },
    {
      title: '提示词类型',
      dataIndex: 'promptType',
      key: 'promptType',
      width: 120,
      render: (id: string) => getPromptTypeName(id),
    },
    {
      title: '进度分布',
      key: 'progress',
      width: 280,
      render: (_: any, record: any) => (
        <div>
          <ProgressBar 
            percent={record.total > 0 ? Math.round((record.draft + record.ready + record.published) / record.total * 100) : 0}
            color="#1890ff"
            icon="📝"
            label="生产"
            onClick={() => openArticleDetail(record, 'draft')}
          />
          <ProgressBar 
            percent={record.total > 0 ? Math.round((record.ready + record.published) / record.total * 100) : 0}
            color="#fa8c16"
            icon="🚀"
            label="发布"
            onClick={() => openArticleDetail(record, 'ready')}
          />
          <ProgressBar 
            percent={record.total > 0 ? Math.round(record.published / record.total * 100) : 0}
            color="#52c41a"
            icon="✅"
            label="完成"
            onClick={() => openArticleDetail(record, 'published')}
          />
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: any) => {
        const tasksToEdit = filteredTasks.filter(
          t => t.city === record.city && t.prompt_type === record.promptType
        );
        
        return (
          <Space size="small">
            <Popconfirm
              title="确定删除?"
              description={`删除 ${record.city} 的 ${record.total} 篇文章`}
              onConfirm={async () => {
                for (const task of tasksToEdit) {
                  await deleteTask(task.id);
                }
                message.success('删除成功');
                refreshTasks();
              }}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger size="small">删除</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  // 统计
  const stats = useMemo(() => {
    const total = groupedStats.reduce((sum, g) => sum + g.total, 0);
    const draft = groupedStats.reduce((sum, g) => sum + g.draft, 0);
    const ready = groupedStats.reduce((sum, g) => sum + g.ready, 0);
    const published = groupedStats.reduce((sum, g) => sum + g.published, 0);
    return { total, draft, ready, published };
  }, [groupedStats]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Space>
        <DatePicker
          value={selectedDate}
          onChange={(date) => date && setSelectedDate(date)}
          format="YYYY-MM-DD"
        />
        <Button icon={<FilterOutlined />} onClick={refreshTasks}>刷新</Button>
        <Popconfirm
          title="确定批量删除?"
          description={`删除选中的 ${selectedRowKeys.length} 项任务`}
          onConfirm={handleBatchDelete}
          okText="确定"
          cancelText="取消"
          disabled={selectedRowKeys.length === 0}
        >
          <Button danger disabled={selectedRowKeys.length === 0}>
            批量删除
          </Button>
        </Popconfirm>
      </Space>

      <Table
        rowSelection={rowSelection}
        dataSource={groupedStats}
        columns={columns}
        pagination={false}
        size="small"
        loading={loading}
        rowKey={(record) => `${record.city}-${record.promptType}`}
      />

      <Card size="small" style={{ background: '#f6ffed' }}>
        <Row gutter={16}>
          <Col>共 {groupedStats.length} 个分组，{stats.total} 篇文章</Col>
          <Col style={{ color: '#999' }}>📝 生产中: {stats.draft}</Col>
          <Col style={{ color: '#fa8c16' }}>🚀 待发布: {stats.ready}</Col>
          <Col style={{ color: '#52c41a' }}>✅ 已完成: {stats.published}</Col>
        </Row>
      </Card>

      <ArticleDetailModal
        visible={detailModal.visible}
        onCancel={() => setDetailModal(prev => ({ ...prev, visible: false }))}
        articles={detailModal.articles}
        title={detailModal.title}
        onDelete={handleDeleteArticle}
        onEdit={handleEditArticle}
      />

      {/* 编辑任务弹窗 */}
      <Modal
        title={`编辑任务 - ${editModal.record?.city || ''}`}
        open={editModal.visible}
        onCancel={() => setEditModal({ visible: false, record: null, tasks: [] })}
        footer={null}
        width={600}
      >
        {editModal.record && (
          <Form
            layout="vertical"
            onFinish={handleSaveEdit}
            initialValues={{
              websites: editModal.tasks[0]?.websites || [],
              prompt_type: editModal.tasks[0]?.prompt_type || '',
              writing_suggestions: editModal.tasks[0]?.writing_suggestions || '',
            }}
          >
            <Form.Item
              name="websites"
              label="发布网站"
              rules={[{ required: true, message: '请选择发布网站' }]}
            >
              <Select
                mode="multiple"
                placeholder="选择发布网站"
                options={[...DEFAULT_WEBSITES]}
              />
            </Form.Item>

            <Form.Item
              name="prompt_type"
              label="提示词类型"
              rules={[{ required: true, message: '请选择提示词类型' }]}
            >
              <Select
                placeholder="选择提示词类型"
                options={promptTypes.map(p => ({ label: p.type, value: p.id }))}
              />
            </Form.Item>

            <Form.Item
              name="writing_suggestions"
              label="写作建议/备注"
            >
              <Input.TextArea
                placeholder="输入写作建议或备注"
                rows={3}
              />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  保存
                </Button>
                <Button onClick={() => setEditModal({ visible: false, record: null, tasks: [] })}>
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 编辑文章弹窗 */}
      <ArticleEditModal
        visible={articleEditModal.visible}
        article={articleEditModal.article}
        onCancel={() => setArticleEditModal({ visible: false, article: null })}
        onSave={handleSaveArticleEdit}
        managedWebsites={managedWebsites}
      />
    </Space>
  );
}

// 开始创建页面 - 包含单个创建和批量创建子标签
function CreateTaskPage() {
  const { createTask } = useTasks();
  const [activeSubTab, setActiveSubTab] = useState('single');
  const [loading, setLoading] = useState(false);

  const handleSingleSubmit = async (taskData: any) => {
    setLoading(true);
    try {
      await createTask(taskData);
      message.success('任务创建成功！');
    } catch (error: any) {
      message.error('任务创建失败: ' + (error.message || '请检查数据库表是否已创建'));
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSubmit = async (tasks: any[]) => {
    setLoading(true);
    try {
      for (const task of tasks) {
        await createTask(task);
      }
      message.success(`成功创建 ${tasks.length} 个任务！`);
    } catch (error: any) {
      message.error('批量创建失败: ' + (error.message || '请检查数据库表是否已创建'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tabs
      activeKey={activeSubTab}
      onChange={setActiveSubTab}
      items={[
        {
          key: 'single',
          label: '单个创建',
          children: <SingleTaskForm onSubmit={handleSingleSubmit} loading={loading} />,
        },
        {
          key: 'batch',
          label: '批量创建',
          children: <BatchTaskForm onSubmit={handleBatchSubmit} loading={loading} />,
        },
      ]}
      size="large"
    />
  );
}

// 主组件
export default function TaskCreator({ defaultView = 'create' }: { defaultView?: 'create' | 'created' }) {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
      <Card title="创建内容生产和发布任务" bordered={false}>
        {defaultView === 'create' ? (
          <CreateTaskPage />
        ) : (
          <CreatedTasksList />
        )}
      </Card>
    </div>
  );
}
