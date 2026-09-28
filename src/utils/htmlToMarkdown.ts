/**
 * HTML → Markdown 转换
 *
 * 覆盖范围：h1~h6 / 段落 / 加粗 / 斜体 / 链接 / 引用 / 有序与无序列表 / 表格
 * 处理原则：
 *  - 只保留语义，丢弃内联样式（style 属性一律不进入 markdown）
 *  - 空段落（<p><br></p>、<p>&nbsp;</p>）丢弃，避免成片空行
 *  - 转换库按需动态 import：首次用到时才下载，不进首屏包
 */

type TurndownServiceLike = {
  // turndown 既接受 HTML 字符串，也接受 DOM 元素
  turndown: (input: string | HTMLElement) => string;
  addRule: (key: string, rule: unknown) => void;
  use: (plugin: unknown) => void;
};

const EMPTY_BLOCK_TAGS = ['P', 'DIV', 'SECTION', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'];

const getStyleAttr = (node: unknown): string => {
  const el = node as Element | null;
  return (el && typeof el.getAttribute === 'function' && el.getAttribute('style')) || '';
};

/**
 * Markdown 表格语法必须有表头行，否则 GFM 规则不生效、会把 <table> 原样当 HTML 输出。
 * 这里对没有表头的表格，把第一行提升为表头（数据不丢，仍是同一行内容）。
 * 只在传入的临时容器上操作，不改动原文章 HTML。
 */
const normalizeTables = (root: HTMLElement): void => {
  root.querySelectorAll('table').forEach((table) => {
    const firstRow = table.querySelector('tr');
    if (!firstRow || firstRow.querySelector('th')) return; // 已有表头则不动
    const cells = Array.from(firstRow.querySelectorAll('td'));
    cells.forEach((td) => {
      const th = document.createElement('th');
      th.innerHTML = td.innerHTML;
      td.replaceWith(th);
    });
  });
};

let servicePromise: Promise<TurndownServiceLike> | null = null;

const buildService = async (): Promise<TurndownServiceLike> => {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);

  const service = new TurndownService({
    headingStyle: 'atx', // # 标题（保留 H1）
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    strongDelimiter: '**',
    emDelimiter: '*',
    linkStyle: 'inlined',
  }) as unknown as TurndownServiceLike;

  // 表格 / 删除线 / 任务列表 / 代码块语言
  service.use(gfm);

  // 1) 空段落直接丢弃
  service.addRule('dropEmptyBlock', {
    filter: (node: HTMLElement) => {
      if (!EMPTY_BLOCK_TAGS.includes(node.nodeName)) return false;
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (text) return false;
      return !(node.querySelector && node.querySelector('img,table,hr'));
    },
    replacement: () => '',
  });

  // 2) AI 生成的 HTML 常用 <span style="font-weight:bold"> 承载加粗/斜体，尽量还原成语义
  service.addRule('styledSpan', {
    filter: (node: HTMLElement) =>
      node.nodeName === 'SPAN' && /font-weight|font-style/i.test(getStyleAttr(node)),
    replacement: (content: string, node: HTMLElement) => {
      if (!content.trim()) return content;
      const style = getStyleAttr(node);
      let out = content;
      if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(style)) out = `**${out}**`;
      if (/font-style\s*:\s*italic/i.test(style)) out = `*${out}*`;
      return out;
    },
  });

  // 3) markdown 没有下划线语法：保留文字、去掉标签
  service.addRule('underline', {
    filter: ['u'],
    replacement: (content: string) => content,
  });

  return service;
};

const getService = (): Promise<TurndownServiceLike> => {
  if (!servicePromise) servicePromise = buildService();
  return servicePromise;
};

/** 提前把转换库加载好（打开预览弹窗时调用），这样点“复制 Markdown”无需再等下载 */
export const preloadHtmlToMarkdown = (): void => {
  void getService().catch(() => {
    /* 预热失败不影响后续点击时的重试 */
  });
};

/** 把正文中裸出现的 http(s) 网址包成 GFM 自动链接 <url>
 *  兜底逻辑：
 *   - 只处理正文里的纯文本 URL，不改动 <a> 标签生成的 [文字](url) 与原有 <url>
 *   - 自动跳过 ]( 与 < 与反引号 前面，避免重复包裹与破坏代码片段
 *   - URL 字符集排除中文标点，让 URL 在中文标点处自然停下，避免错误吞掉后面的文本
 *  这只在 Markdown 副本里生效，不修改原文章 HTML。
 */
const BARE_URL_RE = /(?<![\(\<\`])https?:\/\/[^\s<>。，：；！？、）」]+/g;

/** 收尾清理：去 nbsp、统一列表缩进、压缩空行、自动包裹裸 URL */
const tidy = (markdown: string): string =>
  markdown
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/^(\s*)([-*+]|\d+\.)\s{2,}/gm, '$1$2 ') // turndown 默认列表缩进较宽，统一成“- ”“1. ”
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(BARE_URL_RE, (m) => `<${m}>`);

/** 把文章 HTML 转成 Markdown 文本 */
export const htmlToMarkdown = async (html: string): Promise<string> => {
  if (!html || !html.trim()) return '';
  const service = await getService();
  const container = document.createElement('div');
  container.innerHTML = html;
  normalizeTables(container);
  const tidied = tidy(service.turndown(container));
  return tidied ? `${tidied}\n` : '';
};
