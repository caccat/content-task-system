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

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// 将 Markdown 转换为 HTML
function markdownToHtml(markdown: string): string {
  let html = markdown;
  
  // 处理代码块
  const codeBlocks: string[] = [];
  html = html.replace(/```([\s\S]*?)```/g, (match) => {
    codeBlocks.push(match);
    return `<!--CODE_BLOCK_${codeBlocks.length - 1}-->`;
  });
  
  // 处理行内代码
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    inlineCodes.push(code);
    return `<!--INLINE_CODE_${inlineCodes.length - 1}-->`;
  });
  
  // 处理标题
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // 处理加粗
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // 处理斜体
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // 处理删除线
  html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
  
  // 处理链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // 处理图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
  
  // 处理引用
  html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left:4px solid #ddd;padding-left:16px;margin:16px 0;color:#666;">$1</blockquote>');
  
  // 处理水平线
  html = html.replace(/^---$/gim, '<hr>');
  
  // 处理表格
  const tableRegex = /\|(.+)\|\n\|[-:\|\s]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, rows) => {
    const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h);
    const rowLines = rows.trim().split('\n');
    
    let tableHtml = '<table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr>';
    headers.forEach((h: string) => {
      tableHtml += `<th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;text-align:left;">${h}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    rowLines.forEach((line: string) => {
      const cells = line.split('|').map((c: string) => c.trim()).filter((c: string) => c);
      if (cells.length > 0) {
        tableHtml += '<tr>';
        cells.forEach((c: string) => {
          tableHtml += `<td style="border:1px solid #ddd;padding:8px;">${c}</td>`;
        });
        tableHtml += '</tr>';
      }
    });
    
    tableHtml += '</tbody></table>';
    return tableHtml;
  });
  
  // 处理无序列表
  html = html.replace(/^(\s*)[-*+] (.*$)/gim, '$1<li>$2</li>');
  // 处理有序列表
  html = html.replace(/^(\s*)\d+\. (.*$)/gim, '$1<li>$2</li>');
  
  // 合并列表项
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return `<ul style="margin:8px 0;padding-left:24px;">${match}</ul>`;
  });
  html = html.replace(/<\/ul>\s*<ul[^>]*>/g, '');
  
  // 处理段落
  const lines = html.split('\n');
  let result: string[] = [];
  let inParagraph = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
    } else if (trimmed.startsWith('<') && !trimmed.startsWith('<li>')) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(line);
    } else if (trimmed.startsWith('<li>')) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(line);
    } else {
      if (!inParagraph) {
        result.push('<p style="margin:8px 0;line-height:1.6;">');
        inParagraph = true;
      }
      result.push(line);
    }
  }
  if (inParagraph) {
    result.push('</p>');
  }
  
  html = result.join('\n');
  
  // 恢复代码块
  codeBlocks.forEach((code, i) => {
    const content = code.replace(/```/g, '').trim();
    html = html.replace(`<!--CODE_BLOCK_${i}-->`, `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow:auto;font-family:monospace;">${content}</pre>`);
  });
  
  // 恢复行内代码
  inlineCodes.forEach((code, i) => {
    html = html.replace(`<!--INLINE_CODE_${i}-->`, `<code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;font-family:monospace;">${code}</code>`);
  });
  
  html = html.replace(/<p><\/p>/g, '');
  
  return html.trim();
}

// 检测是否为 Markdown 格式
function isMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6} /m,
    /\*\*.*?\*\*/,
    /\*.*?\*/,
    /\[.*?\]\(.*?\)/,
    /!\[.*?\]\(.*?\)/,
    /^> /m,
    /^[-*+] /m,
    /^\d+\. /m,
    /\|[^\n]+\|[^\n]*\|/,  // 表格，支持跨行
    /```[\s\S]*?```/,
    /`[^`]+`/,
    /~~.*?~~/,
    /^---$/m
  ];
  
  return markdownPatterns.some(pattern => pattern.test(text));
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
  
  // 历史记录状态
  const historyRef = useRef<HistoryState[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 初始化历史记录
  useEffect(() => {
    if (mounted && historyRef.current.length === 0 && value) {
      historyRef.current = [{ content: value, timestamp: Date.now() }];
      historyIndexRef.current = 0;
    }
  }, [mounted, value]);

  // 使用 useEffect 设置初始内容，避免 dangerouslySetInnerHTML 导致的中文输入问题
  useEffect(() => {
    if (editorRef.current && mounted && !isHtmlMode) {
      // 只在值与当前内容不同时更新，避免光标跳动
      // 撤销操作时不更新，避免覆盖撤销的内容
      if (!isUndoingRef.current && editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value, mounted, isHtmlMode]);

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
    const pastedText = e.clipboardData.getData('text/plain');
    
    if (isMarkdown(pastedText)) {
      e.preventDefault();
      const htmlContent = markdownToHtml(pastedText);
      
      // 插入 HTML
      document.execCommand('insertHTML', false, htmlContent);
      
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        onChange(content);
        saveToHistory(content);
      }
      message.success('Markdown 已自动转换为富文本格式');
    }
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
