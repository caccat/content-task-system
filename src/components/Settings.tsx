import { Card, Typography } from 'antd';

const { Title } = Typography;

export default function Settings() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Card title="系统设置" bordered={false}>
        <Title level={4} style={{ margin: 0, color: '#999' }}>
          暂无设置项
        </Title>
      </Card>
    </div>
  );
}
