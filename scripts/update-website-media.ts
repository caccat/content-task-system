/**
 * 更新指定网站的鹿推推媒体绑定
 * 用法: npx tsx scripts/update-website-media.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 缺少 Supabase 凭据！");
  console.error("请设置环境变量: VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. 查找"北京列举网"
  const { data: websites, error: findError } = await supabase
    .from("websites")
    .select("*")
    .ilike("name", "%北京列举%");

  if (findError) {
    console.error("❌ 查询网站失败:", findError.message);
    process.exit(1);
  }

  if (!websites || websites.length === 0) {
    console.log("❌ 未找到名称包含'北京列举'的网站");
    // 列出所有网站以便确认
    const { data: all } = await supabase.from("websites").select("id,name");
    console.log("当前所有网站:");
    all?.forEach((w) => console.log(`  ${w.id} | ${w.name}`));
    process.exit(1);
  }

  if (websites.length > 1) {
    console.log("找到多个匹配的网站:");
    websites.forEach((w) =>
      console.log(`  ${w.id} | ${w.name} | media_id=${w.lutuitui_media_id}`)
    );
    console.log("请修改脚本指定具体 ID");
    process.exit(1);
  }

  const website = websites[0];
  console.log(`✅ 找到网站: ${website.name} (${website.id})`);

  // 2. 更新绑定
  const { error: updateError } = await supabase
    .from("websites")
    .update({
      lutuitui_media_id: 33083,
      lutuitui_media_name: "测试媒体 (ID: 33083)",
      updated_at: new Date().toISOString(),
    })
    .eq("id", website.id);

  if (updateError) {
    console.error("❌ 更新失败:", updateError.message);
    process.exit(1);
  }

  console.log(`✅ 已将"${website.name}"绑定到鹿推推媒体 ID: 33083`);
  console.log(`   media_id = 33083`);
  console.log(`   media_name = 测试媒体 (ID: 33083)`);
}

main();
