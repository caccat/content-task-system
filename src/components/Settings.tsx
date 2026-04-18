import { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Typography, Space, Divider } from 'antd';
import { SaveOutlined, BellOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function Settings() {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 加载保存的设置
  useEffect(() => {
    const savedWebhook = localStorage.getItem('feishu_webhook') || '';
    form.setFieldsValue({
      feishu_webhook: savedWebhook,
    });
  }, [form]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      // 保存到 localStorage
      if (values.feishu_webhook) {
        localStorage.setItem('feishu_webhook', values.feishu_webhook);
      } else {
        localStorage.removeItem('feishu_webhook');
      }
      
      message.success('设置已保存');
    } catch (error) {
      message.error('保存失败');
    } finally {
      setSaving(false);
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

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Card title="系统设置" bordered={false}>
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
