import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import type { Task, Article, TaskWithArticles } from '../types';

export function useTasks() {
  const [tasks, setTasks] = useState<TaskWithArticles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (tasksError) {
        console.error('Error fetching tasks:', tasksError);
        setError(tasksError.message);
        setLoading(false);
        return;
      }

      const taskIds = (tasksData as Task[]).map(t => t.id);
      
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .in('task_id', taskIds);

      if (articlesError) {
        console.error('Error fetching articles:', articlesError);
        setError(articlesError.message);
        setLoading(false);
        return;
      }

      const tasksWithArticles: TaskWithArticles[] = (tasksData as Task[]).map(task => {
        const taskArticles = (articlesData as Article[] || []).filter(a => a.task_id === task.id);
        return {
          ...task,
          articles: taskArticles,
          completedCount: taskArticles.filter(a => a.status === 'published').length,
        };
      });

      setTasks(tasksWithArticles);
      setError(null);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('连接数据库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    
    // 禁用实时订阅，使用轮询避免错误
    const interval = setInterval(() => {
      fetchTasks();
    }, 60000); // 每 60 秒刷新一次

    return () => {
      clearInterval(interval);
    };
  }, [fetchTasks]);

  const createTask = async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    console.log('createTask 被调用:', taskData);
    
    // 确保新字段有默认值
    const taskWithDefaults = {
      ...taskData,
      generation_mode: taskData.generation_mode || 'manual',
      ai_status: taskData.ai_status || null,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(taskWithDefaults as any)
      .select()
      .single();

    if (error) {
      console.error('创建任务失败:', error);
      throw error;
    }

    console.log('任务创建成功:', data);

    // 从 taskData 中获取网站和备注信息
    const websites = taskData.websites || [];
    const writingSuggestions = taskData.writing_suggestions || '';

    const articlesToInsert = Array.from({ length: taskData.quantity }, (_, index) => ({
      task_id: (data as Task).id,
      content: '',
      status: 'draft' as const,
      // 如果有多个网站，按顺序分配；如果只有一个网站，所有文章都用这个网站
      website: websites.length > 0 ? websites[index % websites.length] : null,
      // 将写作建议作为备注保存
      notes: writingSuggestions || null,
    }));

    console.log('准备创建文章:', articlesToInsert);

    const { error: articlesError } = await supabase
      .from('articles')
      .insert(articlesToInsert as any);

    if (articlesError) {
      console.error('创建文章失败:', articlesError);
      throw articlesError;
    }

    console.log('文章创建成功');
    return data;
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('删除任务失败:', error);
      throw error;
    }
  };

  // 将任务转为 AI 生成模式
  const switchToAiMode = async (taskIds: string[]) => {
    const { error } = await supabase
      .from('tasks')
      .update({
        generation_mode: 'ai',
        ai_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .in('id', taskIds);

    if (error) {
      console.error('切换为AI模式失败:', error);
      throw error;
    }
  };

  // 将任务转为人工生成模式
  const switchToManualMode = async (taskIds: string[]) => {
    const { error } = await supabase
      .from('tasks')
      .update({
        generation_mode: 'manual',
        ai_status: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', taskIds);

    if (error) {
      console.error('切换为人工模式失败:', error);
      throw error;
    }
  };

  // 更新 AI 任务状态
  const updateAiStatus = async (taskId: string, aiStatus: 'pending' | 'generating' | 'completed' | 'failed') => {
    const { error } = await supabase
      .from('tasks')
      .update({
        ai_status: aiStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      console.error('更新AI状态失败:', error);
      throw error;
    }
  };

  return { tasks, loading, error, createTask, deleteTask, refreshTasks: fetchTasks, switchToAiMode, switchToManualMode, updateAiStatus };
}

export function useArticles(taskId?: string) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = useCallback(async () => {
    if (!taskId) return;

    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching articles:', error);
      return;
    }

    setArticles((data as Article[]) || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchArticles();
    
    // 禁用实时订阅，使用轮询避免错误
    const interval = setInterval(() => {
      fetchArticles();
    }, 10000); // 每 10 秒刷新一次

    return () => {
      clearInterval(interval);
    };
  }, [taskId, fetchArticles]);

  const updateArticle = async (articleId: string, updates: Partial<Article>) => {
    const { error } = await supabase
      .from('articles')
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('id', articleId);

    if (error) {
      console.error('Error updating article:', error);
      throw error;
    }
  };

  const publishArticle = async (articleId: string, publisherName: string) => {
    const { error } = await supabase
      .from('articles')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: publisherName,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', articleId);

    if (error) {
      console.error('Error publishing article:', error);
      throw error;
    }
  };

  return { articles, loading, updateArticle, publishArticle, refreshArticles: fetchArticles };
}
