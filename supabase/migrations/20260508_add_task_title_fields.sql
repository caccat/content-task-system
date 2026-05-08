-- 给 tasks 表新增用户填写的标题和额外要求字段
-- 用于 AI 生成时存储用户自定义的标题和额外要求（替代 localStorage）

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_title TEXT,
  ADD COLUMN IF NOT EXISTS extra_requirement TEXT;
