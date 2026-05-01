# Development Log (開発ログ)

---

## [2026-05-02] Sprint 1 — 基盤ドメイン構築

### 1. 本日の目的
BDD（テスト駆動）アプローチにより、E2EE暗号化基盤・Zustand状態管理・AIプロキシEdge Functionの3ドメインを実装し、全テストをグリーンにする。

### 2. 実施内容

#### Step 1: プロジェクト骨格の構築
- `apps/mobile/` に Expo (SDK 54, TypeScript) プロジェクトを初期化
- 基本設計書 §2 のドメイン駆動型ディレクトリ構造を物理作成
- `package.json` に Sprint 1 の依存関係を定義（zustand, zod, react-native-quick-crypto, expo-secure-store 等）
- Jest + jest-expo の BDD テスト環境を構築
- `src/__mocks__/react-native-quick-crypto.ts` にNode.js cryptoモジュールのモックを作成（テスト環境で使用）

#### Step 2: features/crypto — E2EEモジュール
- `cryptoService.test.ts`（13ケース）を先に作成（Redフェーズ）
- `cryptoService.ts` を実装してグリーンにする（Greenフェーズ）
- **テスト結果: 13/13 PASS**

実装した関数:
- `generateKeyPair()` — RSA-OAEP 2048bit キーペア生成
- `encryptForPartner()` — ハイブリッド暗号化（AES-256-GCM + RSA-OAEP）
- `decryptFromPartner()` — ハイブリッド復号化（GCM認証タグによる改ざん検知）
- `exportPublicKey()` / `importPublicKey()` — PEM形式変換

#### Step 3: store/ — Zustand グローバル状態管理
- `authStore.test.ts`（8ケース）を先に作成（Redフェーズ）
- `authStore.ts` を実装してグリーンにする（Greenフェーズ）
- **テスト結果: 8/8 PASS**

実装した Actions:
- `initializeKeyPair()` — 初回キーペア生成とSecure Storeへの保存（冪等）
- `loadPrivateKey()` — 起動時のSecure Storeからのロード
- `setPairingInfo()` — パートナー公開鍵・pairId の設定
- `clearSession()` — ログアウト時のメモリ・Secure Store同時削除

#### Step 4: supabase/functions/analyze-mood — Edge Function
- `supabase/config.toml` — ローカルSupabase設定ファイル作成
- `supabase/migrations/20260502000000_init_schema.sql` — 初期DBスキーマ（User/Pair/Journal/Reaction + RLS）
- `analyze-mood.test.ts`（13ケース）を先に作成（Redフェーズ）
- `handler.ts` / `index.ts` を実装してグリーンにする（Greenフェーズ）
- **テスト結果: 13/13 PASS**

### 3. 意思決定事項

| 決定内容 | 理由 |
|---|---|
| テスト環境での crypto モックに Node.js crypto モジュールを使用 | react-native-quick-crypto はネイティブモジュールのためJest環境では動作しない。OpenSSL互換のNode.js cryptoで同等の挙動を再現できる |
| 秘密鍵をZustandのpersistから除外 | 秘密鍵をlocalStorageやAsyncStorageに書き出すとデバイス奪取時のリスクが生じる。Secure Enclave/Keystore → メモリのフローを徹底 |
| ハイブリッド暗号化（RSA+AES）の採用 | RSA単体では長文テキストを暗号化できない（鍵長制限）。AES-GCMで高速に暗号化し、セッション鍵のみRSAで保護する設計が業界標準 |
| RLSをマイグレーションで定義 | アプリコードではなくDBレイヤーでアクセス制御を行うことで、ロジックの漏れを防ぐ |

### 4. 残課題・次回の予定（Sprint 2）

- [ ] `npm install` による `node_modules` の実体化（各開発者が実行）
- [ ] `analyze-mood` の LLM API（Claude）連携（プロンプトエンジニアリング）
- [ ] Supabase ローカル環境の `supabase start` 動作確認
- [ ] 認証フロー（`features/auth`）の実装
- [ ] React Native UI層の実装（HTMLプロトタイプからの移植）

### Sprint 1 テスト総括

| ドメイン | テストファイル | パス数 | 総数 |
|---|---|---|---|
| E2EE暗号化 | cryptoService.test.ts | 13 | 13 |
| Zustand Store | authStore.test.ts | 8 | 8 |
| Edge Function | analyze-mood.test.ts | 13 | 13 |
| **合計** | | **34** | **34** |
