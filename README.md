# Re:Space

ブラウザで集まれる2Dオンライン居場所。元のNestJS / Prisma / SQLiteバックエンドとSNS APIを維持し、React + Viteの画面、Canvas 2Dマップ、Socket.IO同期を追加しています。公開前の依存更新でNestJSは11系へ更新しています。Next.js・Phaserは元リポジトリに存在しないため導入していません。外部画像や他社のマップ素材は使っていません。日本語フォントはOFLライセンスのNoto Sans JPを自己配信します。

## 起動（Node.js 22.12以上）

```bash
npm ci
cp .env.example .env
# .env の JWT_SECRET に openssl rand -hex 32 の出力を設定
npm run db:migrate
npm run db:seed
npm run build
npm run start:prod
```

http://localhost:4000 を開き、登録してください。API・WebSocket・画面を同じポートで提供します。`.env`や実際のDBはコミットしないでください。`db:migrate`は空のSQLiteファイルを必要に応じて作り、migrationを適用します。既存DBは上書きしません。

### 開発時

- ターミナル1：`npm run dev`（NestJS、4000番）
- ターミナル2：`npm run dev:client`（Vite、5173番）
- `.env`の`APP_ORIGIN=http://localhost:5173`に変更してからバックエンドを再起動。ブラウザは http://localhost:5173 を使用。
- ViteがAPIとSocket.IOを4000番へproxyします。本番ビルドを試す際はAPP_ORIGINを4000番へ戻してください。

## 実装内容

- 登録／ログイン／ログアウト／7日セッション／退会（パスワード再確認）
- bcryptによるパスワードハッシュ、HttpOnly Cookie、DBセッション失効。既存クライアント向けに新規発行tokenのBearer認証も維持
- Userから分離したProfile（displayName、6種類のavatar、status）。`User.externalSubject`は将来のHSIC共通IDとの対応用。ID連携そのものは未実装
- 4種の初期ルーム、ルーム別人数・定員、サーバー検証の移動・衝突・境界、カメラ追従、位置補間、タッチ方向ボタン
- 空間内チャット、近距離チャット（220px）、入退室通知、500文字制限、再接続
- 通常ルーム履歴は7日保持・直近50件表示。近距離および相談室チャットはDB保存しない
- プロフィールのライブ更新、参加者一覧、ミュート（現在のブラウザ画面内）、通報
- 管理者のユーザー一覧（最新200件）、強制退出、利用停止／解除、ルーム作成・閉鎖／再開、通報対応。ルーム名・説明・定員等の編集APIも用意
- 入力検証、同一Origin制限、Helmet/CSP、API・Socketイベントのレート制限、匿名Socket拒否、DB/APIエラー表示
- 1アカウントにつき1つのアバター。別タブで接続すると以前のタブを切断

### 操作

マップをクリックしてフォーカス後、矢印キーまたはWASDで移動します。チャット入力中は移動しません。Enterで送信、Shift+Enterで改行。日本語変換中のEnterは送信しません。モバイルは方向ボタンを長押しします。

相談室も**公開ルーム**です。個室予約・秘密相談には利用しないでください。近距離チャットもその時点の近くの人全員へ届きます。通常チャットは再入室者にも表示されます。

## 管理者

1. 通常画面で管理者用アカウントを登録。
2. サーバー環境変数`ADMIN_EMAIL`にそのメールアドレスを設定。
3. `npm run db:admin`を実行し、画面を再読み込みすると管理画面が表示されます。

初期パスワードや全員共通の管理者資格情報はありません。強制退出は対象ユーザーの全セッションを失効させます。利用停止は再ログインも拒否します。管理者自身・他の管理者への停止操作は禁止しています。

## 環境変数

| 変数         | 用途                                                  | 本番例                        |
| ------------ | ----------------------------------------------------- | ----------------------------- |
| DATABASE_URL | Prisma SQLite接続先。相対パスはprismaディレクトリ基準 | `file:/data/respace.db`       |
| JWT_SECRET   | 32文字以上のランダム値。クライアントへ公開しない      | `openssl rand -hex 32`で生成  |
| APP_ORIGIN   | ブラウザの正確なorigin。末尾スラッシュなし            | `https://respace.example.com` |
| PORT         | API・Socket・静的配信の共通ポート                     | `4000`（ホスト指定も可）      |
| NODE_ENV     | 本番ではSecure CookieとHTTPSを必須にする              | `production`                  |
| TRUST_PROXY  | 信頼できるreverse proxyが1段のときのみ1               | `1`                           |
| ADMIN_EMAIL  | db:adminで管理者にする登録済みメール。任意            | 運営者のメールアドレス        |

