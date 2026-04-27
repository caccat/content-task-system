import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import type { Website, WebsiteStatus } from '../types';

export function useWebsites() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWebsites = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('websites')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching websites:', error);
        setError(error.message);
        return;
      }

      setWebsites((data as Website[]) || []);
      setError(null);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('获取网站列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebsites();

    // 每 10 秒刷新一次
    const interval = setInterval(() => {
      fetchWebsites();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchWebsites]);

  const createWebsite = async (websiteData: Omit<Website, 'id' | 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('websites')
      .insert({
        ...websiteData,
        status_updated_at: now,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('创建网站失败:', error);
      throw error;
    }

    await fetchWebsites();
    return data;
  };

  const updateWebsite = async (id: string, updates: Partial<Website>) => {
    const { error } = await supabase
      .from('websites')
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) {
      console.error('更新网站失败:', error);
      throw error;
    }

    await fetchWebsites();
  };

  // 更新网站状态（同时更新时间戳）
  const updateWebsiteStatus = async (id: string, status: WebsiteStatus) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('websites')
      .update({ 
        status, 
        status_updated_at: now,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('更新网站状态失败:', error);
      throw error;
    }

    await fetchWebsites();
  };

  const deleteWebsite = async (id: string) => {
    const { error } = await supabase
      .from('websites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除网站失败:', error);
      throw error;
    }

    await fetchWebsites();
  };

  return {
    websites,
    loading,
    error,
    createWebsite,
    updateWebsite,
    updateWebsiteStatus,
    deleteWebsite,
    refreshWebsites: fetchWebsites,
  };
}
