# 変更履歴

このプロジェクトに関するすべての注目すべき変更はこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づき、
このプロジェクトは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) に準拠しています。

## [Unreleased]

## [1.2.1] - 2026-07-17

### セキュリティ

- `discord.js` を 14.26.5 から 14.27.0 に更新し、`undici` 6.27.0（以前は 6.24.1）にすることで 4 つの Dependabot 勧告を修正: GHSA-35p6-xmwp-9g52（レスポンスキュー Poisoning）、GHSA-vxpw-j846-p89q（WebSocket DoS）、GHSA-p88m-4jfj-68fv（ヘッダーインジェクション）、GHSA-g8m3-5g58-fq7m（Cookie SameSite ダウングレード）

### 変更

- ドキュメントとソースファイルにコードスタイルのフォーマットを適用（Prettier）

## [1.2.0] - 2026-07-17

### 追加

- 新しい `mention_guard` モジュール: モデレーター以外のユーザーからの @everyone/@here/@role メンションを検出し、クリーンなメッセージで減衰する動的エスカレーション乗数（3.0x～5.0x）を適用
- mentionGuard モジュールの 15 の単体テスト（合計テスト数: 125）
- README.ja.md に Mention Guard セクションの日本語翻訳を追加

### 変更

- `/debug` コマンドに Administrator 権限が必要になりました（以前は制限なし）
- Standard プロフィールを 4 モジュールから 5 モジュールに拡張（`mention_guard`、重み: 10）
- パイプラインを拡張: メンションガードチェックを user_profile 監査の後、ベロシティチェックの前に追加
- `/config view` と `/debug` で mention_guard の有効圧力範囲を表示
- README と DOCUMENTATION（英語・日本語）のドキュメントを更新

## [1.1.0] - 2026-07-15

### Added

- サーバーごとの言語設定に対応した本格的な i18n/ロケールシステム（`src/core/locale.js`、`src/locales/`）
- サーバーごとの言語切り替えを可能にする新しい `/language` コマンド
- TTL と LRU 削除を備えたクエリキャッシュ（`src/utils/queryCache.js`）
- ロケールとクエリキャッシュのテストスイート
- README とドキュメントの日本語翻訳（`README.ja.md`、`DOCUMENTATION.ja.md`）
- Prettier 設定（`.prettierrc.json`、`.prettierignore`）
- バージョンバンプスクリプト（`scripts/bump-version.js`）
- `CHANGELOG.md`

### Changed

- すべてのコマンド定義が Discord ネイティブ i18n の `setDescriptionLocalizations()` を使用
- すべての埋め込み、モーダル、返信がハードコードされた文字列ではなく `t(lang, key)` を使用
- すべてのイベント（guildMemberAdd、interactionCreate、messageCreate、modalSubmit）を完全にローカライズ
- テレメトリ埋め込みタイトルがサーバーの設定言語を使用
- テレメトリキュー：サーバーごとのキュー、キャッシュベースのチャンネル検索、チャンク分割によるメッセージフラッシュ
- レイド保護：Map の上限設定（`MAX_RAID_STATE_ENTRIES`）、`Promise.allSettled` による復元、`setClient()` で循環依存を解消
- 正規表現サンドボックス：デッドワーカーを自動置換するワーカープール
- 正規表現ワーカー：`gi` → `i` フラグに変更し単一マッチに
- 圧力エンジン：`MAX_PRESSURE_ENTRIES` 上限、減衰タイマーの改善
- ベロシティバケット：Map の上限設定、遅延リフィル、マルチチャンネル検出
- ハニーポットトラップ：生の `db` ではなく `guildConfig` を受け取るよう変更
- データベース：すべての管理用書き込みパスで `invalidateCache()` を実行
- `index.js`：ノンブロッキング `setImmediate` によるサーバーごとの自動リフレッシュ、ローカライズされたエンキュー、`{ client }` のみをエクスポート
- ESLint：`no-undef: error`、`env: { node: true }`
- ベースイメージを `node:22-slim` から `node:26-slim` にアップグレード

### Fixed

- raidProtection と telemetryQueue の間の循環依存
- プールがデッドワーカーを置換しない問題
- ギルド設定の書き込み後にキャッシュが無効化されない問題
- 正規表現ワーカーの `gi` フラグによる意図しない複数マッチ
- テレメトリフラッシャーが `.cache.get()` ではなく `.fetch()` を使用していた問題
- Docker ビルドの後ではなく前にテストを実行するよう CI パイプラインを修正
- 再現可能なビルドのために `pnpm@11.12.0` を固定

### Removed

- `src/core/logger.js`（使用されていなかった pino ベースのロガー）

## [1.0.0] - 2026-07-14

### Added

- Exia Discord ボットの初回リリース
- テレメトリログによるフラグベースのユーザー管理
- 自動ステージエスカレーションによるレイド保護システム
- サンドボックス化されたワーカープールを使用した正規表現ベースのメッセージフィルタリング
- レート制限と悪用検出のための圧力エンジン
- ロケールシステムによる多言語サポート
- サーバーごとの設定（しきい値、重み、ハニーポット、ログチャンネル）
- マイグレーションシステムとクエリキャッシュを備えた SQLite データベース
- Docker イメージビルドとテストステップを含む CI/CD パイプライン
- 自動依存関係更新のための Dependabot 設定

[Unreleased]: https://github.com/anomalyco/exia/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/anomalyco/exia/releases/tag/v1.2.1
[1.2.0]: https://github.com/anomalyco/exia/releases/tag/v1.2.0
[1.1.0]: https://github.com/anomalyco/exia/releases/tag/v1.1.0
[1.0.0]: https://github.com/anomalyco/exia/releases/tag/v1.0.0
