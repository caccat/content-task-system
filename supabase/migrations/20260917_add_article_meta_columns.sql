-- 列表页性能优化：为文章表增加轻量元数据生成列
-- 列表查询不再拉取全文 content，改用 has_content / content_head
-- 2026-09-17（已在生产库执行）

-- 是否已有正文（替代前端 a.content 真值判断）
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS has_content BOOLEAN
  GENERATED ALWAYS AS (COALESCE(LENGTH(content), 0) > 0) STORED;

-- 正文开头摘要（用于已完成表格的标题提取 / H1 检测 / 预览占位）
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS content_head TEXT
  GENERATED ALWAYS AS (LEFT(COALESCE(content, ''), 500)) STORED;