## DBと既存データ

既存のUser/Post/Comment/Like/Follow/Notificationを維持。追加migration `20261001000000_respace_trial`でProfile、Session、Room、Message、ReportとUserの管理／共通ID用フィールドを追加します。Userテーブルのデータを移し替えず、ALTER TABLEで拡張します。プロフィールは既存nameから初期化します。

**既存環境を更新する場合は先にDBバックアップを取得してください。** 元の過去migrationには非空テーブルへ必須列を追加する履歴があります。古い中間スキーマのDBに一括適用せず、`npx prisma migrate status`で現在位置とバックアップを確認してください。最新の旧スキーマから今回の追加migrationへの移行、および空DBの新規構築を想定しています。

以前の実装はパスワードを平文保存していました。既存DBを継続利用するときはmigration後に以下をオフラインで1回実行してください。

```bash
npm run db:legacy-passwords
npm run db:seed
```

この処理はハッシュ化済みのレコードを変更せず、平文レコードのみbcrypt化します。ログインAPIは平文パスワード保存のままでは認証しません。既存JWTはDBセッションがないので失効し、再ログインが必要です。履歴中の漏えいを取り消す処理ではないため、過去に実データを共有した場合は運営者がパスワード変更を案内してください。

元リポジトリにある`dev.db`・`prisma/dev.db`・生成済みPrismaディレクトリは今回の起動・配信に使用しません。Dockerのコンテキストからも除外します。実データか不明なため勝手に削除していません。

退会はトランザクションで本人の投稿と関連コメント・いいね、フォロー、通知、プロフィール、セッション、チャット、本人の通報を削除します。他者の通報に記録された対象ユーザー番号は運営対応のため残ります。定期バックアップの保持期限は運営者が別途設定してください。

## 検証

```bash
npm run build
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:migration
npm run test:integration
npm run test:resilience
npm run test:transport
npm run test:load
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

統合テストは一時DBと4100番のサーバーを起動し、終了後に自分の一時DBのみ削除します。2つのSocketクライアントによる同期・認証・Origin防御・チャット分離・管理・退会を検証。Playwrightは別の一時DBと4200番を使用し、2つの独立したブラウザコンテキストによる操作を検証します。既存DB・運営データは使いません。

独自のChromiumを使う場合は`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:browser -- --project=chromium`。GitHub Actionsにも同じ検証を定義しています。

## 本番公開

**この構成は単一インスタンス + 永続ディスクが必須です。** Socket接続と在室状態はプロセスメモリ、アカウント等はSQLiteに保存します。再起動時は在室状態だけ消え、クライアントが再入室します。多重インスタンス／オートスケールは対応していません。Vercel Functionsだけではこの常駐サーバーを公開できません。

### Render（設定ファイル同梱、作成・課金は未実行）

1. 変更ブランチをレビューしてマージ。
2. Renderでこのリポジトリの`render.yaml`を使うBlueprintを作成。**有料サービス・ディスクを作成する操作なので料金確認後に実施してください。**
3. `APP_ORIGIN`を割り当てられた`https://...onrender.com`に設定。独自ドメインを使う場合はそのoriginに置き換える。
4. `/data`への永続ディスク、`DATABASE_URL=file:/data/respace.db`、1インスタンスを確認。
5. 起動時にmigrationとseedを実行。`/health`が200になったらブラウザで登録。
6. 管理者を登録し上記の管理者設定を実施。
7. 別ブラウザ・別端末で入室・チャットを確認してから利用者へURLを案内。

HTTPS終端とWebSocket upgradeをサポートする別のコンテナホストでもDockerfileを利用できます。認証Cookieのため本番HTTPSは必須です。SQLiteディスクを外すと再デプロイでデータが失われます。ディスクのDBをバックアップする場合はSQLiteのbackup APIまたは停止中の安全なコピーを使い、実際に復元試験をしてください。

### 公開前の運営設定

