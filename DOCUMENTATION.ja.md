# EXIA — プロジェクト完全ドキュメント

**バージョン:** 1.1.0  
**スタック:** Node.js 26 + Discord.js v14 + better-sqlite3 (SQLite, WAL モード)  
**パッケージマネージャー:** pnpm 11.12 (ESM のみ)  
**エントリーポイント:** `src/index.js`

---

## 目次

1. [プロジェクト構成](#1-プロジェクト構成)
2. [環境とビルドツールチェーン](#2-環境とビルドツールチェーン)
3. [コアエンジン](#3-コアエンジン)
   - 3.1 データベース (`src/core/database.js`)
   - 3.2 プレッシャーエンジン (`src/core/pressureEngine.js`)
   - 3.3 ロガー (`src/core/logger.js`)
   - 3.4 設定 (`src/config/config.js`)
4. [イベント](#4-イベント)
   - 4.1 メッセージ作成 (`src/events/messageCreate.js`)
   - 4.2 インタラクション作成 (`src/events/interactionCreate.js`)
   - 4.3 ギルドメンバー追加 (`src/events/guildMemberAdd.js`)
   - 4.4 モーダル送信 (`src/events/modalSubmit.js`)
5. [モジュール](#5-モジュール)
   - 5.1 ベロシティバケット (`src/modules/velocityBucket.js`)
   - 5.2 正規表現サンドボックス (`src/modules/regexSandbox.js` + `regexWorker.js`)
   - 5.3 ハニーポットトラップ (`src/modules/honeypotTrap.js`)
   - 5.4 ユーザープロフィール (`src/modules/userProfile.js`)
   - 5.5 レイドプロテクション (`src/modules/raidProtection.js`)
6. [コマンド](#6-コマンド)
   - 6.1 設定 (`src/commands/configuration.js`)
   - 6.2 アピール (`src/commands/appeals.js`)
   - 6.3 プロフィール (`src/commands/profiles.js`)
   - 6.4 レイド (`src/commands/raid.js`)
   - 6.5 デバッグ (`src/commands/debug.js`)
7. [ユーティリティ](#7-ユーティリティ)
   - 7.1 CLOG (`src/utils/clog.js`)
   - 7.2 テレメトリキュー (`src/utils/telemetryQueue.js`)
8. [通信フロー](#8-通信フロー)
9. [アプリケーションの実行](#9-アプリケーションの実行)

---

## 1. プロジェクト構成

```
EXIA/
├── .github/
│   ├── workflows/
│   │   └── docker-image.yml          # GitHub Actions: Docker ビルド + ghcr.io へのプッシュ
│   └── dependabot.yml                # 毎週の npm + Docker 依存関係更新
├── data/                             # SQLite データベースディレクトリ (gitignored)
├── src/
│   ├── index.js                      # エントリーポイント: クライアント初期化、コマンド登録、自動更新
│   ├── commands/
│   │   ├── appeals.js                # /actions コマンドビルダー (appeal, rejoin, ban, refresh)
│   │   ├── configuration.js          # /config コマンドビルダー (modules, thresholds, regex, など)
│   │   ├── debug.js                  # /debug コマンドビルダー
│   │   ├── profiles.js               # /profiles コマンドビルダー (list, create, apply, など)
│   │   └── raid.js                   # /raid コマンドビルダー (stage, status)
│   ├── config/
│   │   └── config.js                 # dotenv-flow ローダー、環境変数バリデーション、エクスポート
│   ├── core/
│   │   ├── database.js               # SQLite 初期化、7 テーブル、マイグレーション、Standard プロフィール
│   │   ├── logger.js                 # Pino 構造化ロガー (ファイル記述子 1)
│   │   ├── pressureEngine.js         # インメモリプレッシャースコア、減衰、mutex、fast-track
│   │   └── pressureEngine.test.js    # プレッシャーエンジンの Vitest スイート
│   ├── events/
│   │   ├── guildMemberAdd.js         # 参加時 user_profile 監査 + テレメトリエンキュー
│   │   ├── interactionCreate.js      # すべてのスラッシュコマンドルーティング + オートコンプリート + デバッグ
│   │   ├── messageCreate.js          # 完全なメッセージパイプライン: モジュール、乗数、制裁
│   │   └── modalSubmit.js            # 正規表現作成/編集モーダル処理
│   ├── modules/
│   │   ├── honeypotTrap.js           # 制限チャンネルメッセージに対する fast-track 禁止
│   │   ├── honeypotTrap.test.js      # ハニーポットの Vitest スイート
│   │   ├── raidProtection.js         # 3 段階レイドエスカレーション、権限バックアップ/復元
│   │   ├── regexSandbox.js           # ワーカースレッドによるタイムアウト付き正規表現評価
│   │   ├── regexSandbox.test.js      # 正規表現サンドボックスの Vitest スイート
│   │   ├── regexWorker.js            # ワーカースレッド: {pattern, content} を受信し {matched} を返す
│   │   ├── userProfile.js            # アカウント経過日数/アバター監査 → {multiplier, reasons}
│   │   ├── userProfile.test.js       # ユーザープロフィールの Vitest スイート
│   │   ├── velocityBucket.js         # トークンバケットレート制限 + マルチチャンネル検出
│   │   └── velocityBucket.test.js    # ベロシティバケットの Vitest スイート
│   └── utils/
│       ├── clog.js                   # タイムスタンプ付きカラーコンソールログユーティリティ
│       ├── telemetryQueue.js         # バッチ処理された埋め込みログキュー + フラッシャー
│       └── telemetryQueue.test.js    # テレメトリキューの Vitest スイート
├── .dockerignore                     # Docker ビルド除外パターン
├── .env.example                      # 必要な環境変数テンプレート
├── .gitignore                        # Git 除外パターン
├── Dockerfile                        # マルチステージ Docker ビルド (build → final slim)
├── DOCUMENTATION.md                  # このファイル
├── README.md                         # ユーザー向け導入およびデプロイガイド
├── docker-compose.yml                # 名前付きボリュームを使用したシングルサービス構成
├── entrypoint.sh                     # コンテナエントリーポイント: /app/data を作成、CMD を実行
├── eslint.config.js                  # ESLint フラット設定
├── package.json                      # プロジェクトマニフェスト、スクリプト、依存関係
├── pnpm-lock.yaml                    # ロックファイル
└── pnpm-workspace.yaml               # Pnpm ワークスペース設定 (単一プロジェクト)
```

---

## 2. 環境とビルドツールチェーン

### ランタイム

- **Node.js:** 26 (LTS)
- **パッケージマネージャー:** pnpm 11.12 (`corepack` 経由)
- **モジュールシステム:** ESM (`package.json` の `"type": "module"`)

### 依存関係

| パッケージ       | バージョン | 目的                                                      |
| ---------------- | ---------- | --------------------------------------------------------- |
| `discord.js`     | ^14.26.5   | Discord API クライアント + インタラクションフレームワーク |
| `better-sqlite3` | ^12.11.1   | 同期型 SQLite3 バインディング (WAL モード)                |
| `dotenv-flow`    | ^4.1.0     | 環境固有のオーバーライド対応 `.env` 読み込み              |
| `pino`           | ^10.3.1    | 構造化 JSON ロガー (セカンダリロガーとして使用)           |

### 開発依存関係

| パッケージ        | 目的                        |
| ----------------- | --------------------------- |
| `eslint` ^10.7.0  | リンティング (フラット設定) |
| `prettier` ^3.9.5 | コードフォーマット          |
| `vitest` ^4.1.10  | テストランナー              |

### スクリプト

| コマンド              | 説明                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `pnpm start`          | `node src/index.js` — 本番起動                                   |
| `pnpm dev`            | `node --watch src/index.js` — ホットリロード開発                 |
| `pnpm debug`          | `node --watch src/index.js --debug` — --debug フラグ付き開発     |
| `pnpm lint`           | `prettier --check . && eslint .` — フォーマットチェック + リント |
| `pnpm prettier-write` | `prettier --write .` — 自動フォーマット                          |
| `pnpm test`           | `vitest` — テストスイート実行                                    |
| `pnpm test:watch`     | `vitest --watch` — ウォッチモード                                |

### CI/CD (GitHub Actions)

ワークフロー: `.github/workflows/docker-image.yml`

- **トリガー:** `main` ブランチへのプッシュまたは `main` への PR
- **ビルド + プッシュ** (単一ジョブ): リポジトリのチェックアウト、Docker Buildx のセットアップ、GHCR へのログイン、`docker/metadata-action` によるメタデータ抽出、イメージのビルドと `ghcr.io/surrealarts/exia:latest` へのプッシュ
- キャッシュ: レイヤー用の GitHub Actions キャッシュ (type=gha)

### Dependabot

`.github/dependabot.yml` が毎週月曜 09:00 UTC に以下を更新:

- **npm** エコシステム (ルートディレクトリ) — 本番依存関係と開発依存関係をグループ化、マイナー/パッチのみ
- **docker** エコシステム (ルートディレクトリ)

---

## 3. コアエンジン

### 3.1 データベース (`src/core/database.js`)

**better-sqlite3** 接続を **WAL モード**、外部キー有効で初期化します。データベースファイルは `data/exia.db` です。

#### 初期化フロー

1. `initDatabase()` が `src/index.js` から起動時に呼び出される
2. `data/` ディレクトリの存在を確認 (再帰的 `mkdirSync`)
3. `data/exia.db` でデータベースを開く
4. `PRAGMA journal_mode = WAL` と `PRAGMA foreign_keys = ON` を設定
5. `createTables()` を呼び出す — 存在しない場合は 7 テーブルを作成
6. `runMigrations()` を呼び出す — 増分スキーママイグレーションを適用

#### テーブル

| テーブル               | 主キー                                                                    | 説明                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **GuildConfiguration** | `guild_id TEXT`                                                           | ギルドごとの設定: log_channel_id、appeal_link、rejoin_link、honeypot_channel_id、active_profile、タイムスタンプ |
| **ModuleWeights**      | `(guild_id, module_name)`                                                 | モジュールのトグル: weight (INT)、is_critical (BOOL)、is_enabled (BOOL)                                         |
| **ThresholdActions**   | `(guild_id, pressure_tier)`                                               | プレッシャー → アクションのマッピング: action (TEXT)、message_delete_seconds (INT)、pressure (INT)              |
| **RegexRules**         | `(guild_id, rule_identifier)`                                             | カスタム正規表現パターン: pattern (TEXT)、threat_weight (INT)、is_critical (BOOL)                               |
| **ConfigProfiles**     | `(guild_id, profile_name)`                                                | 名前付き設定スナップショット: profile_data (JSON TEXT)、is_locked (BOOL)                                        |
| **RaidState**          | `guild_id TEXT`                                                           | アクティブなレイドステージ、権限バックアップ JSON ブロブ、started_at                                            |
| **Indexes**            | `idx_module_weights_guild`、`idx_threshold_tier`、`idx_regex_rules_guild` | パフォーマンスインデックス                                                                                      |

#### マイグレーション (`runMigrations()`)

起動ごとに実行されます。変更前に `PRAGMA table_info` でカラムの存在を確認します:

- **v1:** `GuildConfiguration` に `active_profile` カラムを追加 (デフォルト `'Standard'`)
- **v2:** `ThresholdActions` に `pressure` カラムを追加 (デフォルト `25`)
- **v3:** 既存の `ConfigProfiles` を `profile_name = 'Standard'` でマイグレーション:
  - `modules[].name` → `module_name`、`modules[].critical` → `is_critical`、`modules[].enabled` → `is_enabled` に正規化
  - `thresholds[].tier` → `pressure_tier`、`thresholds[].deleteSec` → `message_delete_seconds` に正規化
  - 存在しない場合は "Anti-invites" 正規表現ルールを追加
  - レガシー `guildConfig` キーを削除

#### Standard プロフィール

`ensureStandardProfile(guildId)` — ギルドに存在しない場合、ロックされた Standard プロフィールを作成:

- **4 モジュール:** user_profile (15)、velocity (10)、honeypot (0, critical)、regex (10)
- **4 しきい値:** T1 warn 25p、T2 mute 50p、T3 kick 75p、T4 ban 100p
- **1 正規表現ルール:** Anti-invites — Discord 招待 URL にマッチ、重み 50
- プロフィールはロック済み (`is_locked = 1`) — 削除不可

`applyStandardProfile(guildId)` — Standard プロフィールデータをアクティブな設定テーブル (GuildConfiguration、ModuleWeights、ThresholdActions、RegexRules) に書き込みます。ギルド設定が存在しない場合、最初のギルドメッセージ時に呼び出されます。トランザクション内で実行されます。

#### ヘルパー

`getDatabase()` — シングルトン db インスタンスを返します。先に `initDatabase()` が呼び出されていない場合はエラーをスローします。

### 3.2 プレッシャーエンジン (`src/core/pressureEngine.js`)

ギルド/ユーザーごとに分離されたインメモリプレッシャー追跡。スコアのデータベース書き込みはなし — パフォーマンスのために完全にインメモリ。

#### 主要定数

| 定数                         | 値                    | 説明                                         |
| ---------------------------- | --------------------- | -------------------------------------------- |
| `PRESSURE_DECAY_INTERVAL_MS` | 60,000 (60 秒)        | 減衰サイクル間隔                             |
| `PRESSURE_DECAY_AMOUNT`      | 5                     | サイクルごとに除去されるプレッシャーポイント |
| `FAST_TRACK_PRESSURE`        | 9999                  | クリティカルモジュールの即時最大プレッシャー |
| `MAX_PRESSURE`               | 9999                  | 絶対上限                                     |
| `DEFAULT_THRESHOLDS`         | 4 段階 (25/50/75/100) | DB しきい値がない場合のフォールバック        |

#### データ構造

```js
// pressureScores: Map<"guildId:userId", { pressure: number, lastUpdated: number }>
const pressureScores = new Map();

// processingMutex: Set<userId> — 同じユーザーへの同時制裁を防ぐ
const processingMutex = new Set();
```

#### `applyPressure(guildId, userId, weight, isCritical, thresholds)`

1. **Fast-track:** `isCritical === true` の場合、プレッシャーを 9999 に設定し、`{ action: "ban", tier: 4 }` を返す
2. **Mutex チェック:** ユーザーが現在制裁中の場合はプレッシャーは蓄積されるが、`action` と `tier` は `null` として返される (再帰的制裁なし)
3. **通常フロー:** 既存エントリに重みを追加するか、新規作成する。MAX_PRESSURE で制限。
4. **しきい値評価:** `getHighestThreshold(totalPressure, thresholds)` を呼び出す — しきい値を順に反復処理し、`pressure >= threshold.pressure` を満たす最高段階を返す
5. `{ totalPressure, action, tier }` を返す — しきい値未満の場合は action は null

#### 減衰システム

`startDecayTimer()` — 60 秒間隔:

1. すべてのプレッシャースコアを反復処理
2. 各エントリについて、lastUpdate からの経過時間を計算
3. `(経過時間 / 60秒) * 5` の減衰を適用
4. 0 に達したエントリを削除
5. 間隔はアンリファレンス (プロセスを生かし続けない)

#### Mutex

| 関数                   | 説明                                                         |
| ---------------------- | ------------------------------------------------------------ |
| `acquireMutex(userId)` | 取得できた場合は true、既に保持されている場合は false を返す |
| `releaseMutex(userId)` | mutex を解放                                                 |
| `isMutexed(userId)`    | 取得せずに確認                                               |

#### クエリヘルパー

| 関数                                    | 説明                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `getThresholdAction(db, guildId, tier)` | DB のしきい値アクションを段階で検索、デフォルトにフォールバック    |
| `getPressure(guildId, userId)`          | 現在のプレッシャーを返す (または 0)                                |
| `getAllPressureScores()`                | デバッグ用に `[{ guildId, userId, pressure, lastUpdated }]` を返す |
| `resetPressureState()`                  | すべての状態をクリア、減衰タイマーを停止 (テストで使用)            |

### 3.3 ロガー (`src/core/logger.js`)

Pino 構造化 JSON ロガー。stdout (ファイル記述子 1) に出力。ログレベルは `LOG_LEVEL` 環境変数で設定可能 (デフォルト `"info"`)。ISO タイムスタンプ形式を使用。

プライマリログユーティリティは `clog()` (§7.1 参照)。Pino はセカンダリ構造化ロガーとして利用可能。

### 3.4 設定 (`src/config/config.js`)

プロジェクトルートから `dotenv-flow` 経由で `.env` を読み込む。エクスポート:

| エクスポート  | ソース          | 説明                                                    |
| ------------- | --------------- | ------------------------------------------------------- |
| `clientid`    | `CLIENT_ID`     | Discord アプリケーションクライアント ID                 |
| `token`       | `TOKEN`         | Discord ボットトークン                                  |
| `version`     | `VERSION`       | ボットバージョン文字列                                  |
| `logWithTime` | `LOG_WITH_TIME` | タイムスタンプ付きログのブール値 (デフォルト true)      |
| `logTimezone` | `LOG_TIMEZONE`  | ログタイムスタンプの IANA タイムゾーン (デフォルト UTC) |

`validateConfig()` はインポート時に実行 — `CLIENT_ID` または `TOKEN` がない場合はコード 1 で終了、`VERSION` がない場合は警告。

---

## 4. イベント

### 4.1 メッセージ作成 (`src/events/messageCreate.js`)

メインのメッセージ処理パイプライン。すべてのギルドメッセージで発火 (ボットメッセージ、DM を除く)。

#### パイプラインフロー

```
messageCreate
  ↓
1. データベースブートストラップ (ギルド設定がない場合は applyStandardProfile)
  ↓
2. ハニーポットチェック → トリガーされた場合は fast-track
  ↓
3. user_profile 監査 → 乗数計算
  ↓
4. ベロシティチェック (fast-track でない場合) → トークン消費、マルチチャンネル検出
  ↓
5. 正規表現評価 (fast-track またはステッカーのみでない場合) → ルールごとにワーカースレッド
  ↓
6. プロフィール理由収集 → flagReasons に追加
  ↓
7. いずれかのモジュールがアクションをトリガーした場合、制裁実行
  ↓
8. すべてのフラグ理由に対してテレメトリエンキュー
```

#### **1. ブートストラップ**

`GuildConfiguration` をギルド ID でクエリ。行が存在しない場合、`applyStandardProfile(guildId)` を呼び出し、Standard プロフィールをアクティブテーブルに書き込む。その後、無効化されたモジュールを除外したモジュール重みマップを読み込む。

#### **2. ハニーポットチェック**

`checkHoneypot(message, db)` (§5.3 参照) を呼び出す。トリガーされ、ホワイトリストにない場合、`applyPressure(..., isCritical=true)` を呼び出して fast-track で ban する。理由: `"制限されたチャンネルにメッセージを送信しました"` を記録。

#### **3. ユーザープロフィール監査**

`auditProfile(message.member)` (§5.4 参照) を呼び出す。user_profile モジュールが有効な場合、返された乗数がベロシティと正規表現の重みに適用される。無効の場合、乗数は 1.0。

#### **4. ベロシティチェック**

`consumeToken(guildId, userId, channelId)` (§5.1 参照) を呼び出す。超過した場合:

- マルチチャンネル: プレッシャー = 30 (モジュール重みに依存しない)
- トークン枯渇: プレッシャー = モジュール重み (モジュールがない場合は 5)
- 両ケース: 重みが乗数で乗算され、その後 `applyPressure` が呼び出される

#### **5. 正規表現評価**

ギルドのすべての DB 正規表現ルールを反復処理。各ルールについて、ワーカースレッド経由で `evaluateRegex(pattern, content)` (§5.2 参照) を呼び出す。マッチした場合:

- 重み = `rule.threat_weight * multiplier`
- その重みで `applyPressure` を呼び出す
- 最初のマッチで break

#### **6. プロフィール理由**

すべてのプロフィール理由 (例: "アカウント作成から日が浅い"、"アバター未設定") が flagReasons に追加される。

#### **7. 制裁実行** (`executeSanction`)

`highestAction.action` が null でない場合に呼び出される:

1. `member.moderatable` をチェック — false の場合は中断 (ロール階層がアクションを妨げる)
2. しきい値段階の `message_delete_seconds` を ThresholdActions から検索
3. Mutex を取得 — 保持中の場合はスキップ (別の制裁が進行中)
4. **トリガーとなったメッセージを削除**
5. アクション前に理由テキストとともに DM をユーザーに送信:
   - **warn:** 警告テキストを DM、タイマー付き通知をチャンネルに送信
   - **mute:** 理由 + 10 分間の期間を DM、10 分間のタイムアウトを適用、タイマー付き通知を送信
   - **kick:** 理由 + 再参加リンクを DM、メンバーをキック
   - **ban:** 理由 + アピール連絡先を DM、`deleteMessageSeconds` (0〜604800 に制限) でメンバーを BAN
6. アクションテレメトリをエンキュー
7. `finally` ブロックで mutex を解放

#### `sendTimedNotice(message, text, deleteSeconds)`

N 秒後に自動削除される通知をチャンネルに送信する。

#### `safeExecute(fn)`

Discord API 呼び出しを try/catch でラップ — 失敗時は null を返す (API エラーによるクラッシュを防止)。

### 4.2 インタラクション作成 (`src/events/interactionCreate.js`)

すべてのスラッシュコマンド、オートコンプリートインタラクション、デバッグハンドラーをルーティングする。

#### ルーティングテーブル

| インタラクション   | ハンドラー              |
| ------------------ | ----------------------- |
| オートコンプリート | `handleAutocomplete`    |
| `/config *`        | `handleConfigCommand`   |
| `/actions *`       | `handleActionsCommand`  |
| `/profiles *`      | `handleProfilesCommand` |
| `/raid *`          | `handleRaidCommand`     |
| `/debug`           | `handleDebugCommand`    |

#### オートコンプリート (`handleAutocomplete`)

- **profiles (apply/remove):** ギルド ID と部分名一致で `ConfigProfiles` をクエリ
- **config regex (edit/delete):** ギルド ID と部分識別子一致で `RegexRules` をクエリ

#### 設定コマンド (`handleConfigCommand`)

完全なサブコマンドルーティング (コマンドビルダーは §6.1 参照):

| サブコマンド        | 説明                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `modules toggle`    | モジュールを有効/無効化 (ModuleWeights に upsert)                                           |
| `modules weight`    | モジュール重みを設定 (upsert)                                                               |
| `modules critical`  | クリティカルフラグをトグル                                                                  |
| `thresholds assign` | プレッシャー段階 → アクションマッピングを設定                                               |
| `regex create`      | 新規ルール作成用モーダルを開く                                                              |
| `regex list`        | すべてのルールをプレーンテキストで一覧表示                                                  |
| `regex edit`        | ルールデータが事前入力されたモーダルを開く                                                  |
| `regex delete`      | 識別子でルールを削除                                                                        |
| `honeypot set`      | ハニーポットチャンネルを設定                                                                |
| `logchannel set`    | テレメトリログチャンネルを設定                                                              |
| `view`              | 完全埋め込み: 一般設定、モジュール状態、しきい値、正規表現、プレッシャー → アクションマップ |

`/config view` の埋め込み:

- プロフィール名、ログチャンネル、アピール/再参加リンク、ハニーポットチャンネルを表示
- モジュールフィールド: モジュールごとに 3 列 (絵文字+名前、重み、クリティカル)
  - `regex` は重みをルール重みの最小〜最大範囲で表示
  - `user_profile` は値を "乗数"、段階の内訳として表示
- 段階、プレッシャー、アクション、削除秒数のしきい値テーブル
- 正規表現ルール一覧 (パターンは 50 文字に切り捨て)
- 各段階の範囲を示すプレッシャー → アクションマップ

#### アクションコマンド (`handleActionsCommand`)

| サブコマンド | 説明                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `appeal`     | アピール連絡先情報を設定 (BAN の DM に表示)                                                    |
| `rejoin`     | 再参加招待リンクを設定 (キックの DM に表示)                                                    |
| `ban`        | オプションのメッセージ削除付き手動 BAN (権限チェック: BanMembers)                              |
| `refresh`    | キャッシュされたすべてのギルドメンバーを `auditProfile` でスキャン、フラグ付き結果をエンキュー |

`refresh` ハンドラーは返信を遅延 (時間がかかる可能性あり)、`interaction.guild.members.cache` を反復処理、ボット以外の各メンバーで `auditProfile` を呼び出し、理由があるもののフラグテレメトリエントリをエンキュー。

#### プロフィールコマンド (`handleProfilesCommand`)

| サブコマンド | 説明                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `list`       | すべてのプロフィールを一覧表示する埋め込み、アクティブには 📌、ロックには 🔒 |
| `current`    | プレーンテキスト: アクティブなプロフィール名                                 |
| `create`     | 現在の設定を新しいプロフィールにスナップショット                             |
| `apply`      | 保存されたプロフィールを適用 (Standard は `applyStandardProfile` を使用)     |
| `export`     | 現在の設定スナップショットを Base64 エンコード                               |
| `import`     | エンコードされた設定をデコードおよびプレビュー                               |
| `remove`     | プロフィールを削除 (Standard のようなロック付きプロフィールは削除不可)       |

#### レイドコマンド (`handleRaidCommand`)

| サブコマンド | 説明                                            |
| ------------ | ----------------------------------------------- |
| `stage`      | `setRaidStage` 経由でレイドステージ 0〜3 を設定 |
| `status`     | 現在のレイドステージを表示                      |

#### デバッグコマンド (`handleDebugCommand`)

完全なシステム状態埋め込み:

- プロフィール、レイドステージ、メンバー数、キュー長、稼働時間
- モジュールテーブル: 名前、重み/クリティカル/有効 (regex は重み範囲、user_profile は段階を表示)
- しきい値: 段階 → プレッシャー/アクション/削除秒数
- 正規表現ルール: 識別子、重み、クリティカル
- アクティブなプレッシャースコア: ユーザー言及、プレッシャー、更新からの経過秒数

### 4.3 ギルドメンバー追加 (`src/events/guildMemberAdd.js`)

新しいメンバーがギルドに参加したときに発火:

1. ボットユーザーをスキップ
2. `user_profile` モジュールがギルドで有効かどうかをチェック
3. 有効な場合、`auditProfile(member)` を呼び出す
4. プロフィールに理由がある場合 (若いアカウント、アバターなし)、フラグテレメトリエントリをエンキュー

### 4.4 モーダル送信 (`src/events/modalSubmit.js`)

正規表現モーダル送信を処理する。

#### 作成モーダル (`customId: "regex_create_modal"`)

フィールド: `rule_identifier` (短文)、`pattern` (段落)、`threat_weight` (短文、オプション)

1. 識別子とパターンの両方が存在することを検証
2. `new RegExp(pattern)` でパターンをテスト — 無効な正規表現は拒否
3. RegexRules に upsert (競合時は挿入または更新)

#### 編集モーダル (`customId: "regex_edit_modal_<identifier>"`)

フィールド: `pattern` (段落、事前入力済み)、`threat_weight` (短文、事前入力済み)、`is_critical` (短文: "yes"/"no"、事前入力済み)

1. customId のサフィックスから識別子を抽出
2. パターンが存在し、有効な正規表現であることを検証
3. 既存のルールを更新 (pattern、threat_weight、is_critical)

---

## 5. モジュール

### 5.1 ベロシティバケット (`src/modules/velocityBucket.js`)

トークンバケットレート制限。各ユーザー (ギルドごと) がトークンバケットを持つ。トークンは 1/秒で補充され、容量は 20。

#### 定数

| 定数                         | 値    | 説明                                         |
| ---------------------------- | ----- | -------------------------------------------- |
| `DEFAULT_BUCKET_CAPACITY`    | 20    | バケットあたりの最大トークン                 |
| `DEFAULT_REFILL_RATE`        | 1     | 補充サイクルあたりに追加されるトークン       |
| `DEFAULT_REFILL_INTERVAL_MS` | 1000  | 補充サイクル間隔                             |
| `TOKEN_COST_PER_ACTION`      | 1     | メッセージあたり消費されるトークン           |
| `EXCEED_PRESSURE`            | 5     | バケット空時の適用プレッシャー               |
| `MULTI_CHANNEL_PRESSURE`     | 30    | マルチチャンネル高速連射のプレッシャー       |
| `MULTI_CHANNEL_WINDOW_MS`    | 10000 | マルチチャンネル検出のルックバックウィンドウ |
| `MULTI_CHANNEL_THRESHOLD`    | 3     | トリガーするウィンドウ内のチャンネル数       |

#### データ構造

```js
// buckets: Map<"guildId:userId", { tokens: number, lastRefill: number }>
const buckets = new Map();

// channelActivity: Map<"guild:user", Map<channelId: string, lastSeen: timestamp>>
const channelActivity = new Map();
```

#### `consumeToken(guildId, userId, channelId)`

1. バケットを取得または作成 (初期トークン = 容量)
2. 経過時間に基づいて保留中の補充を適用
3. チャンネルアクティビティを追跡 — 10 秒ウィンドウ内のアクティブチャンネル数をカウント
4. 3 チャンネル以上アクティブ → `{ exceeded: true, pressure: 30, multiChannel: true }` を返す
5. トークンが不足している場合 → `{ exceeded: true, pressure: 5, multiChannel: false }` を返す
6. それ以外の場合: 1 トークンを消費、`{ exceeded: false, pressure: 0, remaining: tokens }` を返す

#### タイマー

`startRefillTimer()` — 1 秒間隔、すべてのバケットを 1 トークンずつ補充、容量に達したバケットを削除。
`stopRefillTimer()` — 間隔をクリア。
両タイマーはアンリファレンス。

#### テストヘルパー

`resetBucket(guildId, userId)` — ユーザーのバケットとチャンネルアクティビティをクリア。
`resetAllBuckets()` — すべての状態をクリア、タイマーを停止 (テストで使用)。

### 5.2 正規表現サンドボックス (`src/modules/regexSandbox.js` + `regexWorker.js`)

メッセージコンテンツに対する正規表現パターンを **ワーカースレッド** 内で安全に評価する。ReDoS 攻撃や正規表現の悪用を防止。

#### `evaluateRegex(pattern, content, options)`

1. **ガード節:** コンテンツが空の場合、即座に `{ matched: false }` を返す — ワーカーは生成されない
2. `regexWorker.js` から `{ pattern, content }` を `workerData` として Worker を作成
3. タイムアウト (デフォルト 2000ms) を設定 — ワーカーが時間内に応答しない場合、終了させ `{ matched: false, error: "Regex evaluation timed out" }` を返す
4. ワーカー `message` 時 → `{ matched: result.matched }` で解決
5. ワーカー `error` 時 → `{ matched: true, fastTrack: true, error: err.message }` で解決 (保守的: エラーをマッチとして扱う)
6. ワーカー `exit` が非ゼロコードの場合 → 同様に解決

#### ワーカー (`regexWorker.js`)

`workerData.pattern` と `workerData.content` を受信、`new RegExp(pattern, "gi")` を作成、`regex.test(content)` をテスト、結果を親に投稿。正規表現がエラーをスローした場合 (無効なパターン、破滅的なバックトラッキング)、キャッチして `{ matched: true, fastTrack: true }` を投稿。

### 5.3 ハニーポットトラップ (`src/modules/honeypotTrap.js`)

管理者以外のユーザーが指定されたハニーポットチャンネルにメッセージを送信した場合、fast-track 禁止をトリガーする。

#### `checkHoneypot(message, db)`

1. `GuildConfiguration` から `honeypot_channel_id` をクエリ
2. ハニーポットが設定されていない場合 → `{ triggered: false }`
3. メッセージチャンネルがハニーポットチャンネルでない場合 → `{ triggered: false }`
4. 作成者が Administrator 権限を持っている場合 → `{ triggered: true, whitelisted: true }` (バイパス)
5. それ以外の場合 → `{ triggered: true, whitelisted: false }`

呼び出し元 (messageCreate.js) は `triggered && !whitelisted` の場合のみ動作。

### 5.4 ユーザープロフィール (`src/modules/userProfile.js`)

GuildMember のアカウント経過日数とアバター状態を監査し、プレッシャー乗数と人間可読な理由を生成する。

#### `auditProfile(member)`

2 つの条件をチェック:

- **アカウント経過日数:** `createdTimestamp < 7 日` → 理由: "アカウント作成から日が浅い (X.X 日 < 7 日)"
- **アバター:** `member.user.avatar === null` → 理由: "アバター未設定"

**乗数段階:**

| 条件                          | 乗数   |
| ----------------------------- | ------ |
| 通常 (アバターあり、7 日以上) | 1.0 倍 |
| アバターなしのみ              | 1.2 倍 |
| 若いアカウントのみ            | 1.5 倍 |
| 両方 (若い + アバターなし)    | 2.0 倍 |

`{ multiplier: number, reasons: string[] }` を返す。

`user_profile` モジュールが有効な場合、ベロシティと正規表現の重みが乗数で乗算される。無効 → 乗数は 1.0 に強制。

### 5.5 レイドプロテクション (`src/modules/raidProtection.js`)

自動検出と手動オーバーライドによる 3 段階レイドエスカレーションシステム。

#### 状態

レイド状態は 2 箇所に保存:

- **インメモリ:** `Map<guildId, { stage, spikeCount, spikeWindowStart }>` — 高速アクセス用
- **データベース:** `RaidState` テーブル — 再起動後もステージと権限バックアップを保持

#### ステージ定義

| ステージ                | 効果                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 (非アクティブ)        | すべての変更を元に戻す                                                                                                                     |
| 1 (スローモード 30 分)  | 権限をバックアップ、すべてのテキストチャンネルに 1800 秒のスローモードを設定                                                               |
| 2 (スローモード 2 時間) | 0 からの場合、権限をバックアップ。すべてのテキストチャンネルに 7200 秒のスローモードを設定                                                 |
| 3 (ロックダウン)        | バックアップから復元、すべてのテキストチャンネルで @everyone の `SEND_MESSAGES` を無効化、全員に送信権限のある `#raid-temp-channel` を作成 |

#### `setRaidStage(guild, targetStage, db)`

1. current === target の場合は何もしない
2. `executeStageTransition(guild, fromStage, toStage, db)` を呼び出す:
   - **0→1:** backupPermissions + setSlowmode(1800)
   - **0/1→2:** backupPermissions (0 からの場合) + setSlowmode(7200)
   - **any→3:** restoreFromBackup + disableEveryoneSend + ensureRaidChannel
   - **any→0:** revertAll (restoreFromBackup + clearSlowmode + temp チャンネル削除 + RaidState 行削除)
3. インメモリ状態を更新
4. DB に永続化

#### 自動検出

`startRaidDetection()` — スパイク数を監視する 30 秒間隔:

| ステージ | スパイクしきい値    | エスカレーション先 |
| -------- | ------------------- | ------------------ |
| 0        | 60 秒で 10 スパイク | ステージ 1         |
| 1        | 60 秒で 20 スパイク | ステージ 2         |
| 2        | 60 秒で 30 スパイク | ステージ 3         |

- スパイクは、制裁が実行されるたびに `messageCreate.js` から呼び出される `recordSpike(guildId)` によって記録
- しきい値を超えた場合、内部で `escalate()` が呼び出される (権限チェックなし)
- 60 秒間アクティビティがないとウィンドウがリセット

#### `recordSpike(guildId)`

ギルドのスパイクカウントを増分し、存在しない場合は新しい状態エントリを作成。

#### 権限バックアップ/復元

`backupPermissions(guild, db)`: すべてのテキストチャンネルを反復処理、各チャンネルの権限上書き (id、type、allow ビットフィールド、deny ビットフィールド) と `rateLimitPerUser` を取得、`RaidState.backup_json` に JSON として保存。

`restoreFromBackup(guild, db)`: バックアップ JSON を解析、チャンネルを反復処理、各上書きエントリの `SendMessages` と `ViewChannel` の上書きを null (継承) にリセット。

#### ヘルパー関数

| 関数                          | 説明                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `setSlowmode(guild, seconds)` | すべてのテキストチャンネルにスローモードを設定                                 |
| `clearSlowmode(guild)`        | スローモードを 0 にリセット                                                    |
| `disableEveryoneSend(guild)`  | すべてのテキストチャンネルで @everyone の `SendMessages: false` を設定         |
| `ensureRaidChannel(guild)`    | 存在しない場合 `#raid-temp-channel` を作成 (全員に ViewChannel + SendMessages) |
| `revertAll(guild, db)`        | 権限を復元、スローモードをクリア、一時チャンネルを削除、RaidState 行を削除     |
| `getRaidStage(guildId)`       | メモリから現在のステージを返す (デフォルト 0)                                  |

---

## 6. コマンド

### 6.1 設定 (`src/commands/configuration.js`)

スラッシュコマンドビルダー: `/config` (Administrator 権限が必要)。

**サブコマンドグループ:** `modules`、`thresholds`、`regex`、`honeypot`、`logchannel`
**直接サブコマンド:** `view`

コマンド構造:

```
/config modules toggle <module> <enabled>
/config modules weight <module> <value>
/config modules critical <module> <critical>
/config thresholds assign <tier> <pressure> [delete_seconds]
/config regex create
/config regex list
/config regex edit <identifier>
/config regex delete <identifier>
/config honeypot set <channel>
/config logchannel set <channel>
/config view
```

モジュール選択肢: `user_profile`、`velocity`、`honeypot`、`regex`
段階選択肢: 1 (warn)、2 (mute)、3 (kick)、4 (ban)

### 6.2 アピール (`src/commands/appeals.js`)

スラッシュコマンドビルダー: `/actions` (BanMembers 権限が必要)。

```
/actions appeal <message>
/actions rejoin <link>
/actions ban <user> [delete_past_hours]
/actions refresh
```

### 6.3 プロフィール (`src/commands/profiles.js`)

スラッシュコマンドビルダー: `/profiles` (Administrator 権限が必要)。

```
/profiles list
/profiles current
/profiles create <name>
/profiles apply <name>      (オートコンプリート)
/profiles export
/profiles import <encoded>
/profiles remove <name>     (オートコンプリート)
```

### 6.4 レイド (`src/commands/raid.js`)

スラッシュコマンドビルダー: `/raid` (Administrator 権限が必要)。

```
/raid stage <0|1|2|3>
/raid status
```

段階選択肢と説明:

- 0: ステージ 0 — 非アクティブ
- 1: ステージ 1 — スローモード 30 分
- 2: ステージ 2 — スローモード 2 時間
- 3: ステージ 3 — ロックダウン

### 6.5 デバッグ (`src/commands/debug.js`)

スラッシュコマンドビルダー: `/debug` (権限制限なし)。

モジュール、しきい値、正規表現ルール、アクティブなプレッシャースコア、レイド状態、テレメトリキュー長、稼働時間、メンバー数を示す完全なシステム状態埋め込みを返す。

---

## 7. ユーティリティ

### 7.1 CLOG (`src/utils/clog.js`)

色付きでタイムスタンプ付きのコンソールログラッパー。コードベース全体で直接の `console.log`/`console.warn`/`console.error` 呼び出しを置き換える。

#### 使用法

```js
clog(console.log, "message");
clog(console.warn, "warning: %s", detail);
clog(console.error, "error:", err);
```

#### 動作

- タイムスタンプを先頭に付加: `YYYY-MM-DD HH:mm:ss.SSS [INFO] message`
- タイムスタンプは `LOG_TIMEZONE` 環境変数に従う (デフォルト UTC)、`LOG_WITH_TIME=false` で無効化
- 色分け: INFO=青、WARN=黄、ERROR=赤 (ANSI エスケープコード)
- すべての引数は元のコンソール関数に転送

### 7.2 テレメトリキュー (`src/utils/telemetryQueue.js`)

バッチ処理された埋め込みログシステム。メモリ内にエントリをキューイングし、5 秒ごとに各ギルドの設定されたログチャンネルにフラッシュする。

#### キューカテゴリ

| カテゴリ  | 内容                                                          |
| --------- | ------------------------------------------------------------- |
| `action`  | 実行された制裁 (warn/mute/kick/ban)                           |
| `flag`    | ユーザーフラグ (参加時/更新時のプロフィール監査、自動更新)    |
| `command` | コマンド使用 (現在どのハンドラーでもエンキューされていません) |

#### `startTelemetryFlusher(client)`

5 秒間隔を開始:

1. `log_channel_id` が設定されたすべてのギルドをクエリ
2. 各ギルドについて: すべてのキューをドレイン、`• **CATEGORY** message` としてフォーマット
3. Discord 埋め込みとして送信 (タイトル "EXIA Telemetry"、タイムスタンプ付き)
4. フィールド制限の処理: メッセージあたり最大 25 箇条書きまたは 1024 文字、自動チャンク分割

#### `enqueue(category, message)`

指定されたキューにエントリを追加。無効なカテゴリは静かに無視。

#### `getQueueLength()`

すべてのキューにわたる保留中のエントリの総数を返す (/debug で使用)。

---

## 8. 通信フロー

### メッセージ処理パイプライン

```
Discord Gateway
    ↓
client.on(Events.MessageCreate)
    ↓
handleMessageCreate(message)
    ↓
1. ブートストラップ: ギルド設定 + モジュール重み + しきい値を取得/作成
    ↓
2. honeypotTrap.checkHoneypot(message, db)
    ↓ トリガー? → applyPressure(isCritical=true) → fastTrack=true
    ↓
3. userProfile.auditProfile(member) → { multiplier, reasons }
    ↓
4. velocityBucket.consumeToken(guildId, userId, channelId)
    ↓ 超過? → weight *= multiplier → applyPressure
    ↓
5. regexSandbox.evaluateRegex(pattern, content) [ワーカースレッド]
    ↓ マッチ? → weight = rule.threat_weight * multiplier → applyPressure
    ↓
6. profile.reasons を flagReasons に収集
    ↓
7. highestAction.action が存在?
    ├── はい → executeSanction:
    │   ├── メッセージ削除
    │   ├── 理由を DM でユーザーに送信
    │   ├── アクション適用 (warn/mute/kick/ban)
    │   ├── recordSpike(guildId)
    │   └── enqueue(action, ...)
    └── いいえ → スキップ
    ↓
8. flagReasons.length > 0? → enqueue(flag, ...)
    ↓
完了 ← メッセージハンドラーが return
```

### インタラクションルーティング

```
Discord Gateway
    ↓
client.on(Events.InteractionCreate)
    ↓
handleInteractionCreate(interaction)
    ↓
isAutocomplete?
├── はい → handleAutocomplete(interaction)
│   ├── profiles apply/remove → ConfigProfiles をクエリ → 応答
│   └── config regex edit/delete → RegexRules をクエリ → 応答
└── いいえ → isChatInputCommand?
    ├── はい → switch(interaction.commandName)
    │   ├── "config"    → handleConfigCommand(interaction, db)
    │   ├── "actions"   → handleActionsCommand(interaction, db)
    │   ├── "profiles"  → handleProfilesCommand(interaction, db)
    │   ├── "raid"      → handleRaidCommand(interaction, db)
    │   └── "debug"     → handleDebugCommand(interaction, db)
    └── いいえ → 無視
```

### レイド検出フロー

```
recordSpike(guildId) [executeSanction から呼び出される]
    ↓
raidState Map: spikeCount を増分
    ↓
startRaidDetection() [30 秒間隔]
    ↓
stage < 3 の各ギルド:
    ↓
    ウィンドウ期限切れ (>60秒)?
    ├── はい → spikeCount を 0 にリセット、windowStart をリセット
    └── いいえ → spikeCount ≥ しきい値?
        ├── はい → escalate(guildId, nextStage)
        │   ├── executeStageTransition (スローモード/ロックダウン適用)
        │   ├── メモリ状態を更新
        │   ├── RaidState を DB に永続化
        │   └── enqueue(action, "レイド自動エスカレーション...")
        └── いいえ → 継続
```

---

## 9. アプリケーションの実行

### 前提条件

- Node.js 26 + pnpm 11.12 (corepack 経由)
- Docker (オプション、コンテナ化されたデプロイ用)
- インテント付き Discord ボットトークンとクライアント ID: Guilds、GuildMessages、MessageContent、GuildMembers、GuildMessageReactions、GuildModeration

### クイックスタート (ローカル)

```bash
cp .env.example .env
# 編集 .env に CLIENT_ID と TOKEN を設定
pnpm install
pnpm dev
```

### Docker

```bash
docker compose up -d --build
```

ボットは `ClientReady` 時にグローバルに 5 つのスラッシュコマンドを登録します。SQLite データは `exia_data` 名前付きボリュームに永続化されます。

### テスト

```bash
pnpm test          # すべてのテストを実行
pnpm test:watch    # ウォッチモード
pnpm lint          # Prettier チェック + ESLint
```

現在のテストスイート (合計 61 テスト):

- `pressureEngine.test.js` — applyPressure、減衰、mutex、fast-track、マルチギルド分離
- `velocityBucket.test.js` — トークン消費、補充、マルチチャンネル検出、自動削除
- `regexSandbox.test.js` — パターンマッチング、空コンテンツガード、タイムアウト
- `honeypotTrap.test.js` — チャンネル検出、管理者ホワイトリスト、未設定ケース
- `userProfile.test.js` — 乗数段階、理由生成
- `telemetryQueue.test.js` — エンキュー、フラッシュ、チャンク分割、フィールド制限

### シャットダウン

`SIGINT`/`SIGTERM` での正常シャットダウン: Discord クライアントを破棄、クリーンに終了。未処理の reject とクライアントエラーはログに記録されますが、プロセスはクラッシュしません。
