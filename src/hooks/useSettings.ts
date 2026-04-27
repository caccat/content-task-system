import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*');

      if (error) {
        console.error('Error fetching settings:', error);
        return;
      }

      const settingsMap: Record<string, string> = {};
      (data || []).forEach((item: any) => {
        settingsMap[item.key] = item.value;
      });
      setSettings(settingsMap);
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = (key: string, defaultValue: string = '') => {
    return settings[key] || defaultValue;
  };

  const setSetting = async (key: string, value: string) => {
    // 先尝试 upsert（需要表有 key 的唯一约束）
    const { error: upsertError } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() } as any, {
        onConflict: 'key',
      });

    if (upsertError) {
      // 如果 upsert 失败（可能是因为没有唯一约束），尝试先查询再更新/插入
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('key', key)
        .single();

      if (existing) {
        // 已存在，更新
        const { error: updateError } = await supabase
          .from('settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (updateError) {
          console.error('保存设置失败:', updateError);
          throw updateError;
        }
      } else {
        // 不存在，插入
        const { error: insertError } = await supabase
          .from('settings')
          .insert({ key, value, updated_at: new Date().toISOString() } as any);

        if (insertError) {
          console.error('保存设置失败:', insertError);
          throw insertError;
        }
      }
    }

    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return {
    settings,
    loading,
    getSetting,
    setSetting,
    refreshSettings: fetchSettings,
  };
}
