-- 给 articles 表新增回链和平台发稿时间字段
-- 用于"已完成"任务表格的后两列

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS published_url TEXT,
  ADD COLUMN IF NOT EXISTS media_published_at TIMESTAMPTZ;

-- 添加注释
COMMENT ON COLUMN articles.published_url IS '投稿平台的文章回链URL';
COMMENT ON COLUMN articles.media_published_at IS '投稿平台的实际发稿时间';
