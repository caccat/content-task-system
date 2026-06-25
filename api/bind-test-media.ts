/**
 * 临时 API：将"北京列举网"绑定到测试媒体 33083
 * 部署后访问一次即可，用完可删除
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Missing Supabase credentials" });
  }

  // 1. 查找"北京列举网"
  const findRes = await fetch(
    `${supabaseUrl}/rest/v1/websites?name=ilike.*北京列举*&select=id,name,lutuitui_media_id`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );
  const websites = await findRes.json();

  if (!Array.isArray(websites) || websites.length === 0) {
    return res.status(404).json({ error: "未找到'北京列举网'", allWebsites: websites });
  }

  const target = websites[0];

  // 2. 更新绑定
  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/websites?id=eq.${target.id}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        lutuitui_media_id: 33083,
        lutuitui_media_name: "测试媒体 (ID: 33083)",
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return res.status(500).json({ error: "更新失败", detail: err });
  }

  const updated = await updateRes.json();
  return res.status(200).json({
    success: true,
    message: `已将"${target.name}"绑定到测试媒体 ID: 33083`,
    website: updated,
  });
}
