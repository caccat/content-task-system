import { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, InputNumber, Button, Card, message, Space, Tabs, Table, Tag, Divider, Typography, Collapse, Modal, Empty } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTasks } from '../hooks/useSupabase';
import { CITIES, WEBSITES as DEFAULT_WEBSITES } from '../types';

const { TextArea } = Input;
const { Text } = Typography;
const { Panel } = Collapse;

// 提示词类型接口
interface PromptType {
  id: string;
  type: string;
  content: string;
  exampleUrl: string;
  createdAt: string;
}

// 从 PromptManager 读取提示词类型
const usePromptTypes = () => {
  const [promptTypes, setPromptTypes] = useState<PromptType[]>([]);

  useEffect(() => {
    const loadPrompts = () => {
      const saved = localStorage.getItem('articlePrompts');
      if (saved) {
        try {
          setPromptTypes(JSON.parse(saved));
        } catch {
          setPromptTypes([]);
        }
      }
    };

    loadPrompts();

    // 监听 storage 变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'articlePrompts') {
        loadPrompts();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return promptTypes;
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

// 自定义网站选择组件 - 从 WebsiteManager 读取已管理的网站
function CustomWebsiteSelect({ 
  value = [], 
  onChange, 
  placeholder = "请选择发布网站" 
}: { 
  value?: string[]; 
  onChange?: (value: string[]) => void; 
  placeholder?: string;
}) {
  const [managedWebsites, setManagedWebsites] = useState<{id: string; name: string; platform: string; price: number}[]>([]);
  
  // 从 WebsiteManager 的 localStorage 加载网站
  useEffect(() => {
    const loadWebsites = () => {
      const saved = localStorage.getItem('managedWebsites');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setManagedWebsites(parsed);
        } catch {
          console.error('Failed to parse managed websites');
        }
      }
    };
    
    loadWebsites();
    
    // 监听 storage 变化，实现数据同步
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'managedWebsites') {
        loadWebsites();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  
  // 转换为 Select 需要的格式
  const websiteOptions = managedWebsites.map(w => ({
    value: w.id,
    label: `${w.name} (${w.platform})`,
  }));
  
  // 获取显示标签
  const getTagLabel = (id: string) => {
    const site = managedWebsites.find(w => w.id === id);
    return site ? `${site.name} (${site.platform})` : id;
  };
  
  return (
    <Select
      mode="multiple"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{ width: '100%' }}
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

// 批量任务创建
function BatchTaskForm({ onSubmit, loading }: { onSubmit: (tasks: any[]) => void; loading: boolean }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [deadline, setDeadline] = useState<dayjs.Dayjs | null>(null);
  const promptTypes = usePromptTypes();

  // 创建空的 quantity row
  const createEmptyQuantityRow = (): QuantityRow => {
    const row: any = { city: '' };
    promptTypes.forEach(type => {
      row[type.id] = 0;
    });
    return row as QuantityRow;
  };

  const [quantityData, setQuantityData] = useState<QuantityRow[]>([createEmptyQuantityRow()]);
  const [articleConfigs, setArticleConfigs] = useState<ArticleConfig[]>([]);

  // 当提示词类型变化时，重置数量数据
  useEffect(() => {
    setQuantityData([createEmptyQuantityRow()]);
  }, [promptTypes.length]);

  // 步骤1：数量矩阵表格列
  const quantityColumns = [
    {
      title: '城市',
      dataIndex: 'city',
      key: 'city',
      width: 120,
      render: (_: any, record: QuantityRow, index: number) => (
        <Select
          value={record.city || undefined}
          placeholder="选择城市"
          style={{ width: 100 }}
          onChange={(value) => updateQuantityRow(index, 'city', value)}
        >
          {CITIES.map(city => (
            <Select.Option key={city} value={city}>{city}</Select.Option>
          ))}
        </Select>
      ),
    },
    ...promptTypes.map(type => ({
      title: type.type,
      dataIndex: type.id,
      key: type.id,
      width: 100,
      render: (_: any, record: QuantityRow, index: number) => (
        <InputNumber
          min={0}
          max={50}
          value={record[type.id] as number || 0}
          onChange={(value) => updateQuantityRow(index, type.id, value || 0)}
          style={{ width: 70 }}
        />
      ),
    })),
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, __: QuantityRow, index: number) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeQuantityRow(index)}
          disabled={quantityData.length <= 1}
        />
      ),
    },
  ];

  const updateQuantityRow = (index: number, field: string, value: any) => {
    const newData = [...quantityData];
    newData[index] = { ...newData[index], [field]: value };
    setQuantityData(newData);
  };

  const addQuantityRow = () => {
    setQuantityData([...quantityData, createEmptyQuantityRow()]);
  };

  const removeQuantityRow = (index: number) => {
    if (quantityData.length > 1) {
      setQuantityData(quantityData.filter((_, i) => i !== index));
    }
  };

  // 计算总文章数
  const getTotalArticles = () => {
    return quantityData.reduce((sum, row) => {
      let rowSum = 0;
      promptTypes.forEach(type => {
        rowSum += (row[type.id] as number) || 0;
      });
      return sum + rowSum;
    }, 0);
  };

  // 生成文章配置列表
  const generateArticleConfigs = () => {
    const configs: ArticleConfig[] = [];
    quantityData.forEach(row => {
      if (!row.city) return;
      promptTypes.forEach(type => {
        const count = row[type.id] as number;
        for (let i = 0; i < count; i++) {
          configs.push({
            id: `${row.city}-${type.id}-${i}`,
            city: row.city,
            type: type.id,
            typeLabel: type.type,
            websites: [],
            writingSuggestions: '',
          });
        }
      });
    });
    return configs;
  };

  // 进入步骤2
  const goToStep2 = () => {
    // 验证
    const validRows = quantityData.filter(row => {
      if (!row.city) return false;
      const hasArticles = promptTypes.some(type => (row[type.id] as number) > 0);
      return hasArticles;
    });
    if (validRows.length === 0) {
      message.error('请至少填写一个城市及文章数量');
      return;
    }
    if (!deadline) {
      message.error('请选择截止日期');
      return;
    }
    const configs = generateArticleConfigs();
    setArticleConfigs(configs);
    setStep(2);
  };

  // 更新单篇文章配置
  const updateArticleConfig = (id: string, field: keyof ArticleConfig, value: any) => {
    setArticleConfigs(prev => prev.map(config => 
      config.id === id ? { ...config, [field]: value } : config
    ));
  };

  // 批量设置同类型文章的默认配置
  const batchSetDefault = (city: string, type: string) => {
    const configs = articleConfigs.filter(c => c.city === city && c.type === type);
    if (configs.length === 0) return;
    
    // 使用第一篇文章的配置作为默认值
    const defaultConfig = configs[0];
    setArticleConfigs(prev => prev.map(config => {
      if (config.city === city && config.type === type && config.id !== defaultConfig.id) {
        return {
          ...config,
          websites: [...defaultConfig.websites],
          writingSuggestions: defaultConfig.writingSuggestions,
        };
      }
      return config;
    }));
    message.success('已批量应用配置');
  };

  // 提交批量创建
  const handleBatchSubmit = async () => {
    // 验证所有文章都有网站配置
    const invalidConfigs = articleConfigs.filter(c => c.websites.length === 0);
    if (invalidConfigs.length > 0) {
      message.error(`还有 ${invalidConfigs.length} 篇文章未配置发布网站`);
      return;
    }

    const tasks = articleConfigs.map(config => ({
      city: config.city,
      quantity: 1,
      websites: config.websites,
      prompt_type: config.type,
      writing_suggestions: config.writingSuggestions || null,
      deadline: deadline!.format('YYYY-MM-DD'),
      status: 'pending',
      created_by: '任务创建者',
    }));

    await onSubmit(tasks);
    // 重置
    setStep(1);
    setQuantityData([createEmptyQuantityRow()]);
    setDeadline(null);
    setArticleConfigs([]);
  };

  // 按城市和类型分组显示
  const groupedConfigs = articleConfigs.reduce((groups, config) => {
    const key = `${config.city}-${config.type}`;
    if (!groups[key]) {
      groups[key] = {
        city: config.city,
        type: config.type,
        typeLabel: config.typeLabel,
        configs: [],
      };
    }
    groups[key].configs.push(config);
    return groups;
  }, {} as Record<string, { city: string; type: string; typeLabel: string; configs: ArticleConfig[] }>);

  if (step === 1) {
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

    return (
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Text type="secondary">步骤 1：填写每个城市各类型文章的数量</Text>
        </div>

        <Table
          dataSource={quantityData.map((row, i) => ({ ...row, key: i }))}
          columns={quantityColumns}
          pagination={false}
          size="small"
          bordered
        />
        
        <Button type="dashed" onClick={addQuantityRow} block icon={<PlusOutlined />}>
          添加城市
        </Button>

        <Form.Item
          label="截止日期"
          required
          style={{ marginTop: 16 }}
        >
          <DatePicker
            style={{ width: '100%' }}
            value={deadline}
            onChange={setDeadline}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
            placeholder="请选择所有任务的截止日期"
          />
        </Form.Item>

        <div style={{ textAlign: 'right' }}>
          <Text type="secondary">共 {getTotalArticles()} 篇文章 </Text>
          <Button 
            type="primary" 
            onClick={goToStep2}
            disabled={getTotalArticles() === 0}
            style={{ marginLeft: 16 }}
          >
            下一步：配置详情
          </Button>
        </div>
      </Space>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">步骤 2：逐篇配置网站和特殊要求</Text>
        <Button onClick={() => setStep(1)}>返回上一步</Button>
      </div>

      <Collapse defaultActiveKey={Object.keys(groupedConfigs)}>
        {Object.values(groupedConfigs).map((group) => (
          <Panel 
            header={
              <Space>
                <Tag color="blue">{group.city}</Tag>
                <Tag>{group.typeLabel}</Tag>
                <Text type="secondary">共 {group.configs.length} 篇</Text>
              </Space>
            } 
            key={`${group.city}-${group.type}`}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {group.configs.length > 1 && (
                <Button 
                  type="link" 
                  icon={<CopyOutlined />}
                  onClick={() => batchSetDefault(group.city, group.type)}
                >
                  将第一篇的配置应用到本组其他文章
                </Button>
              )}
              
              {group.configs.map((config, index) => (
                <Card 
                  key={config.id} 
                  size="small" 
                  title={`第 ${index + 1} 篇`}
                  extra={
                    config.websites.length > 0 && 
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary">发布网站：</Text>
                      <div style={{ marginTop: 8 }}>
                        <CustomWebsiteSelect
                          value={config.websites}
                          onChange={(value) => updateArticleConfig(config.id, 'websites', value)}
                          placeholder="请选择或添加发布网站"
                        />
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">特殊要求：</Text>
                      <TextArea
                        value={config.writingSuggestions}
                        onChange={(e) => updateArticleConfig(config.id, 'writingSuggestions', e.target.value)}
                        placeholder="如：不许有表格、需要包含图片等（可选）"
                        rows={2}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          </Panel>
        ))}
      </Collapse>

      <Divider />

      <div style={{ textAlign: 'right' }}>
        <Text type="secondary">将创建 {articleConfigs.length} 个独立任务 </Text>
        <Button 
          type="primary" 
          onClick={handleBatchSubmit}
          loading={loading}
          icon={<PlusOutlined />}
          style={{ marginLeft: 16 }}
          size="large"
        >
          确认创建
        </Button>
      </div>
    </Space>
  );
}

// 主组件
export default function TaskCreator({ defaultTab = 'single' }: { defaultTab?: string }) {
  const { createTask } = useTasks();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);

  // 当 defaultTab 变化时更新 activeTab
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

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

  const items = [
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
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px' }}>
      <Card title="创建内容生产和发布任务" bordered={false}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          size="large"
        />
      </Card>
    </div>
  );
}
