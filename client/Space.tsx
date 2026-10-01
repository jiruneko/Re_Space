import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AVATARS,
  ChatMessage,
  ClientEvents,
  Player,
  Reply,
  RoomInfo,
  ServerEvents,
  Snapshot,
} from '../src/shared/world';
import { api, errorText, User } from './api';
import { World } from './World';
import { Profile } from './Profile';
import { Admin } from './Admin';
const roomIcons: Record<string, string> = {
  lobby: '◈',
  classroom: '▤',
  consultation: '☏',
  break: '♧',
};
export function Space({
  user,
  refresh,
  logout,
}: {
  user: User;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]),
    [room, setRoom] = useState<RoomInfo>(),
    [players, setPlayers] = useState<Player[]>([]),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [connection, setConnection] = useState('接続中…'),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [text, setText] = useState(''),
    [scope, setScope] = useState<'room' | 'nearby'>('room'),
    [sending, setSending] = useState(false),
    [profile, setProfile] = useState(false),
    [admin, setAdmin] = useState(false),
    [tab, setTab] = useState<'chat' | 'people'>('chat'),
    [muted, setMuted] = useState<number[]>([]),
    [report, setReport] = useState<Player>(),
    [reason, setReason] = useState(''),
    [rules, setRules] = useState(false);
  const socket = useRef<Socket<ServerEvents, ClientEvents> | undefined>(
      undefined,
    ),
    wanted = useRef('lobby'),
    roomRef = useRef<string | undefined>(undefined),
    joining = useRef(false),
    bottom = useRef<HTMLDivElement>(null);
  const loadRooms = () =>
    api<RoomInfo[]>('/space/rooms')
      .then(setRooms)
      .catch((e) => setError(errorText(e)));
  function join(id: string) {
    const s = socket.current;
    if (!s?.connected || joining.current) return;
    joining.current = true;
    setReady(false);
    setError('');
    s.timeout(10000).emit(
      'room:join',
      id,
      (err: Error | null, result: Reply<Snapshot>) => {
        joining.current = false;
        if (err || !result?.ok) {
          setError(
            err
              ? '入室できませんでした。接続を確認してください'
              : result.ok === false
                ? result.error
                : '処理に失敗しました',
          );
          setReady(Boolean(roomRef.current));
          return;
        }
        wanted.current = id;
        roomRef.current = id;
        setRoom(result.data.room);
        setPlayers(result.data.players);
        setMessages(result.data.messages);
        setReady(true);
        void loadRooms();
      },
    );
  }
  useEffect(() => {
    void loadRooms();
    const s: Socket<ServerEvents, ClientEvents> = io({
      withCredentials: true,
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket.current = s;
    s.on('connect', () => {
      joining.current = false;
      setConnection('オンライン');
      join(wanted.current);
    });
    s.on('disconnect', (reason) => {
      joining.current = false;
      roomRef.current = undefined;
      setReady(false);
      setPlayers([]);
      setConnection(
        reason === 'io server disconnect'
          ? '接続終了'
          : '接続が切れました。再接続中…',
      );
    });
    s.on('connect_error', (e) => {
      setReady(false);
      setConnection('接続できません');
      setError(
        e.message === 'xhr poll error'
          ? 'ネットワーク接続を確認してください'
          : e.message,
      );
    });
    s.on('players', setPlayers);
    s.on('world:frame', ({ roomId, positions }) => {
      if (roomRef.current !== roomId) return;
      const updates = new Map(positions.map((p) => [p.id, p]));
      setPlayers((current) =>
        current.map((p) => ({ ...p, ...updates.get(p.id) })),
      );
    });
    s.on('chat:message', (message) =>
      setMessages((ms) => [...ms, message].slice(-100)),
    );
    s.on('session:ended', (reason) => {
      setError(reason);
      setConnection('接続終了');
    });
    s.connect();
    const timer = setInterval(() => void loadRooms(), 15000);
    return () => {
      clearInterval(timer);
      s.removeAllListeners();
      s.disconnect();
      socket.current = undefined;
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !ready || sending) return;
    setSending(true);
    setError('');
    socket.current
      ?.timeout(8000)
      .emit(
        'chat:send',
        { text: text.trim(), scope },
        (err: Error | null, result: Reply) => {
          setSending(false);
          if (err || !result?.ok)
            setError(
              err
                ? '送信結果を確認できません。履歴を確認してください'
                : result.ok === false
                  ? result.error
                  : '処理に失敗しました',
            );
          else setText('');
        },
      );
  }
  async function sendReport(e: FormEvent) {
    e.preventDefault();
    if (!report) return;
    try {
      await api('/space/reports', 'POST', { targetId: report.id, reason });
      setReport(undefined);
      setReason('');
      setError('通報を受け付けました。管理者が確認します。');
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/">
          Re<span>:</span>Space<span className="brand-dot">●</span>
        </a>
        <span className="header-caption">自分のペースで、つながろう。</span>
        <div className="header-right">
          <span className={`connection ${ready ? 'online' : ''}`}>
            ● {connection}
          </span>
          <button className="profile-button" onClick={() => setProfile(true)}>
            <span
              className="avatar-dot"
              style={{ background: AVATARS[user.profile.avatar] }}
            />
            {user.profile.displayName}
            <span>⌄</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-top">
            <span className="eyebrow">YOUR PLACES</span>
            <h2>スペース</h2>
            <p>今日は、どこで過ごそう？</p>
          </div>
          <nav aria-label="ルーム一覧">
            {rooms.map((r) => (
              <button
                key={r.id}
                className={`room-button ${room?.id === r.id ? 'active' : ''}`}
                disabled={!socket.current?.connected}
                onClick={() => join(r.id)}
              >
                <span className="room-icon">{roomIcons[r.theme] || '◈'}</span>
                <span>
                  {r.name}
                  <small>
                    {r.theme === 'consultation'
                      ? '履歴を保存しない空間'
                      : r.theme === 'classroom'
                        ? '学ぶ・集中する'
                        : r.theme === 'break'
                          ? 'のんびり・雑談'
                          : '集まる・出会う'}
                  </small>
                </span>
                <span className="count">
                  {r.id === room?.id ? players.length : r.count || 0}
                </span>
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span>☘</span>
            <strong>話さなくても、大丈夫。</strong>
            <p>
              ここにいるだけでも、つながりのひとつ。あなたのペースを大切に。
            </p>
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setRules(true)}>
              使い方と安心のために ↗
            </button>
            {user.role === 'ADMIN' && (
              <button onClick={() => setAdmin(true)}>管理画面</button>
            )}
            <button
              onClick={() => void logout().catch((e) => setError(errorText(e)))}
            >
              退出してログアウト
            </button>
            <span>Re:Space · HSIC</span>
          </div>
        </aside>
        <main className="space-main">
          <div className="space-heading">
            <div>
              <span className="eyebrow">A LITTLE SPACE FOR YOU</span>
              <h1>{room?.name || '居場所につないでいます…'}</h1>
              <p>{room?.description || 'まもなくスペースが表示されます。'}</p>
            </div>
            <span className="occupancy">♧ {players.length} 人が滞在中</span>
          </div>
          <div className="world-card">
            {room ? (
              <World
                room={room}
                players={players}
                selfId={user.id}
                connected={ready}
                move={(dx, dy) =>
                  socket.current?.emit('player:move', { dx, dy })
                }
              />
            ) : (
              <div className="loading">スペースを読み込み中…</div>
            )}
            {!ready && (
              <div className="reconnect-overlay">
                <p>{connection}</p>
                <button
                  onClick={() => {
                    if (socket.current?.connected) join(wanted.current);
                    else socket.current?.connect();
                  }}
                >
                  再接続する
                </button>
              </div>
            )}
          </div>
          <div className="space-footer">
            <span>
              ●{' '}
              {scope === 'nearby'
                ? '近距離チャット：周囲220pxの人に届きます'
                : '同じルームの人にチャットが届きます'}
            </span>
            <button className="text-button" onClick={() => setProfile(true)}>
              ✎ プロフィールを編集
            </button>
          </div>
          {error && (
            <div className="notice" role="alert">
              <span>{error}</span>
              <button aria-label="通知を閉じる" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
        </main>
        <aside className="chat-panel">
          <div className="panel-tabs">
            <button
              className={tab === 'chat' ? 'active' : ''}
              onClick={() => setTab('chat')}
            >
              チャット
            </button>
            <button
              className={tab === 'people' ? 'active' : ''}
              onClick={() => setTab('people')}
            >
              参加者 <span>{players.length}</span>
            </button>
          </div>
          {tab === 'chat' ? (
            <>
              <div className="chat-notice">
                ☘ 相手のペースを大切に、心地よい会話を。
              </div>
              <div
                className="messages"
                role="log"
                aria-label="チャット履歴"
                aria-live="polite"
              >
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <span>☏</span>
                    <h3>小さな「こんにちは」から。</h3>
                    <p>
                      挨拶だけでも、好きなことの話でも。
                      <br />
                      気軽に言葉を置いてみましょう。
                    </p>
                  </div>
                )}
                {messages
                  .filter((m) => !muted.includes(m.userId))
                  .map((m) =>
                    m.scope === 'system' ? (
                      <p className="system-message" key={m.id}>
                        {m.text}
                      </p>
                    ) : (
                      <article
                        className={`message ${m.userId === user.id ? 'own' : ''}`}
                        key={m.id}
                      >
                        <div className="message-meta">
                          <strong>{m.displayName}</strong>
                          <time>
                            {new Date(m.createdAt).toLocaleTimeString('ja-JP', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          {m.scope === 'nearby' && <small>近距離</small>}
                        </div>
                        <p>{m.text}</p>
                      </article>
                    ),
                  )}
                <div ref={bottom} />
              </div>
              <form className="chat-form" onSubmit={send}>
                <div className="compose-label">
                  <select
                    aria-label="チャットの範囲"
                    value={scope}
                    onChange={(e) =>
                      setScope(e.target.value as 'room' | 'nearby')
                    }
                  >
                    <option value="room">ルーム全体へ</option>
                    <option value="nearby">近くの人へ</option>
                  </select>
                  <small>{text.length}/500</small>
                </div>
                <textarea
                  aria-label="メッセージ"
                  placeholder="メッセージを入力…"
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="send-row">
                  <span>Enter で送信 · Shift + Enter で改行</span>
                  <button
                    className="primary"
                    disabled={!ready || sending || !text.trim()}
                    type="submit"
                  >
                    送信 ↑
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="people-list">
              {players.map((p) => (
                <div className="person" key={p.id}>
                  <span
                    className="avatar-dot"
                    style={{ background: AVATARS[p.avatar] }}
                  />
                  <div>
                    <strong>
                      {p.displayName}
                      {p.id === user.id ? '（あなた）' : ''}
                    </strong>
                    <p>{p.status || 'ここにいます'}</p>
                    {p.id !== user.id && (
                      <div>
                        <button
                          onClick={() =>
                            setMuted((ms) =>
                              ms.includes(p.id)
                                ? ms.filter((id) => id !== p.id)
                                : [...ms, p.id],
                            )
                          }
                        >
                          {muted.includes(p.id) ? 'ミュート解除' : 'ミュート'}
                        </button>
                        <button onClick={() => setReport(p)}>通報</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      {profile && (
        <Profile
          user={user}
          updated={refresh}
          close={() => setProfile(false)}
          removed={() => {
            socket.current?.disconnect();
            void refresh();
          }}
        />
      )}
      {admin && <Admin close={() => setAdmin(false)} />}
      {report && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="通報"
            onSubmit={sendReport}
          >
            <h2>{report.displayName} さんを通報</h2>
            <p>
              管理者に状況を伝えます。今すぐ会話を非表示にするにはミュートをご利用ください。
            </p>
            <label>
              理由
              <textarea
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="primary">通報する</button>
            <button type="button" onClick={() => setReport(undefined)}>
              キャンセル
            </button>
          </form>
        </div>
      )}
      {rules && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="使い方"
          >
            <button
              className="close"
              onClick={() => setRules(false)}
              aria-label="閉じる"
            >
              ×
            </button>
            <h2>自分も、相手も、大切に。</h2>
            <p>
              マップをクリックして矢印キー・WASDで移動できます。スマートフォンではマップ下の方向ボタンを使えます。
            </p>
            <p>
              会話への参加は自由です。相手への攻撃や、個人情報の投稿をしないでください。不快な言動は参加者一覧からミュート・通報できます。
            </p>
            <p>
              通常のルームチャットは7日間保存し、直近50件を再入室時に表示します。近距離チャットと相談室のチャットは保存しません。相談室も他のユーザーが入れる公開ルームで、個別の秘密相談には使えません。
            </p>
            <p>
              プロフィールは他の参加者に表示されます。メールアドレスは公開しません。退会するとアカウントに紐づくデータが削除されます。通報には相手のユーザー番号が残ります。
            </p>
            <p>
              お困りの際は、参加者一覧からの通報、または案内された運営窓口をご利用ください。本サービスは緊急相談窓口ではありません。
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