- サービス運営者・連絡先・利用規約・プライバシーポリシーの案内を追加。
- 管理者を設定し、通報を確認する担当・頻度を決める。
- DBバックアップ／復元、監視、想定人数での負荷試験。
- 新規登録は現在オープン。まず招待した試用者へURLを案内する運用を推奨。

## 現在の制約

音声・ビデオ、個別DM、メール確認、パスワード再設定、非公開相談室、HSIC SSO、複数サーバー対応は未実装です。定員は最大50/ルームですが性能保証ではありません。PostgreSQLへの変更は将来の別migration計画で扱い、SQLite用migrationをそのままPostgreSQLへ適用しないでください。ユーザー一覧は直近200件の簡易管理です。

通常チャットにはテキストのみを表示し、HTMLはReactでエスケープします。Cookie認証は7日で期限切れになり、自動延長はしません。ログアウト／退会／停止後のAPIは即拒否し、アイドルSocketは最大5秒で切断。各SocketイベントでもDBセッションを再確認します。


## 最終公開検証と運用

本番URL: **未発行（デプロイ未完了）**。ローカル検証と本番検証を混同しないでください。検証の実測値と未確認事項は `docs/validation.md` を参照。

- 初回・再デプロイ: `npm run start:deploy` が `prisma migrate deploy` → `db:seed:production` → サーバー起動の順に実行。migration失敗時は起動しません。`migrate reset` / `db push --force-reset` は本番で使用しません。
- 本番seedは4ルームの不足分と既存ユーザーの不足プロフィールのみ補完し、ユーザー・パスワード・開発データを作りません。既存ルームの名前・定員・閉鎖設定も上書きしません。開発用のテストユーザーは一時DBのテスト内でのみ生成します。
- 管理者昇格をデプロイから分離しました。`ADMIN_EMAIL` が未登録でも通常のデプロイは止まりません。登録後、運営用シェルで `npm run db:admin` を実行してください。
- フロント・API・Socketは同一originの1サービス。`APP_ORIGIN` は正確なHTTPS originのみで、パスや末尾 `/` は不可。CookieはHttpOnly / Secure / SameSite=Lax、Domain未指定です。SecretsはRenderの環境変数にのみ設定し、ログ・Git・`VITE_*` に入れません。
- 初期ロビーの定員は50人。既に作成済みのロビーの定員は管理APIで変更してください。移動入力は約20Hz、位置配信はルーム単位で最大10Hz、プロフィール情報は入退出・更新時に配信。遅い接続には古い移動フレームを溜め込みません。

### 公開URLに対する受け入れテスト

運営者が管理するRe環境でのみ実行してください。実アカウントを2つ登録し、テスト通報を送ります。成功時に両アカウントを退会します。途中失敗時は管理画面で `browser-` から始まるテストメールのアカウントを確認してください。

```bash
TEST_BASE_URL=https://your-service.onrender.com npm run test:browser
```

`TEST_BASE_URL`指定時はローカルサーバーを起動せず、公開先に接続します。管理機能の本番確認には、その環境で管理者を設定した上で、テスト通報の表示・対応済み変更、テストアカウントの停止・解除を確認してください。秘密情報をテスト成果物に含めないよう、公開試験のtraceは共有前に確認してください。

### 障害対応

- 再接続中: ネットワーク復帰を待つか画面の「再接続する」を使用。サーバー再起動後は同じ部屋へ入り直します。
- 接続終了: 同じアカウントの別タブ接続、管理者操作、セッション失効を確認。期限切れはログアウト後に再ログイン。
- 403 / Cookieが保存されない: 実URLとAPP_ORIGIN、HTTPS、proxy設定を確認。CORSを `*` に広げないでください。
- 500 / health失敗: RenderログでDB接続先とディスクマウント、空き容量、migration状態を確認。DBファイルを削除せずバックアップを確保。
- デプロイ失敗: ログのmigration名を確認。既存DBのmigration履歴を手動で書き換えず、バックアップと前バージョンで復旧方針を判断。
- SQLiteは単一ディスク・単一インスタンス専用。ローリングで複数プロセスを並行稼働させず、更新時の短時間の再接続を許容します。

CIは各PRでinstall、build、typecheck、lint、単体・統合・再migration・障害・HTTPS/WSS・50接続負荷・4ブラウザプロジェクトを実行します。CIが未実行または赤の状態で本番検証済みとは判断しないでください。
