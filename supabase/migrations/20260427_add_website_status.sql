-- 网站状态功能迁移
-- 2026-04-27

-- 1. 添加 status 字段（一轮测试/二轮测试/已入库）
ALTER TABLE websites ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'round1_test';

-- 2. 添加 status_updated_at 字段（状态变更时间）
ALTER TABLE websites ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. 将现有数据的状态更新为已入库
UPDATE websites SET status = 'approved', status_updated_at = NOW() WHERE status IS NULL;

-- 4. 添加约束确保 status 值合法
ALTER TABLE websites DROP CONSTRAINT IF EXISTS websites_status_check;
ALTER TABLE websites ADD CONSTRAINT websites_status_check 
  CHECK (status IN ('round1_test', 'round2_test', 'approved'));
