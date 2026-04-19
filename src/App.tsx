import { useState, useEffect } from 'react';
import { Layout, Menu, Card, Typography, Alert, Button, Space, Badge } from 'antd';
import {
  PlusCircleOutlined,
  EditOutlined,
  GlobalOutlined,
  DatabaseOutlined,
  CopyOutlined,
  FileAddOutlined,
  AppstoreAddOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  FileOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BookOutlined,
} from '@ant-design/icons';
import TaskCreator from './components/TaskCreator';
import ContentWriter from './components/ContentWriter';
import TaskPublisher from './components/TaskPublisher';
import WebsiteManager from './components/WebsiteManager';
import PromptManager from './components/PromptManager';
import Settings from './components/Settings';
import { supabase } from './supabase';
import type { UserRole, TaskWithArticles, Task, Article } from './types';
import dayjs from 'dayjs';

const { Header, Content, Sider } = Layout;
const { Title, Paragraph } = Typography;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// 子页面类型
type CreatorSubPage = 'create' | 'created' | 'websites';
type WriterSubPage = 'tasks' | 'prompts' | 'draft' | 'ready' | 'completed';
type PublisherSubPage = 'tasks' | 'ready' | 'completed';
type SettingsSubPage = 'general' | 'notifications';

function SetupGuide() {
  const sqlScript = `-- 创建任务表
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  city TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  websites TEXT[] NOT NULL,
  prompt_type TEXT NOT NULL,
  writing_suggestions TEXT,
  deadline DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_by TEXT DEFAULT 'system'
);

-- 创建文章表
CREATE TABLE articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published')),
  published_at TIMESTAMP WITH TIME ZONE,
  published_by TEXT
);

-- 创建索引
CREATE INDEX idx_articles_task_id ON articles(task_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- 启用Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE articles;`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlScript);
  };

  return (
    <Card title="数据库配置指南" style={{ maxWidth: 900, margin: '24px auto' }}>
      <Alert
        message="Supabase 未配置"
        description={
          <div>
            <Paragraph>
              请在 <code>.env</code> 文件中配置您的 Supabase 连接信息：
            </Paragraph>
            <pre style={{ background: '#f6f8fa', padding: 16, borderRadius: 6 }}>
              VITE_SUPABASE_URL=your_supabase_url{"\n"}
              VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
            </pre>
            <Paragraph>
              然后在 Supabase SQL Editor 中执行以下脚本创建表：
            </Paragraph>
          </div>
        }
        type="warning"
        showIcon
      />
      <div style={{ marginTop: 16, position: 'relative' }}>
        <Button
          icon={<CopyOutlined />}
          onClick={handleCopy}
          style={{ position: 'absolute', right: 8, top: 8 }}
        >
          复制
        </Button>
        <pre style={{ background: '#f6f8fa', padding: 16, borderRadius: 6, overflow: 'auto' }}>
          {sqlScript}
        </pre>
      </div>
    </Card>
  );
}

