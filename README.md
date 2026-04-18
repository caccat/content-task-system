# 内容生产与发布任务管理系统

基于 React + TypeScript + Supabase Realtime 的多角色内容任务协作平台。

## 功能特性

### 三种角色

1. **任务创建者**
   - 创建内容生产和发布任务
   - 选择发布城市
   - 输入发布数量
   - 选择发布网站（多选）
   - 选择文章提示词类型
   - 输入文章写作建议
   - 设置文章完成日期

2. **内容生成者**
   - 查看所有创建的任务
   - 在发布内容区域将生成好的文章一篇一篇复制粘贴
   - 实时查看任务进度

3. **发布执行者**
   - 查看发布城市、发布数量、发布内容、发布网站
   - 发布完一篇后勾选完成
   - 记录发布人和发布时间

### 技术特性

- **Supabase Realtime**: 实时数据同步，所有角色看到的数据实时更新
- **响应式设计**: 适配各种屏幕尺寸
- **进度追踪**: 可视化展示任务完成进度
- **状态管理**: 草稿 → 已就绪 → 已发布

## 快速开始

### 1. 配置 Supabase

1. 在 [Supabase](https://supabase.com) 创建新项目
2. 在 SQL Editor 中执行以下脚本创建表：

```sql
-- 创建任务表
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
ALTER PUBLICATION supabase_realtime ADD TABLE articles;
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，并填入你的 Supabase 信息：

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 安装依赖并运行

```bash
npm install
npm run dev
```

## 项目结构

```
src/
├── components/
│   ├── TaskCreator.tsx      # 任务创建者界面
│   ├── ContentWriter.tsx    # 内容生成者界面
│   └── TaskPublisher.tsx    # 发布执行者界面
├── hooks/
│   └── useSupabase.ts       # Supabase 数据操作钩子
├── types/
│   └── index.ts             # 类型定义
├── supabase.ts              # Supabase 客户端配置
├── App.tsx                  # 主应用组件
└── main.tsx                 # 入口文件
```

## 使用流程

1. **任务创建者** 登录系统，点击左侧"任务创建者"菜单
2. 填写任务信息（城市、数量、网站、提示词类型等）并创建
3. **内容生成者** 登录系统，点击左侧"内容生成者"菜单
4. 查看任务列表，点击任务进入详情，逐篇添加文章内容
5. **发布执行者** 登录系统，点击左侧"发布执行者"菜单
6. 查看待发布文章，发布后勾选完成并输入发布人姓名

## 技术栈

- React 18
- TypeScript
- Vite
- Ant Design
- Supabase (PostgreSQL + Realtime)
- Day.js
