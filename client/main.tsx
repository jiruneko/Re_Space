import { Component, FormEvent, ReactNode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError, errorText, User } from './api';
import { Space } from './Space';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/600.css';
import './style.css';
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>画面を読み直してください</h1>
        <p>予期しないエラーが発生しました。</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<'login' | 'register'>('register'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setUser(await api<User>('/auth/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const result = await api<{ user: User }>(`/auth/${mode}`, 'POST', {
        email: form.get('email'),
        password: form.get('password'),
        ...(mode === 'register' ? { name: form.get('name') } : {}),
      });
      setUser(result.user);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', 'POST', {});
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
    setUser(null);
    setMode('login');
  }
  if (loading)
    return (
      <div className="fatal">
        <span className="brand">Re:Space</span>
        <p>読み込み中…</p>
      </div>
    );
  if (user) return <Space user={user} refresh={refresh} logout={logout} />;
  return (
    <div className="landing">
      <header>
        <a href="/" className="brand">
          Re<span>:</span>Space<span className="brand-dot">●</span>
        </a>
        <span>YOUR PLACE, YOUR PACE.</span>
        <button
          onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
        >
          {mode === 'register' ? 'ログイン' : 'はじめる'} ↗
        </button>
      </header>
      <main className="landing-main">
        <section className="hero">
          <div className="pill">☘ オンラインに、あなたの居場所を。</div>
          <h1>
            同じ場所にいる。
            <br />
            それだけで、
            <br />
            <em>少しつながる。</em>
          </h1>
          <p>
            話したい日も、静かに過ごしたい日も。
            <br />
            Re:Spaceは、自分のペースで人と出会える
            <br />
            小さなオンラインの居場所です。
          </p>
          <div className="hero-scene" aria-hidden="true">
            <span className="scene-label">A LITTLE SPACE FOR YOU</span>
            <div className="scene-rug" />
            <div className="scene-sofa" />
            <div className="scene-table" />
            <span className="scene-plant">♧</span>
            <div className="mini-person one">
              <span>こんにちは！</span>●
            </div>
            <div className="mini-person two">
              <span>のんびりしています</span>●
            </div>
            <div className="mini-person three">●</div>
          </div>
          <div className="hero-features">
            <span>◈ ブラウザで、すぐに</span>
            <span>♧ 自分らしいアバター</span>
            <span>☏ 心地よい距離感</span>
          </div>
        </section>
        <section className="auth-card">
          <span className="eyebrow">WELCOME TO RE:SPACE</span>
          <h2>
            {mode === 'register'
              ? 'あなたの居場所、はじめよう。'
              : 'おかえりなさい。'}
          </h2>
          <p>
            {mode === 'register'
              ? 'アカウントを作って、スペースへ。'
              : '今日はどんなふうに過ごしますか？'}
          </p>
          <div className="auth-tabs">
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              新規登録
            </button>
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              ログイン
            </button>
          </div>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                表示名
                <input
                  name="name"
                  placeholder="スペースで呼ばれたい名前"
                  maxLength={30}
                  required
                  autoComplete="nickname"
                />
              </label>
            )}
            <label>
              メールアドレス
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                maxLength={254}
                required
                autoComplete="email"
              />
            </label>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                placeholder={
                  mode === 'register' ? '10文字以上で設定' : 'パスワードを入力'
                }
                minLength={mode === 'register' ? 10 : 1}
                maxLength={72}
                required
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
              />
            </label>
            {mode === 'register' && (
              <p className="auth-note">
                表示名は他の参加者に公開されます。本名でなくても大丈夫です。
              </p>
            )}
            <p className="error" role="alert">
              {error}
            </p>
            <button className="primary large" disabled={busy}>
              {busy
                ? '接続中…'
                : mode === 'register'
                  ? 'アカウントを作って、入室する →'
                  : 'ログインして、入室する →'}
            </button>
          </form>
          <div className="auth-bottom">
            ☘ 無理に話さなくても大丈夫。
            <br />
            まずは、空間をのぞいてみましょう。
          </div>
          <p className="muted small">
            メール確認・パスワード再設定は現在未対応です。パスワードを安全に保管してください。
          </p>
        </section>
      </main>
      <footer>
        <span>Re:Space — A place to be yourself.</span>
        <span>HSIC · Webuild</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
