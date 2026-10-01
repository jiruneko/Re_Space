import { useEffect, useState } from 'react';
import { RoomInfo } from '../src/shared/world';
import { api, errorText } from './api';
interface Overview {
  users: { id: number; name: string; role: string; banned: boolean }[];
  rooms: RoomInfo[];
  reports: { id: number; userId: number; targetId: number; reason: string }[];
}
export function Admin({ close }: { close: () => void }) {
  const [data, setData] = useState<Overview>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(''),
    [theme, setTheme] = useState('lobby');
  const load = () =>
    api<Overview>('/space/admin')
      .then(setData)
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    void load();
  }, []);
  async function action(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    try {
      await api(path, method, body);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="管理画面"
      >
        <button className="close" onClick={close} aria-label="閉じる">
          ×
        </button>
        <span className="eyebrow">SPACE MANAGEMENT</span>
        <h2>安心できる居場所に。</h2>
        <p className="error" role="alert">
          {error}
        </p>
        {!data ? (
          <p>読み込み中…</p>
        ) : (
          <>
            <h3>ユーザー（最新200件）</h3>
            {data.users.map((u) => (
              <div className="admin-row" key={u.id}>
                <span>
                  {u.name}{' '}
                  <small>
                    #{u.id} {u.banned ? '利用停止中' : ''}
                  </small>
                </span>
                {u.role !== 'ADMIN' && (
                  <span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(`/space/admin/users/${u.id}`, {
                          action: 'kick',
                        })
                      }
                    >
                      退出
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(`/space/admin/users/${u.id}`, {
                          action: u.banned ? 'unban' : 'ban',
                        })
                      }
                    >
                      {u.banned ? '停止解除' : '利用停止'}
                    </button>
                  </span>
                )}
              </div>
            ))}
            <h3>ルーム</h3>
            {data.rooms.map((r) => (
              <div className="admin-row" key={r.id}>
                <span>
                  {r.name} · 定員{r.capacity}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `/space/admin/rooms/${r.id}`,
                      {
                        name: r.name,
                        description: r.description,
                        theme: r.theme,
                        capacity: r.capacity,
                        active: !r.active,
                      },
                      'PATCH',
                    )
                  }
                >
                  {r.active ? '閉鎖する' : '再開する'}
                </button>
              </div>
            ))}
            <form
              className="new-room"
              onSubmit={(e) => {
                e.preventDefault();
                void action('/space/admin/rooms', {
                  name,
                  theme,
                  description: 'みんなで過ごすスペース',
                  capacity: 20,
                  active: true,
                });
              }}
            >
              <input
                aria-label="新しいルーム名"
                placeholder="新しいルーム名"
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select
                aria-label="ルームの種類"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="lobby">ロビー</option>
                <option value="classroom">教室</option>
                <option value="consultation">相談室</option>
                <option value="break">休憩</option>
              </select>
              <button disabled={busy}>追加</button>
            </form>
            <h3>未対応の通報</h3>
            {data.reports.length === 0 && (
              <p className="muted">未対応の通報はありません。</p>
            )}
            {data.reports.map((r) => (
              <div key={r.id} className="report">
                <p>
                  ユーザー #{r.targetId} への通報（送信者 #{r.userId}）
                </p>
                <p>{r.reason}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(`/space/admin/reports/${r.id}/resolve`, {})
                  }
                >
                  対応済みにする
                </button>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
