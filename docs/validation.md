# Re:Space 最終工程の検証記録

検証日: 2026-10-01。既存のNestJS / Prisma SQLiteを維持した単一サーバー構成。

## 公開状態

**本番未デプロイ・公開URL未発行。** 本番DBでのmigration、インターネット越しの公開URL E2E、本番サーバーでの50接続負荷確認は未実施。

GitHub連携のRe_Space権限を確認し、PR #1を作成済み。
https://github.com/jiruneko/Re_Space/pull/1
コミット15522a10fe5c11de50f87f098aa4fec6f1aebbd4のGitHub Actions run 36820011850は全ステップ成功。4ブラウザE2Eは4 passed（1.5分）。
Renderブラウザ操作とStarter＋1GB永続ディスク（月額約US$7.25）の作成はユーザー承認済み。RenderへのGitHubサインインはスマートフォンの2段階認証待ちで、まだサービスを作成していない。

## 実施結果

| 検証 | 結果 |
| --- | --- |
| npm ci / production依存audit | 前工程で成功・production脆弱性0件。今回依存パッケージの変更なし |
| build / typecheck / lint | 成功 |
| 単体 | 8 suites / 13 tests成功 |
| 2ユーザーAPI / Socket統合 | 認証、入力検証、位置同期、チャット、部屋分離、プロフィール、通報、管理、退会まで成功 |
| migration | 空DB・最新旧DBから成功。2回の再migration・seedで既存投稿・プロフィール・カスタム定員・閉鎖状態を保持 |
| 障害 | サーバー停止→再起動→再接続、履歴・セッション保持、無効ルーム、重複ログイン、期限切れ、ログアウト失効を確認 |
| DB障害 | 一時DB内のテーブル欠損を発生させ、APIが内部情報を出さず500を返すこと、サーバーが継続することを確認。実ホストのディスク停止試験は未実施 |
| HTTPS / WSS | 本番モード＋ローカルTLS reverse proxyで2セッション成功。Secure/HttpOnly/SameSite=Lax確認。実証明書・Render外部通信は未確認 |
| Chromium | 2つの独立コンテキストで登録、操作、チャット、プロフィール、ルーム移動、再読み込み、ログアウト・再ログイン、通報、退会、ネットワーク断・復帰成功 |
| モバイル | Chromiumで390×844表示、方向ボタン、横はみ出しなしを確認 |
| Firefox | ローカル環境制約を回避できるGitHub Actions上でE2E成功 |
| WebKit / iPhone 13 | GitHub Actions上で両プロジェクトのE2E成功（実機Safariではなくエンジン・端末エミュレーション） |
| GitHub Actions | PR #1で全ステップ成功。追加修正コミットごとにもCIを再実行 |

ChromiumはChrome同系エンジンの代替検証。WebKitも実機Safariそのものではない。未実行のブラウザを合格扱いしない。

## 負荷試験

一時DBに50アカウント・50セッションを作成し、全Socketは通常の署名・DBセッション認証を経由。公開登録のIP制限を大量fixture生成で踏まないようアカウント準備のみ直接DBへ投入。

初期計測（5秒）では移動のたびに全員のプロフィール付き一覧を配信し、達成11.39 Hz/ユーザー、応答p95 104msだった。修正後は位置・方向のみをルーム単位で10Hzにまとめ、遅い接続には古いフレームをキューしない。各移動のDBセッション検証は維持。

修正直後の15秒試験: 移動15,120件、20.10 Hz/ユーザー、失敗0、移動応答p50 1ms / p95 5ms / p99 10ms、チャット150件 p95 26ms、部屋移動100回、切断・再接続10回。移動フレーム推定ペイロード17.67MiB（全受信クライアント合計・プロトコル/暗号化オーバーヘッドを除く）。メモリ量は測定環境で取得できず未報告。

60秒再測定: 移動60,397件、20.12 Hz/ユーザー、失敗0。移動p95 3ms / p99 7ms、チャット600件 p95 24ms。部屋移動100回・再接続10回成功。詳細は `load-result.json` に保存。同一ホスト内でクライアントを実行した結果であり、Render Starterプランや実インターネット50人の性能保証ではない。

## 主な変更

- `src/space/realtime.service.ts` / `src/shared/world.ts`: 最大10Hz位置フレーム・volatile配信・部屋テーマ参照削減。
- `client/Space.tsx`: フレーム適用・強制切断時に「再接続中」と誤表示しない。
- `client/api.ts` / `client/main.tsx`: ネットワーク失敗の案内・プロフィール再取得エラー時に勝手にログアウトしない。
- `scripts/seed.cjs` / `scripts/promote-admin.cjs`: 初期ロビー50人、管理者昇格を起動seedから分離。新DB migrationは追加していない。
- `src/main.ts`: APP_ORIGINの正確なorigin形式検証。
- `test/load.cjs` / `test/resilience.cjs` / `test/production-transport.cjs`: 負荷・障害・本番TLS設定の再現可能な検証。
- `playwright.config.ts`: Chromium / Firefox / WebKit / iPhone、公開URL向けTEST_BASE_URLを追加。
- `.github/workflows/ci.yml` / `README.md`: CI・本番運用手順更新。

## 公開までの残作業

1. PRの最終コミットのCI結果を確認しマージ。
2. RenderへのGitHubログインの2段階認証を完了し、承認済みBlueprintを適用。
3. 正確なAPP_ORIGINと永続ディスクを確認し、デプロイ・health・管理者設定。
4. 公開URLでE2Eと実ホストの負荷測定。Firefox/WebKit/iPhone相当のCI結果も確認。
5. 運営者・問い合わせ先・利用規約/プライバシー案内、バックアップと復元運用を設定。
