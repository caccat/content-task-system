export type UserRole = 'creator' | 'writer' | 'publisher';

export interface TaskWithArticles extends Task {
  articles: Article[];
  completedCount: number;
}

export interface Article {
  id: string;
  created_at: string;
  updated_at: string;
  task_id: string;
  content: string;
  status: 'draft' | 'ready' | 'published';
  published_at: string | null;
  published_by: string | null;
  website?: string | null;
  notes?: string | null;
  // 新增：投稿平台回链
  published_url?: string | null;
  // 新增：平台实际发稿时间
  media_published_at?: string | null;
}

// 网站状态类型
export type WebsiteStatus = 'round1_test' | 'round2_test' | 'approved';

export interface Website {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  platform: string;
  price: number;
  status: WebsiteStatus;
  status_updated_at: string;
  lutuitui_media_id?: number | null;
  lutuitui_media_name?: string | null;
}

// 鹿推推自媒体（从API返回的原始数据）
export interface LutuituiMedia {
  id: number;
  name: string;
  platformName: string;
  platformCode: string;
  regionName: string;
  regionCode: string;
  industryName: string;
  costPrice: number;
  entryUrl: string | null;
}

// 网站状态配置
export const WEBSITE_STATUS_OPTIONS = [
  { label: '一轮测试', value: 'round1_test' },
  { label: '二轮测试', value: 'round2_test' },
  { label: '已入库', value: 'approved' },
] as const;

// 文章示例类型
export interface ArticleExample {
  note: string;  // 备注说明
  url: string;   // 示例链接
}

export interface Prompt {
  id: string;
  created_at: string;
  updated_at: string;
  type: string;
  content: string;
  example_url: string | null;  // 旧字段，兼容数据库
  example_urls: ArticleExample[] | null;  // 新字段：多个示例
}

export interface AppSettings {
  id: string;
  created_at: string;
  updated_at: string;
  key: string;
  value: string;
}

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  city: string;
  quantity: number;
  websites: string[];
  prompt_type: string;
  writing_suggestions: string | null;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_by: string;
  // 新增：生成模式
  generation_mode: 'manual' | 'ai';
  // 新增：AI生成状态
  ai_status: 'pending' | 'generating' | 'completed' | 'failed' | null;
  // 新增：用户填写的AI标题（存数据库，替代localStorage）
  user_title?: string | null;
  // 新增：用户填写的额外要求（存数据库，替代localStorage）
  extra_requirement?: string | null;
}

export const CITIES = [
  '上海', '北京', '广州', '南京', '香港', '新加坡', '英国', '深圳', '重庆', '苏州',
  '成都', '杭州', '武汉', '宁波', '天津', '青岛', '无锡', '长沙', '郑州', '济南',
  '合肥', '福州', '泉州'
] as const;

export const WEBSITES = [
  { label: '知乎', value: 'zhihu' },
  { label: '微信公众号', value: 'wechat' },
  { label: '今日头条', value: 'toutiao' },
  { label: '百家号', value: 'baijiahao' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
  { label: 'B站', value: 'bilibili' },
  { label: '微博', value: 'weibo' },
] as const;

export const PROMPT_TYPES = [
  { label: '产品推广', value: 'product_promotion' },
  { label: '品牌故事', value: 'brand_story' },
  { label: '行业资讯', value: 'industry_news' },
  { label: '用户案例', value: 'user_case' },
  { label: '教程指南', value: 'tutorial' },
  { label: '活动宣传', value: 'event_promotion' },
] as const;