function App() {
  const [currentRole, setCurrentRole] = useState<UserRole | 'settings'>('creator');
  const [creatorSubPage, setCreatorSubPage] = useState<CreatorSubPage>('create');
  const [writerSubPage, setWriterSubPage] = useState<WriterSubPage>('tasks');
  const [publisherSubPage, setPublisherSubPage] = useState<PublisherSubPage>('tasks');
  const [openKeys, setOpenKeys] = useState<string[]>(['creator', 'writer', 'publisher']);

  // 任务统计数据（用于菜单徽章）
  const [taskStats, setTaskStats] = useState({ draft: 0, ready: 0, completed: 0 });

  // 获取任务统计数据（不使用 useTasks hook 避免订阅冲突）
  useEffect(() => {
    const fetchTaskStats = async () => {
      try {
        const { data: tasksData } = await supabase.from('tasks').select('*');
        const { data: articlesData } = await supabase.from('articles').select('*');

        if (!tasksData || !articlesData) return;

        const today = dayjs().format('YYYY-MM-DD');
        const todayTasks = (tasksData as Task[]).filter(
          task => dayjs(task.deadline).format('YYYY-MM-DD') === today
        );

        const stats = { draft: 0, ready: 0, completed: 0 };

        todayTasks.forEach(task => {
          const taskArticles = (articlesData as Article[]).filter(a => a.task_id === task.id);
          const readyCount = taskArticles.filter(a => a.status === 'ready').length;
          const publishedCount = taskArticles.filter(a => a.status === 'published').length;

          if (publishedCount === task.quantity) {
            stats.completed++;
          } else if (readyCount > 0 || publishedCount > 0) {
            stats.ready++;
          } else {
            stats.draft++;
          }
        });

        setTaskStats(stats);
      } catch (err) {
        console.error('Error fetching task stats:', err);
      }
    };

    fetchTaskStats();

    // 设置定时刷新（每 30 秒）
    const interval = setInterval(fetchTaskStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    {
      key: 'creator',
      icon: <PlusCircleOutlined />,
      label: '任务创建者',
      children: [
        {
          key: 'creator-create',
          icon: <FileAddOutlined />,
          label: '开始创建',
        },
        {
          key: 'creator-created',
          icon: <UnorderedListOutlined />,
          label: '已创建',
        },
        {
          key: 'creator-websites',
          icon: <SettingOutlined />,
          label: '发布网站管理',
        },
      ],
    },
    {
      key: 'writer',
      icon: <EditOutlined />,
      label: '内容生成者',
      children: [
        {
          key: 'writer-tasks',
          icon: <UnorderedListOutlined />,
          label: '任务列表',
          children: [
            {
              key: 'writer-draft',
              label: (
                <span>
                  未生成
                  {taskStats.draft > 0 && (
                    <Badge count={taskStats.draft} style={{ marginLeft: 8, backgroundColor: '#ff4d4f' }} />
                  )}
                </span>
              ),
            },
            {
              key: 'writer-ready',
              label: (
                <span>
                  待发布
                  {taskStats.ready > 0 && (
                    <Badge count={taskStats.ready} style={{ marginLeft: 8, backgroundColor: '#1890ff' }} />
                  )}
                </span>
              ),
            },
            {
              key: 'writer-completed',
              label: (
                <span>
                  已完成
                  {taskStats.completed > 0 && (
                    <Badge count={taskStats.completed} style={{ marginLeft: 8, backgroundColor: '#52c41a' }} />
                  )}
                </span>
              ),
            },
          ],
        },
        {
          key: 'writer-prompts',
          icon: <FileTextOutlined />,
          label: '文章提示词管理',
        },
      ],
    },
    {
      key: 'publisher',
      icon: <GlobalOutlined />,
      label: '发布执行者',
      children: [
        {
          key: 'publisher-tasks',
          icon: <UnorderedListOutlined />,
          label: '任务列表',
          children: [
            {
              key: 'publisher-ready',
              label: (
                <span>
                  待发布
                  {taskStats.ready > 0 && (
                    <Badge count={taskStats.ready} style={{ marginLeft: 8, backgroundColor: '#1890ff' }} />
                  )}
                </span>
              ),
            },
            {
              key: 'publisher-completed',
              label: (
                <span>
                  已完成
                  {taskStats.completed > 0 && (
                    <Badge count={taskStats.completed} style={{ marginLeft: 8, backgroundColor: '#52c41a' }} />
                  )}
                </span>
              ),
            },
          ],
        },
      ],
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  const renderContent = () => {
    if (!supabaseUrl || supabaseUrl === 'your_supabase_url') {
      return <SetupGuide />;
    }

    switch (currentRole) {
      case 'creator':
        switch (creatorSubPage) {
          case 'create':
            return <TaskCreator defaultView="create" />;
          case 'created':
            return <TaskCreator defaultView="created" />;
          case 'websites':
            return <WebsiteManager />;
          default:
            return <TaskCreator defaultView="create" />;
        }
      case 'writer':
        switch (writerSubPage) {
          case 'tasks':
            return <ContentWriter />;
          case 'draft':
            return <ContentWriter defaultStatus="draft" />;
          case 'ready':
            return <ContentWriter defaultStatus="ready" />;
          case 'completed':
            return <ContentWriter defaultStatus="completed" />;
          case 'prompts':
            return <PromptManager />;
          default:
            return <ContentWriter />;
        }
      case 'publisher':
        switch (publisherSubPage) {
          case 'tasks':
            return <TaskPublisher />;
          case 'ready':
            return <TaskPublisher defaultStatus="ready" />;
          case 'completed':
            return <TaskPublisher defaultStatus="completed" />;
          default:
            return <TaskPublisher />;
        }
      case 'settings':
        return <Settings />;
      default:
        return <TaskCreator />;
    }
  };

  return (
    <>
      <style>{`
        /* 一级菜单（主菜单）样式 */
        .custom-menu > .ant-menu-item,
        .custom-menu > .ant-menu-submenu > .ant-menu-submenu-title {
          color: #000 !important;
          font-size: 15px !important;
          font-weight: 600 !important;
          background-color: #b8b4b1 !important;
          border-radius: 8px;
          margin-bottom: 8px !important;
          transition: all 0.3s ease;
        }
        .custom-menu > .ant-menu-item:hover,
        .custom-menu > .ant-menu-submenu > .ant-menu-submenu-title:hover {
          background-color: #a8a4a1 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }
        .custom-menu > .ant-menu-item-selected {
          background-color: #6a6663 !important;
          border-radius: 8px;
          color: #000 !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        /* 一级菜单选中样式 - 只有明确在 selectedKeys 中的才显示 */
        .custom-menu > .ant-menu-item-selected {
          color: #000 !important;
          background-color: #6a6663 !important;
        }
        /* 选中子菜单时，父菜单显示特定背景色 - 使用data-menu-id属性选择器 */
        .custom-menu > .ant-menu-submenu.ant-menu-submenu-selected > .ant-menu-submenu-title[data-menu-id*="creator"],
        .custom-menu > .ant-menu-submenu.ant-menu-submenu-selected > .ant-menu-submenu-title[data-menu-id*="writer"],
        .custom-menu > .ant-menu-submenu.ant-menu-submenu-selected > .ant-menu-submenu-title[data-menu-id*="publisher"] {
          background-color: #706b64 !important;
        }
        .custom-menu .ant-menu-sub {
          background-color: transparent !important;
        }
        /* 二级菜单（任务列表等）样式 - 更浅的颜色 */
        .custom-menu .ant-menu-sub .ant-menu-item {
          background-color: #e8e4e1 !important;
          font-size: 14px !important;
          color: #666 !important;
          font-weight: 400 !important;
        }
        .custom-menu .ant-menu-sub .ant-menu-item[data-key*="prompts"] {
          color: #000 !important;
          font-weight: 500 !important;
        }
        .custom-menu .ant-menu-sub .ant-menu-item:hover {
          background-color: #c4cacd !important;
        }
        .custom-menu .ant-menu-sub .ant-menu-item-selected {
          background-color: #c4cacd !important;
          color: #333 !important;
        }
      `}</style>
      <Layout style={{ minHeight: '100vh', background: 'rgba(255, 248, 220, 0.25)' }}>
      <Sider 
        width={260} 
        style={{ 
          background: '#ffffff',
          borderRadius: '0 24px 24px 0',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #333' }}>
          <Space align="center">
            <div style={{ 
              width: 44, 
              height: 44, 
              background: '#FFF8DC',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            }}>
              <BookOutlined style={{ fontSize: 24, color: '#5a5a5a' }} />
            </div>
            <div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 700 }}>内容管理系统</div>
              <div style={{ color: '#666', fontSize: 12, letterSpacing: 1 }}>Powered by rrrr</div>
            </div>
          </Space>
        </div>
        <Menu
          mode="inline"
          theme="light"
          className="custom-menu"
          selectedKeys={
            currentRole === 'creator'
              ? ['creator', `creator-${creatorSubPage}`]
              : currentRole === 'writer'
                ? ['writer', `writer-${writerSubPage}`]
                : currentRole === 'publisher'
                  ? ['publisher', `publisher-${publisherSubPage}`]
                  : currentRole === 'settings'
                    ? ['settings']
                    : [currentRole]
          }
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          style={{ 
            height: 'calc(100% - 89px)', 
            background: '#e8e4e1',
            borderRight: 0,
            padding: '12px',
            borderRadius: '12px',
          }}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith('creator-')) {
              setCurrentRole('creator');
              setCreatorSubPage(key.replace('creator-', '') as CreatorSubPage);
            } else if (key.startsWith('writer-')) {
              setCurrentRole('writer');
              setWriterSubPage(key.replace('writer-', '') as WriterSubPage);
              if (!openKeys.includes('writer')) {
                setOpenKeys(prev => [...prev, 'writer']);
              }
              if (key === 'writer-draft' || key === 'writer-ready' || key === 'writer-completed') {
                if (!openKeys.includes('writer-tasks')) {
                  setOpenKeys(prev => [...prev, 'writer-tasks']);
                }
              }
            } else if (key.startsWith('publisher-')) {
              setCurrentRole('publisher');
              setPublisherSubPage(key.replace('publisher-', '') as PublisherSubPage);
              if (!openKeys.includes('publisher')) {
                setOpenKeys(prev => [...prev, 'publisher']);
              }
              if (key === 'publisher-ready' || key === 'publisher-completed') {
                if (!openKeys.includes('publisher-tasks')) {
                  setOpenKeys(prev => [...prev, 'publisher-tasks']);
                }
              }
            } else if (key === 'creator') {
              setCurrentRole('creator');
              setCreatorSubPage('single');
              setOpenKeys(['creator']);
            } else if (key === 'writer') {
              setCurrentRole('writer');
              setWriterSubPage('tasks');
              setOpenKeys(['writer']);
            } else if (key === 'publisher') {
              setCurrentRole('publisher');
              setPublisherSubPage('tasks');
              setOpenKeys(['publisher']);
            } else if (key === 'settings') {
              setCurrentRole('settings');
              setOpenKeys(['settings']);
            } else {
              setCurrentRole(key as UserRole);
            }
          }}
        />
      </Sider>
      <Layout style={{ background: 'rgba(255, 248, 220, 0.3)', padding: '32px' }}>
        <Content style={{ background: 'transparent', margin: 0, minHeight: 280 }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
    </>
  );
}

export default App;
