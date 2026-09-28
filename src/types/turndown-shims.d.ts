// turndown / turndown-plugin-gfm 官方不提供类型声明，这里补最小可用的声明
declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: string;
    emDelimiter?: '_' | '*';
    strongDelimiter?: '**' | '__';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
    br?: string;
    preformattedCode?: boolean;
    blankReplacement?: (content: string, node: HTMLElement) => string;
  }

  interface TurndownRule {
    filter: string | string[] | ((node: HTMLElement, options?: TurndownOptions) => boolean);
    replacement: (content: string, node: HTMLElement, options?: TurndownOptions) => string;
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(input: string | HTMLElement): string;
    addRule(key: string, rule: TurndownRule): this;
    remove(filter: string | string[] | ((node: HTMLElement) => boolean)): this;
    keep(filter: string | string[] | ((node: HTMLElement) => boolean)): this;
    use(plugin: (service: TurndownService) => void): this;
    escape(input: string): string;
  }

  export default TurndownService;
}

declare module 'turndown-plugin-gfm' {
  // 插件签名：接收 turndown 实例并挂载规则
  type TurndownPlugin = (service: unknown) => void;
  export const gfm: TurndownPlugin;
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
  export const highlightedCodeBlock: TurndownPlugin;
}
