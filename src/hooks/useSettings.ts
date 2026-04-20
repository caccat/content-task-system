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
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() } as any, {
        onConflict: 'key',
      });

    if (error) {
      console.error('保存设置失败:', error);
      throw error;
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
