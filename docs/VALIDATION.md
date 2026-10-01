# 検証結果（2026-10-01）

ローカルの隔離された検証環境で以下を実行しました。ホスティングへのデプロイは未実施です。

| 検証                       | 結果                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| npm install / lockfile更新 | 成功                                                                                                                          |
| npm run build              | NestJS・React/Viteの本番ビルド成功                                                                                            |
| npm run typecheck          | 成功                                                                                                                          |
| npm run lint               | エラー・警告なし                                                                                                              |
| npm test -- --runInBand    | 8スイート・13テスト成功                                                                                                       |
| npm run test:migration     | 最新の旧スキーマから、ユーザー・投稿を保持した追加migration成功。平文パスワード変換の冪等性確認                               |
| npm run test:integration   | 認証・Cookie/Bearer・権限・Origin・2ユーザー同期・ルーム分離・チャット・通報・管理・退会成功                                  |
| npm run test:browser       | Chromiumの2独立コンテキストで登録→入室→移動→チャット→プロフィール→部屋移動→再訪→ログアウト→再ログイン→モバイル表示→退会が成功 |
| ブラウザセキュリティ       | HTML攻撃文字列は文字として表示。画像DOMは生成されず、ページのJavaScriptエラーなし                                             |
| 開発クライアント           | Vite 5173番起動とエントリー配信成功                                                                                           |
| サーバー                   | 常駐NestJS起動、/healthとAPI、Socket.IO通信成功                                                                               |
| npm audit --omit=dev       | 脆弱性0件（検証時点）                                                                                                         |

標準Playwrightブラウザ配布のダウンロードがこの環境では失敗したため、ローカル検証は`@sparticuz/chromium`のChromium 153を展開し、`PLAYWRIGHT_CHROMIUM_EXECUTABLE`で指定しました。アプリの本番依存には追加していません。CIでは標準Playwright Chromiumをインストールします。

ブラウザテストで見つかったモバイル横はみ出しを修正しました。低性能端末での負荷軽減として描画を30fpsまでに抑えています。NestJSは元の10系から11.2.7以降へ更新し、上記の機能検証を再実施しました。

未検証：Dockerイメージの実ビルド（この環境にDockerなし）、Render上での実デプロイ、外部2端末によるインターネット越しの通信、Safari/iOS/Firefox固有の動作、定員50名での負荷。これらは本番公開前に確認してください。
