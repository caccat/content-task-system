/**
 * Markdown ⇄ HTML 工具
 *
 * 集中放置的原因：AI 生成的文章有时返回 HTML、有时返回 Markdown 源码。
 * 此前保存时只做"换行转 <br>/<p>"，不解析 Markdown，导致 "# 一、" 这类标记
 * 作为普通文本存进数据库，编辑器与发布端都会看到裸露的 # 。
 * 现在由本模块统一判定并转换，供富文本编辑器与内容保存共用。
 */

/** 统计行首 Markdown 标题数量（# 后必须有空白，排除 "#澳大利亚" 这类无空格写法） */
export function countMarkdownHeadings(text: string): number {
  if (!text) return 0;
  return (text.match(/^#{1,6}[ \t]+\S/gm) || []).length;
}

/**
 * 检测是否为 Markdown 源码
 *
 * 判定收紧过两轮：
 * 1. 最初"命中任意一条即判定"，导致含行内 | 的评价行（"机构 | 评分 | 星级"）被误判，
 *    粘贴时丢弃剪贴板富文本、整篇重转。
 * 2. 之后只数"强特征种类"，导致整篇 Markdown（大量 "# 一、"）只算 1 个强特征而不被转换。
 * 现在以"行首标题行数"为主依据，兼顾表格/代码块等决定性特征。
 */
export function isMarkdown(text: string): boolean {
  if (!text || !text.trim()) return false;

  // 决定性特征：代码块围栏几乎只出现在 Markdown 源码中
  if (/```[\s\S]*?```/.test(text)) return true;

  // 主依据：行首标题 >= 2 个，基本可确认整篇是 Markdown 源码
  // （AI 生成的文章常以 "# 一、"、"## 1." 组织全文）
  if (countMarkdownHeadings(text) >= 2) return true;

  // 表格：表格行与分隔线须同时存在（避免出现"机构 | 评分"这类行内竖线被误判）
  const hasTableRow = /^\s*\|[^\n]*\|\s*$/m.test(text);
  const hasTableDivider = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m.test(text);
  if (hasTableRow && hasTableDivider) return true;

  // 其他强特征：Markdown 源码特有语法
  const strongPatterns = [
    /^#{1,6}[ \t]+\S/m,                            // 标题（# 后必须有空白）
    /\[[^\]]+\]\([^)]+\)/,                         // 链接 [文字](url)
    /!\[[^\]]*\]\([^)]+\)/,                        // 图片 ![alt](url)
  ];

  // 弱特征：中文文章里也常见，单独命中不足以判定
  const weakPatterns = [
    /\*\*[^*]+\*\*/,
    /~~[^~]+~~/,
    /^[-*+]\s+/m,
    /^\d+\.\s+/m,
    /^>\s+/m,
    /`[^`\n]+`/,
  ];

  const strongHits = strongPatterns.filter((p) => p.test(text)).length;
  const weakHits = weakPatterns.filter((p) => p.test(text)).length;

  return strongHits >= 2 || (strongHits >= 1 && weakHits >= 2);
}

/** 把 HTML 转成纯文本（块级标签与 <br> 转为换行），用于检测"被 HTML 包裹的 Markdown" */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n');
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n');
}

/** 将换行符转换为 HTML 标签（原 ContentWriter 内的实现，保持不变） */
export function convertNewlinesToHtml(text: string): string {
  if (!text) return '';
  // 先按双换行分割段落，再按单换行转<br>
  const paragraphs = text.split(/\n\n+/);
  const htmlParagraphs = paragraphs.map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    // 将单换行替换为 <br>
    const withBreaks = trimmed.replace(/\n/g, '<br>');
    return `<p style="margin:8px 0;line-height:1.6;">${withBreaks}</p>`;
  }).filter(Boolean);
  return htmlParagraphs.join('');
}

/**
 * 规范化文章内容（AI 生成后保存前调用）
 *
 * - 内容是 Markdown 源码（或被 <p>/<br> 包裹的 Markdown）→ 转成真正的 HTML 标题
 * - 其余情况沿用原有换行转换逻辑，行为不变
 */
export function normalizeArticleContent(raw: string): string {
  if (!raw) return '';
  const text = raw.trim();
  if (!text) return '';

  // 先转纯文本再判定：历史数据里 Markdown 标记常被 <p>/<br> 包裹，行首 # 并不在字符串行首
  const plain = htmlToPlainText(text);
  if (countMarkdownHeadings(plain) >= 2 || isMarkdown(plain)) {
    return markdownToHtml(plain);
  }
  return convertNewlinesToHtml(text);
}

/** Markdown → HTML */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // 标准化换行符（Windows 的 \r\n 转为 \n）
  html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
  // 说明：[ \t]* 允许 "#" 后没有空格（AI 生成内容常见 "#澳大利亚"、"###第一步"），
  // 旧正则要求 "# " 必须有空格，导致这些写法不被识别，# 会原样残留在正文里
  html = html.replace(/^(#{1,6})[ \t]*(.+)$/gm, (_m, hashes, titleText) => {
    const level = Math.min(hashes.length, 6);
    return `<h${level}>${titleText.trim()}</h${level}>`;
  });

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

  // 处理表格（兼容 Windows 的 \r\n 换行符）
  const tableRegex = /\|(.+)\|\r?\n\|[-:\|\s]+\|\r?\n((?:\|.+\|\r?\n?)+)/g;
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
  const result: string[] = [];
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
      } else {
        // 段内换行保留为 <br>，否则 HTML 会把换行折叠成空格
        result.push('<br>');
      }
      result.push(line);
    }
  }
  if (inParagraph) {
    result.push('</p>');
  }

  html = result.join('');

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
