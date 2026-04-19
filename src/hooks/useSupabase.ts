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
    }, 10000); // 每 10 秒刷新一次

    return () => {
      clearInterval(interval);
    };
  }, [fetchTasks]);

  const createTask = async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    console.log('createTask 被调用:', taskData);
    
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskData as any)
      .select()
      .single();

    if (error) {
      console.error('创建任务失败:', error);
      throw error;
    }

    console.log('任务创建成功:', data);

    const articlesToInsert = Array.from({ length: taskData.quantity }, () => ({
      task_id: (data as Task).id,
      content: '',
      status: 'draft' as const,
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

  return { tasks, loading, error, createTask, deleteTask, refreshTasks: fetchTasks };
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
