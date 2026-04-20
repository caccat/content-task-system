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
