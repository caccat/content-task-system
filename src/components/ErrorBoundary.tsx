import { Component, type ReactNode } from 'react';
import { Button, Result, Spin } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

// 自动恢复的最大次数：偶发崩溃自动重挂载，连续失败才展示错误界面，避免死循环
const MAX_AUTO_RETRY = 2;
const AUTO_RETRY_DELAY = 600;

// 渲染错误边界：捕获子树的渲染/commit 错误，避免整页白屏
// 典型场景：浏览器翻译/扩展改写 DOM 后，React 更新时抛 insertBefore NotFoundError
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary] 捕获渲染错误:', error, info);
    // 自动恢复：偶发错误自动重挂载子树，用户几乎无感知
    if (this.state.retryCount < MAX_AUTO_RETRY) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState((s) => ({
          hasError: false,
          error: null,
          retryCount: s.retryCount + 1,
        }));
      }, AUTO_RETRY_DELAY);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 });
  };

  render() {
    const { hasError, error, retryCount } = this.state;

    if (hasError) {
      // 自动恢复中：展示轻量占位，不打断使用
      if (retryCount < MAX_AUTO_RETRY) {
        return (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin tip="正在恢复…">
              <div style={{ minHeight: 120 }} />
            </Spin>
          </div>
        );
      }

      return (
        <Result
          status="warning"
          title="页面局部渲染出错"
          subTitle={
            <span>
              {error?.message || '未知错误'}
              <br />
              若浏览器开启了「网页翻译」或相关扩展，请对本站关闭（会改写页面结构导致异常）。
            </span>
          }
          extra={[
            <Button key="retry" type="primary" onClick={this.handleReset}>
              重试
            </Button>,
            <Button key="reload" onClick={this.handleReload}>
              刷新页面
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}
