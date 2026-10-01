import { FormEvent, useState } from 'react';
import { AVATARS, Avatar } from '../src/shared/world';
import { api, errorText, User } from './api';
export function Profile({
  user,
  close,
  updated,
  removed,
}: {
  user: User;
  close: () => void;
  updated: () => Promise<void>;
  removed: () => void;
}) {
  const [name, setName] = useState(user.profile.displayName),
    [status, setStatus] = useState(user.profile.status),
    [avatar, setAvatar] = useState<Avatar>(user.profile.avatar),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [password, setPassword] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/space/profile', 'PATCH', {
        displayName: name,
        status,
        avatar,
      });
      await updated();
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/account', 'DELETE', { password });
      removed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="プロフィール"
      >
        <button className="close" onClick={close} aria-label="閉じる">
          ×
        </button>
        <span className="eyebrow">MY PROFILE</span>
        <h2>あなたらしく、過ごそう。</h2>
        <form onSubmit={save}>
          <label>
            表示名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              required
              autoFocus
            />
          </label>
          <label>
            一言コメント
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              maxLength={100}
              placeholder="今日はのんびりしています"
            />
          </label>
          <fieldset>
            <legend>アバターの色</legend>
            <div className="avatar-options">
              {Object.entries(AVATARS).map(([key, color]) => (
                <button
                  type="button"
                  key={key}
                  className={avatar === key ? 'selected' : ''}
                  onClick={() => setAvatar(key as Avatar)}
                  aria-label={key}
                  aria-pressed={avatar === key}
                >
                  <span style={{ background: color }}>●</span>
                </button>
              ))}
            </div>
          </fieldset>
          <p className="muted">{user.email}</p>
          <button className="primary" disabled={busy}>
            保存する
          </button>
        </form>
        <p role="alert" className="error">
          {error}
        </p>
        <hr />
        <button
          className="text-button danger"
          onClick={() => setDeleting(!deleting)}
        >
          アカウントを退会する
        </button>
        {deleting && (
          <form onSubmit={remove}>
            <p>
              プロフィール・チャット・投稿などを削除します。この操作は取り消せません。
            </p>
            <label>
              確認のためパスワードを入力
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="danger" disabled={busy}>
              退会してデータを削除する
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
