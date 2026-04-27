import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Divider, Radio, Switch, TimePicker } from 'antd';
import { SaveOutlined, BellOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useSettings } from '../hooks/useSettings';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function Settings() {
  const [form] = Form.useForm();
  const { getSetting, setSetting, loading } = useSettings();
  const [saving, setSaving] = useState(false);
  const [notifyMode, setNotifyMode] = useState('immediate');
  const [dailyNotificationEnabled, setDailyNotificationEnabled] = useState(false);
  const [dailyNotificationTime, setDailyNotificationTime] = useState(dayjs('17:30', 'HH:mm'));

  // 加载保存的设置
  useEffect(() => {
    form.setFieldsValue({
      feishu_webhook: getSetting('feishu_webhook', ''),
    });
    setNotifyMode(getSetting('feishu_notify_mode', 'immediate'));
    setDailyNotificationEnabled(getSetting('daily_notification_enabled', 'false') === 'true');
    const savedTime = getSetting('daily_notification_time', '17:30');
    setDailyNotificationTime(dayjs(savedTime, 'HH:mm'));
  }, [form, getSetting]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      await setSetting('feishu_webhook', values.feishu_webhook || '');
      message.success('设置已保存');
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyModeChange = async (value: string) => {
    try {
      await setSetting('feishu_notify_mode', value);
      setNotifyMode(value);
      message.success(`已切换为${value === 'immediate' ? '即时通知' : '批量通知'}`);
    } catch {
      message.error('保存失败');
    }
  };

  const testWebhook = async () => {
    const webhook = form.getFieldValue('feishu_webhook');
    if (!webhook) {
      message.warning('请先填写 Webhook 地址');
      return;
    }

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: '🔔 测试消息\n\n飞书通知配置成功！当有内容准备发布时，您将收到通知。'
          }
        })
      });

      if (response.ok) {
        message.success('测试消息已发送，请检查飞书群');
      } else {
        message.error('发送失败，请检查 Webhook 地址是否正确');
      }
    } catch (error) {
      message.error('发送失败，请检查网络连接');
    }
  };

  // 切换每日通知开关
  const handleDailyNotificationToggle = async (checked: boolean) => {
    try {
      await setSetting('daily_notification_enabled', checked.toString());
      setDailyNotificationEnabled(checked);
      message.success(`每日通知已${checked ? '开启' : '关闭'}`);
    } catch {
      message.error('保存失败');
    }
  };

  // 保存每日通知时间
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

  // 测试每日通知
  const testDailyNotification = async () => {
    const webhook = form.getFieldValue('feishu_webhook');
    if (!webhook) {
      message.warning('请先填写 Webhook 地址');
      return;
    }

    try {
      // 从环境变量获取 API URL（Vercel 会自动设置）
      const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
      const response = await fetch(`${apiUrl}/api/daily-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        message.success('测试消息已发送，请检查飞书群');
      } else {
        const data = await response.json();
        message.error(data.error || '发送失败');
      }
    } catch (error) {
      message.error('发送失败，请检查网络连接');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Card title="系统设置" bordered={false} loading={loading}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Title level={4} style={{ margin: 0 }}>
              <BellOutlined style={{ marginRight: 8 }} />
              飞书通知设置
            </Title>
            <Text type="secondary">
              配置飞书群机器人，当内容准备发布时自动通知
            </Text>
          </div>

          <Divider />

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
          >
            <Form.Item
              name="feishu_webhook"
              label="飞书群 Webhook 地址"
              extra="在飞书群设置中添加自定义机器人，复制 Webhook 地址粘贴到这里"
            >
              <Input.TextArea
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                rows={2}
              />
            </Form.Item>

            <Form.Item
              label="通知模式"
              extra="选择通知发送方式"
            >
              <Radio.Group
                value={notifyMode}
                onChange={(e) => handleNotifyModeChange(e.target.value)}
              >
                <Radio value="immediate">即时通知（每篇内容准备好立即发送）</Radio>
                <Radio value="batch">批量通知（每天汇总发送一次）</Radio>
              </Radio.Group>
            </Form.Item>

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
                      测试通知
                    </Button>
                  </Space>
                </Space>
              )}
            </div>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={saving}
                >
                  保存设置
                </Button>
                <Button onClick={testWebhook}>
                  发送测试消息
                </Button>
              </Space>
            </Form.Item>
          </Form>

          <Divider />

          <div style={{ background: '#f6ffed', padding: '16px', borderRadius: '8px', border: '1px solid #b7eb8f' }}>
            <Text strong style={{ color: '#52c41a' }}>配置说明：</Text>
            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#666' }}>
              <li>在飞书群中点击右上角「...」→「群机器人」</li>
              <li>点击「添加机器人」，选择「自定义机器人」</li>
              <li>复制生成的 Webhook 地址，粘贴到上方输入框</li>
              <li>点击「保存设置」，然后可以「发送测试消息」验证</li>
            </ol>
          </div>
        </Space>
      </Card>
    </div>
  );
}
