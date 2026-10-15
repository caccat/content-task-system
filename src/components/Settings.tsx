import { useState, useEffect } from 'react';
import { Card, Button, message, Typography, Space, Divider, Switch, TimePicker, Input, Select, Slider, InputNumber, Row, Col, Alert } from 'antd';
import {
  BellOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useSettings } from '../hooks/useSettings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// 提供商预设：切换时自动填 baseUrl + model
const PROVIDER_PRESETS: Record<string, { label: string; baseUrl: string; model: string; models?: string[] }> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  },
  doubao: {
    label: '豆包 - 方舟 ARK',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    model: 'doubao-seed-2-0-mini-260428',
    models: [
      'doubao-seed-2-0-mini-260428',
      'doubao-seed-1-6-250615',
      'doubao-1-5-pro-32k-250115',
      'doubao-lite-32k',
    ],
  },
  custom: {
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: '',
  },
};

export default function Settings() {
  const { settings, setSetting, loading } = useSettings();

  // ================ 飞书通知 ================
  const [dailyNotificationEnabled, setDailyNotificationEnabled] = useState(false);
  const [dailyNotificationTime, setDailyNotificationTime] = useState(dayjs('17:30', 'HH:mm'));

  // ================ AI 设置 ================
  const [aiProvider, setAiProvider] = useState<string>('deepseek');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiTemperature, setAiTemperature] = useState<number>(0.7);
  const [aiMaxTokens, setAiMaxTokens] = useState<number>(8000);
  const [aiSystemPrompt, setAiSystemPrompt] = useState<string>('');
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    elapsedMs?: number;
    reply?: string;
    host?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // 加载已保存的设置
  useEffect(() => {
    if (loading) return;

    // 飞书
    setDailyNotificationEnabled(settings.daily_notification_enabled === 'true');
    setDailyNotificationTime(dayjs(settings.daily_notification_time || '17:30', 'HH:mm'));

    // AI
    const provider = settings.ai_provider || 'deepseek';
    setAiProvider(provider);
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
    setAiBaseUrl(settings.ai_base_url || preset.baseUrl);
    setAiModel(settings.ai_model || preset.model);
    setAiTemperature(settings.ai_temperature ? parseFloat(settings.ai_temperature) : 0.7);
    setAiMaxTokens(settings.ai_max_tokens ? parseInt(settings.ai_max_tokens, 10) : 8000);
    setAiSystemPrompt(
      settings.ai_system_prompt || '你是一位专业、优秀的内容创作者，擅长撰写各种类型的优质文章。'
    );
    // 已保存的 key 回填到密码框
    if (settings.ai_api_key) setAiApiKey(settings.ai_api_key);
  }, [loading, settings]);

  // 切换 provider 时自动填 baseUrl + model
  const handleProviderChange = (newProvider: string) => {
    setAiProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    if (preset) {
      setAiBaseUrl(preset.baseUrl);
      setAiModel(preset.model);
    }
    setTestResult(null);
  };

  // 测试连接
  const handleTest = async () => {
    setTestResult(null);
    if (!aiApiKey.trim()) {
      message.error('请先填写 API Key');
      return;
    }
    if (!aiBaseUrl.trim() || !aiModel.trim()) {
      message.error('请先填写 Base URL 和 模型');
      return;
    }
    setTesting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
      const r = await fetch(`${apiUrl}/api/test-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: aiBaseUrl.trim(),
          apiKey: aiApiKey.trim(),
          model: aiModel.trim(),
        }),
      });
      const data = await r.json();
      setTestResult(data);
      if (data.ok) {
        message.success(`连接成功（${data.elapsedMs}ms）`);
      } else {
        message.error('连接失败，详见下方结果');
      }
    } catch (e: any) {
      const msg = e?.message || '请求失败';
      setTestResult({ ok: false, message: msg });
      message.error('请求失败：' + msg);
    } finally {
      setTesting(false);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!aiApiKey.trim()) {
      message.error('请填写 API Key');
      return;
    }
    if (!aiBaseUrl.trim() || !aiModel.trim()) {
      message.error('请填写 Base URL 和 模型');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        setSetting('ai_provider', aiProvider),
        setSetting('ai_api_key', aiApiKey.trim()),
        setSetting('ai_base_url', aiBaseUrl.trim()),
        setSetting('ai_model', aiModel.trim()),
        setSetting('ai_temperature', String(aiTemperature)),
        setSetting('ai_max_tokens', String(aiMaxTokens)),
        setSetting('ai_system_prompt', aiSystemPrompt),
      ]);
      message.success('AI 配置已保存，下次生成文章时生效');
      setTestResult(null);
    } catch (e: any) {
      message.error('保存失败：' + (e?.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  // ================ 飞书通知处理函数（保留原逻辑） ================
  const testWebhook = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
      const response = await fetch(`${apiUrl}/api/send-feishu-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: '🔔 测试消息\n\n飞书通知配置成功！当新任务批量创建时，您将收到飞书群通知。',
        }),
      });
      if (response.ok) message.success('测试消息已发送，请检查飞书群');
      else {
        const data = await response.json();
        message.error(data.error || '发送失败，请检查 Webhook 配置');
      }
    } catch {
      message.error('发送失败，请检查网络连接');
    }
  };

  const handleDailyNotificationToggle = async (checked: boolean) => {
    try {
      await setSetting('daily_notification_enabled', checked.toString());
      setDailyNotificationEnabled(checked);
      message.success(`每日通知已${checked ? '开启' : '关闭'}`);
    } catch {
      message.error('保存失败');
    }
  };

  const handleDailyNotificationTimeChange = async (time: dayjs.Dayjs | null) => {
    if (!time) return;
    const timeStr = time.format('HH:mm');
    try {
      await setSetting('daily_notification_time', timeStr);
      setDailyNotificationTime(time);
      message.success(`通知时间已设置为 ${timeStr}`);
    } catch {
      message.error('保存失败');
    }
  };

  const testDailyNotification = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
      const response = await fetch(`${apiUrl}/api/daily-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) message.success('测试消息已发送，请检查飞书群');
      else {
        const data = await response.json();
        message.error(data.error || '发送失败');
      }
    } catch {
      message.error('发送失败，请检查网络连接');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Card title="系统设置" bordered={false} loading={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">

          {/* ================ AI 模型设置 ================ */}
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <RobotOutlined style={{ marginRight: 8 }} />
              AI 模型设置
            </Title>
            <Text type="secondary">
              配置文章生成所用的 AI 模型。保存后立即生效，无需重新部署。
            </Text>
          </div>

          <Alert
            type="info"
            showIcon
            message="API Key 以明文存储在 Supabase settings 表中，请确保数据库访问安全。"
          />

          <div>
            <Text strong>提供商</Text>
            <Select
              value={aiProvider}
              onChange={handleProviderChange}
              style={{ width: '100%', marginTop: 8 }}
              options={Object.entries(PROVIDER_PRESETS).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
          </div>

          <div>
            <Text strong>API Key</Text>
            <Input.Password
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={settings.ai_api_key ? '已保存的 Key（可覆盖修改）' : '请输入 API Key'}
              style={{ marginTop: 8 }}
              visibilityToggle={{ visible: showKey, onVisibleChange: setShowKey }}
            />
          </div>

          <div>
            <Text strong>Base URL（chat/completions 完整地址）</Text>
            <Input
              value={aiBaseUrl}
              onChange={(e) => { setAiBaseUrl(e.target.value); setTestResult(null); }}
              placeholder="例如：https://ark.cn-beijing.volces.com/api/v3/chat/completions"
              style={{ marginTop: 8 }}
            />
          </div>

          <div>
            <Text strong>模型</Text>
            {aiProvider === 'doubao' && PROVIDER_PRESETS.doubao.models ? (
              <Select
                value={aiModel}
                onChange={(v) => { setAiModel(v); setTestResult(null); }}
                onInputKeyDown={(e) => { /* 允许自由输入 */ }}
                style={{ width: '100%', marginTop: 8 }}
                placeholder="选择或手动输入"
                options={PROVIDER_PRESETS.doubao.models.map((m) => ({ value: m, label: m }))}
                showSearch
              />
            ) : (
              <Input
                value={aiModel}
                onChange={(e) => { setAiModel(e.target.value); setTestResult(null); }}
                placeholder="例如：deepseek-chat / doubao-seed-2-0-mini-260428"
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Text strong>Temperature（{aiTemperature.toFixed(1)}）</Text>
              <Slider
                min={0}
                max={1.5}
                step={0.1}
                value={aiTemperature}
                onChange={setAiTemperature}
                style={{ marginTop: 16 }}
              />
            </Col>
            <Col span={12}>
              <Text strong>Max Tokens</Text>
              <InputNumber
                min={100}
                max={32000}
                step={500}
                value={aiMaxTokens}
                onChange={(v) => setAiMaxTokens(typeof v === 'number' ? v : 8000)}
                style={{ width: '100%', marginTop: 16 }}
              />
            </Col>
          </Row>

          <div>
            <Text strong>系统提示词（System Prompt）</Text>
            <Input.TextArea
              value={aiSystemPrompt}
              onChange={(e) => setAiSystemPrompt(e.target.value)}
              rows={3}
              style={{ marginTop: 8 }}
              placeholder="你是一位专业、优秀的内容创作者..."
            />
          </div>

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              showIcon
              icon={testResult.ok ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
              message={
                testResult.ok
                  ? `连接成功（${testResult.host}，${testResult.elapsedMs}ms）`
                  : '连接失败'
              }
              description={
                <div style={{ wordBreak: 'break-all' }}>
                  {testResult.ok
                    ? `模型返回：${testResult.reply}`
                    : testResult.message}
                </div>
              }
            />
          )}

          <Space>
            <Button
              type="primary"
              icon={<ApiOutlined />}
              onClick={handleTest}
              loading={testing}
            >
              测试连接
            </Button>
            <Button
              type="primary"
              ghost
              icon={<ThunderboltOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              保存
            </Button>
          </Space>

          <Divider />

          {/* ================ 飞书通知设置（原样保留） ================ */}
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <BellOutlined style={{ marginRight: 8 }} />
              飞书通知设置
            </Title>
            <Text type="secondary">
              配置飞书群机器人，当任务批量创建成功时自动在群内通知内容生产者
            </Text>
          </div>

          <Divider />

          <div style={{ background: '#fff7e6', padding: '12px', borderRadius: '8px', border: '1px solid #ffd591', marginBottom: 16 }}>
            <Text strong style={{ color: '#fa8c16' }}>飞书 Webhook 配置说明：</Text>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#666' }}>
              <li>Webhook 地址保存在服务端环境变量中，确保安全</li>
              <li>如需修改，请联系管理员在 Vercel 环境变量中配置 <code>FEISHU_WEBHOOK</code></li>
              <li>也可以直接在数据库 settings 表中配置 <code>feishu_webhook</code> 字段</li>
            </ol>
          </div>

          <Divider />

          <div style={{ background: '#f0f5ff', padding: '16px', borderRadius: '8px', border: '1px solid #adc6ff' }}>
            <Space style={{ marginBottom: 12 }}>
              <ClockCircleOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <Text strong style={{ fontSize: 16 }}>每日定时通知</Text>
              <Switch
                checked={dailyNotificationEnabled}
                onChange={handleDailyNotificationToggle}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Space>
            {dailyNotificationEnabled && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">
                  设置每日自动发送任务统计到飞书群
                </Text>
                <Space>
                  <Text>通知时间：</Text>
                  <TimePicker
                    value={dailyNotificationTime}
                    onChange={handleDailyNotificationTimeChange}
                    format="HH:mm"
                    placeholder="选择时间"
                    minuteStep={5}
                  />
                  <Button onClick={testDailyNotification}>
                    测试每日通知
                  </Button>
                </Space>
              </Space>
            )}
          </div>

          <Space style={{ marginTop: 16 }}>
            <Button onClick={testWebhook}>
              发送测试消息
            </Button>
          </Space>

          <Divider />

          <div style={{ background: '#f6ffed', padding: '16px', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
            <Text strong style={{ color: '#52c41a' }}>获取飞书 Webhook：</Text>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#666' }}>
              <li>在飞书群中点击右上角「...」→「群机器人」</li>
              <li>点击「添加机器人」，选择「自定义机器人」</li>
              <li>复制生成的 Webhook 地址，配置到环境变量或数据库中</li>
            </ol>
          </div>
        </Space>
      </Card>
    </div>
  );
}
