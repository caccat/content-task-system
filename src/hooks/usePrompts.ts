import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import type { Prompt } from '../types';

// 模块级缓存：切换页面回来时先用缓存数据立即渲染
let promptsCache: { data: Prompt[]; ts: number } | null = null;
const PROMPTS_CACHE_TTL = 30 * 1000;

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>(() => promptsCache?.data || []);
  const [loading, setLoading] = useState(() => !promptsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(async () => {
    try {
      const cacheFresh = promptsCache && Date.now() - promptsCache.ts < PROMPTS_CACHE_TTL;
      if (!cacheFresh) setLoading(true);
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching prompts:', error);
        setError(error.message);
        return;
      }

      setPrompts((data as Prompt[]) || []);
      promptsCache = { data: (data as Prompt[]) || [], ts: Date.now() };
      setError(null);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('获取提示词列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cacheFresh = promptsCache && Date.now() - promptsCache.ts < PROMPTS_CACHE_TTL;
    if (!cacheFresh) fetchPrompts();

    const interval = setInterval(() => {
      fetchPrompts();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchPrompts]);

  const createPrompt = async (promptData: Omit<Prompt, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('prompts')
      .insert(promptData as any)
      .select()
      .single();

    if (error) {
      console.error('创建提示词失败:', error);
      throw error;
    }

    await fetchPrompts();
    return data;
  };

  const updatePrompt = async (id: string, updates: Partial<Prompt>) => {
    const { error } = await supabase
      .from('prompts')
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('id', id);

    if (error) {
      console.error('更新提示词失败:', error);
      throw error;
    }

    await fetchPrompts();
  };

  const deletePrompt = async (id: string) => {
    const { error } = await supabase
      .from('prompts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除提示词失败:', error);
      throw error;
    }

    await fetchPrompts();
  };

  return {
    prompts,
    loading,
    error,
    createPrompt,
    updatePrompt,
    deletePrompt,
    refreshPrompts: fetchPrompts,
  };
}
