import { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Button, Space, Tabs, message, Tooltip } from 'antd';
import { 
  EyeOutlined, 
  CopyOutlined, 
  ClearOutlined, 
  CodeOutlined, 
  EditOutlined,
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { markdownToHtml, isMarkdown, countMarkdownHeadings, htmlToPlainText } from '../utils/markdown';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// 历史记录管理
interface HistoryState {
  content: string;
  timestamp: number;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 历史记录状态
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);
  // 记录已做过 Markdown 兜底转换的内容，避免重复转换
  const convertedValueRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 兜底：历史数据里以 Markdown 源码存储的文章（或被 <p>/<br> 包裹的 Markdown 标记），
  // 打开时自动转成富文本标题，避免正文里出现裸露的 #
  useEffect(() => {
    if (!mounted || !value || convertedValueRef.current === value) return;
    const plain = htmlToPlainText(value);
    if (countMarkdownHeadings(plain) >= 2 || isMarkdown(plain)) {
      convertedValueRef.current = value;
      const html = markdownToHtml(plain);
      console.log('[RichTextEditor] 检测到 Markdown 标记，自动转换为富文本');
      onChange(html);
      message.info('检测到 Markdown 标记，已自动转换为富文本标题');
    }
  }, [mounted, value, onChange]);

  // 初始化历史记录
  useEffect(() => {
    if (mounted && historyRef.current.length === 0 && value) {
      historyRef.current = [{ content: value, timestamp: Date.now() }];
      historyIndexRef.current = 0;
    }
  }, [mounted, value]);

  // 使用 useEffect 设置初始内容，避免 dangerouslySetInnerHTML 导致的中文输入问题
  useEffect(() => {
    console.log('[RichTextEditor] useEffect 触发:', {
      hasEditorRef: !!editorRef.current,
      mounted,
      isHtmlMode,
      valueLength: value?.length || 0,
      isUndoing: isUndoingRef.current,
      innerHTMLLength: editorRef.current?.innerHTML?.length || 0,
      innerHTMLPreview: editorRef.current?.innerHTML?.substring(0, 50),
    });
    
    if (editorRef.current && mounted && !isHtmlMode) {
      // 只在值与当前内容不同时更新，避免光标跳动
      // 撤销操作时不更新，避免覆盖撤销的内容
      // isConnected 防护：Modal 销毁等场景下节点可能已脱离文档，此时不再写入
      if (!isUndoingRef.current && editorRef.current.isConnected && editorRef.current.innerHTML !== value) {
        console.log('[RichTextEditor] 设置 innerHTML, 长度:', value?.length || 0);
        editorRef.current.innerHTML = value;
      }
    } else if (mounted && !isHtmlMode && !editorRef.current) {
      // editorRef 还没准备好，延迟重试（记录定时器，卸载时清理）
      console.log('[RichTextEditor] editorRef 未就绪，延迟重试');
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        // isConnected：组件已卸载时 ref 为 null 或节点已脱离文档，直接跳过，避免污染 React 的 DOM 认知
        if (editorRef.current?.isConnected && !isHtmlMode) {
          console.log('[RichTextEditor] 延迟重试成功，设置 innerHTML, 长度:', value?.length || 0);
          editorRef.current.innerHTML = value;
        }
      }, 100);
    }
  }, [value, mounted, isHtmlMode]);

  // 卸载时清理待执行的定时器，避免组件销毁后仍操作已脱离文档的 DOM 节点
  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // 保存历史记录（使用防抖，但保存最后一次）
  const saveToHistory = useCallback((content: string) => {
    // 如果内容相同，不保存
    const currentHistory = historyRef.current[historyIndexRef.current];
    if (currentHistory && currentHistory.content === content) return;
    
    // 如果在撤销过程中有新操作，删除当前位置之后的历史
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }
    
    // 添加新历史记录
    const now = Date.now();
    historyRef.current.push({ content, timestamp: now });
    historyIndexRef.current = historyRef.current.length - 1;
    
    // 限制历史记录数量，最多保存 50 条
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    
    lastSaveTimeRef.current = now;
  }, []);

  // 防抖保存（用于输入时延迟保存）
  const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSaveToHistory = useCallback((content: string) => {
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      saveToHistory(content);
    }, 300);
  }, [saveToHistory]);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      isUndoingRef.current = true;
      historyIndexRef.current--;
      const prevState = historyRef.current[historyIndexRef.current];
      onChange(prevState.content);
      if (editorRef.current) {
        editorRef.current.innerHTML = prevState.content;
      }
      message.success('已撤销');
      // 延迟重置标志，让 useEffect 有机会执行
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
    } else {
      message.info('没有可撤销的操作');
    }
  }, [onChange]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isUndoingRef.current = true;
      historyIndexRef.current++;
      const nextState = historyRef.current[historyIndexRef.current];
      onChange(nextState.content);
      if (editorRef.current) {
        editorRef.current.innerHTML = nextState.content;
      }
      message.success('已重做');
      setTimeout(() => {
        isUndoingRef.current = false;
      }, 0);
    } else {
      message.info('没有可重做的操作');
    }
  }, [onChange]);

  // 执行编辑器命令
  const execCommand = useCallback((command: string, value: string = '') => {
    // 确保编辑器有焦点
    if (editorRef.current) {
      editorRef.current.focus();
    }
    
    // 执行命令
    const success = document.execCommand(command, false, value);
    
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      onChange(content);
      saveToHistory(content);
    }
    
    return success;
  }, [onChange, saveToHistory]);

  // 处理粘贴
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // 尝试同时获取 HTML 和纯文本
    const pastedHtml = e.clipboardData.getData('text/html');
    const pastedText = e.clipboardData.getData('text/plain');
    
    // 剪贴板是否自带富文本（例如从已渲染好的文章剪切而来）
    const hasRichHtml = !!pastedHtml && /<[a-z][^>]*>/i.test(pastedHtml);
    // 文本是否像 Markdown 源码（判定已收紧：普通文章不会被误判）
    const looksLikeMarkdownSource = isMarkdown(pastedText);
    
    // 自带富文本、且不是 Markdown 源码：交给浏览器原生粘贴。
    // 既完整保留原格式，也避免 execCommand('insertHTML') 重建 DOM
    // 与 React fiber 失配引发 removeChild 崩溃。
    if (hasRichHtml && !looksLikeMarkdownSource) {
      return;
    }
    
    // 确认是 Markdown 源码（标题/表格/代码块等）：转换为富文本后插入
    if (looksLikeMarkdownSource) {
      e.preventDefault();
      const htmlContent = markdownToHtml(pastedText);
      document.execCommand('insertHTML', false, htmlContent);
      
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        onChange(content);
        saveToHistory(content);
      }
      message.success('Markdown 已自动转换为富文本格式');
      return;
    }
    
    // 其余情况（纯文本粘贴等）：保持浏览器默认行为
  }, [onChange, saveToHistory]);

  // 处理输入
  const handleInput = () => {
    // 如果正在使用输入法组合，不触发 onChange
    if (isComposingRef.current) return;
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      onChange(content);
      // 使用防抖保存，但立即更新 onChange
      debouncedSaveToHistory(content);
    }
  };

  // 处理输入法组合开始
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  // 处理输入法组合结束
  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    // 组合结束时触发一次 onChange
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // 切换 HTML 代码模式
  const toggleHtmlMode = () => {
    setIsHtmlMode(!isHtmlMode);
    message.success(isHtmlMode ? '已切换回富文本编辑模式' : '已切换到 HTML 代码模式');
  };

  // 复制 HTML 代码
  const handleCopyHtml = () => {
    navigator.clipboard.writeText(value);
    message.success('HTML 代码已复制到剪贴板');
  };

  const handleClear = () => {
    onChange('');
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
    message.success('内容已清空');
  };

  // 隐藏的文件输入框引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 插入图片 - 触发文件选择
  const handleInsertImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editorRef.current) {
      // 将文件转换为 base64
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target?.result as string;
        if (base64Url && editorRef.current) {
          editorRef.current.focus();
          const imgHtml = `<img src="${base64Url}" alt="${file.name}" style="max-width:100%">`;
          document.execCommand('insertHTML', false, imgHtml);
          const content = editorRef.current.innerHTML;
          onChange(content);
          saveToHistory(content);
          message.success('图片已插入');
        }
      };
      reader.readAsDataURL(file);
    }
    // 清空 input 值，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onChange, saveToHistory]);

  // 插入链接
  const handleInsertLink = useCallback(() => {
    const url = prompt('请输入链接地址:');
    if (url && editorRef.current) {
      const text = prompt('请输入链接文字（可选，默认使用URL）:');
      editorRef.current.focus();
      const linkText = text || url;
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      document.execCommand('insertHTML', false, linkHtml);
      const content = editorRef.current.innerHTML;
      onChange(content);
      saveToHistory(content);
    }
  }, [onChange, saveToHistory]);

  const items = [
    {
      key: 'edit',
      label: '编辑',
      children: (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Space wrap>
              <Button 
                icon={<EyeOutlined />} 
                onClick={() => setPreviewVisible(true)}
                size="small"
              >
                预览
              </Button>
              <Button 
                icon={isHtmlMode ? <EditOutlined /> : <CodeOutlined />}
                onClick={toggleHtmlMode}
                size="small"
                type={isHtmlMode ? 'default' : 'primary'}
              >
                {isHtmlMode ? '返回富文本编辑' : '查看HTML代码'}
              </Button>
              <Button 
                icon={<CopyOutlined />} 
                onClick={handleCopyHtml}
                size="small"
              >
                复制HTML
              </Button>
              <Button 
                icon={<ClearOutlined />} 
                onClick={handleClear}
                size="small"
                danger
              >
                清空
              </Button>
            </Space>
          </div>
          
          {isHtmlMode ? (
            // HTML 代码编辑模式
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="HTML 代码..."
              rows={15}
              style={{ 
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 12,
                background: '#f5f5f5',
                padding: 12,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                resize: 'vertical'
              }}
            />
          ) : (
            // 富文本编辑模式
            mounted && (
              <div>
                {/* 隐藏的文件输入框 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {/* 工具栏 */}
                <div style={{ 
                  display: 'flex', 
                  gap: 4, 
                  padding: 8, 
                  background: '#f5f5f5', 
                  border: '1px solid #d9d9d9',
                  borderBottom: 'none',
                  borderRadius: '4px 4px 0 0',
                  flexWrap: 'wrap'
                }}>
                  <Tooltip title="加粗"><Button icon={<BoldOutlined />} onClick={() => execCommand('bold')} size="small" /></Tooltip>
                  <Tooltip title="斜体"><Button icon={<ItalicOutlined />} onClick={() => execCommand('italic')} size="small" /></Tooltip>
                  <Tooltip title="下划线"><Button icon={<UnderlineOutlined />} onClick={() => execCommand('underline')} size="small" /></Tooltip>
                  <Tooltip title="删除线"><Button icon={<StrikethroughOutlined />} onClick={() => execCommand('strikeThrough')} size="small" /></Tooltip>
                  <div style={{ width: 1, height: 24, background: '#d9d9d9', margin: '0 4px' }} />
                  <Tooltip title="正文"><Button onClick={() => execCommand('formatBlock', 'P')} size="small">P</Button></Tooltip>
                  <Tooltip title="H1"><Button onClick={() => execCommand('formatBlock', 'H1')} size="small">H1</Button></Tooltip>
                  <Tooltip title="H2"><Button onClick={() => execCommand('formatBlock', 'H2')} size="small">H2</Button></Tooltip>
                  <Tooltip title="H3"><Button onClick={() => execCommand('formatBlock', 'H3')} size="small">H3</Button></Tooltip>
                  <div style={{ width: 1, height: 24, background: '#d9d9d9', margin: '0 4px' }} />
                  <Tooltip title="无序列表"><Button icon={<UnorderedListOutlined />} onClick={() => execCommand('insertUnorderedList')} size="small" /></Tooltip>
                  <Tooltip title="有序列表"><Button icon={<OrderedListOutlined />} onClick={() => execCommand('insertOrderedList')} size="small" /></Tooltip>
                  <div style={{ width: 1, height: 24, background: '#d9d9d9', margin: '0 4px' }} />
                  <Tooltip title="插入链接"><Button icon={<LinkOutlined />} onClick={handleInsertLink} size="small" /></Tooltip>
                  <Tooltip title="插入本地图片"><Button icon={<PictureOutlined />} onClick={handleInsertImage} size="small" /></Tooltip>
                  <div style={{ width: 1, height: 24, background: '#d9d9d9', margin: '0 4px' }} />
                  <Tooltip title="撤销 (Ctrl+Z)">
                    <Button 
                      icon={<ArrowLeftOutlined />} 
                      onClick={handleUndo} 
                      size="small"
                      disabled={historyIndexRef.current <= 0}
                    >
                      撤销
                    </Button>
                  </Tooltip>
                  <Tooltip title="重做 (Ctrl+Y)">
                    <Button 
                      icon={<ArrowRightOutlined />} 
                      onClick={handleRedo} 
                      size="small"
                      disabled={historyIndexRef.current >= historyRef.current.length - 1}
                    >
                      重做
                    </Button>
                  </Tooltip>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  onPaste={handlePaste}
                  onInput={handleInput}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  style={{
                    minHeight: 350,
                    maxHeight: 'calc(100vh - 300px)',
                    overflowY: 'auto',
                    padding: 16,
                    border: '1px solid #d9d9d9',
                    borderRadius: '0 0 4px 4px',
                    background: '#fff',
                    fontSize: 14,
                    lineHeight: 1.6,
                    outline: 'none'
                  }}
                />
              </div>
            )
          )}
          
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
            {isHtmlMode 
              ? '提示：当前为 HTML 代码模式，可直接编辑 HTML 标签'
              : '提示：粘贴 Markdown 格式内容会自动转换为富文本，可直接在编辑器中可视化编辑'}
          </div>
        </div>
      ),
    },
    {
      key: 'rendered',
      label: '渲染预览',
      children: (
        <div 
          style={{ 
            border: '1px solid #d9d9d9', 
            borderRadius: 6,
            padding: 16, 
            minHeight: 350,
            maxHeight: 500,
            overflow: 'auto',
            background: '#fff',
            fontSize: 14,
            lineHeight: 1.6
          }}
          dangerouslySetInnerHTML={{ 
            __html: value || '<p style="color: #999;">暂无内容</p>' 
          }}
        />
      ),
    },
  ];

  return (
    <div>
      <Tabs 
        defaultActiveKey="edit"
        items={items}
      />

      {/* 渲染预览 Modal */}
      <Modal
        title="渲染预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>
        ]}
        width={900}
      >
        <div 
          style={{ 
            border: '1px solid #f0f0f0', 
            padding: 24, 
            minHeight: 300,
            maxHeight: 600,
            overflow: 'auto',
            background: '#fff',
            fontSize: 14,
            lineHeight: 1.6
          }}
          dangerouslySetInnerHTML={{ 
            __html: value || '<p style="color: #999;">暂无内容</p>' 
          }}
        />
      </Modal>
    </div>
  );
}
