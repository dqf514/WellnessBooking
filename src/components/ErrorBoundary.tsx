import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; title?: string }
interface State { error: Error | null }

/**
 * 顶层错误边界：任何渲染异常都不会再让整个应用白屏。
 * 会员端与后台共用，提示文案保持中英双语。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("界面渲染失败", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <div className="app-error-boundary" role="alert">
      <h1>{this.props.title ?? "页面出错了"}</h1>
      <p>系统遇到意外错误，已停止当前页面渲染。刷新后可以继续使用；如果是反复出现的问题，请联系管理员并提供下方错误信息。</p>
      <pre>{error.message}</pre>
      <div className="app-error-actions">
        <button className="button button-primary" type="button" onClick={() => window.location.reload()}>刷新页面</button>
        <button className="button button-outline" type="button" onClick={() => { this.setState({ error: null }); }}>重试</button>
      </div>
    </div>;
  }
}
