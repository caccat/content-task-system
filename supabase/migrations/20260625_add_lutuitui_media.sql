-- 鹿推推媒体绑定功能
-- 2026-06-25

-- 1. 添加 lutuitui_media_id 字段（鹿推推自媒体ID）
ALTER TABLE websites ADD COLUMN IF NOT EXISTS lutuitui_media_id INTEGER;

-- 2. 添加 lutuitui_media_name 字段（鹿推推自媒体名称，快照）
ALTER TABLE websites ADD COLUMN IF NOT EXISTS lutuitui_media_name TEXT;
