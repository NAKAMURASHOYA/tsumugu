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
- [x] 描画エンジン選定スパイント → **@shopify/react-native-skia 採用確定**（→ Sprint 2 FX Layer サブスプリントで完了）
- [ ] `analyze-mood` の LLM API（Claude）連携（プロンプトエンジニアリング）
- [ ] Supabase ローカル環境の `supabase start` 動作確認
- [ ] 認証フロー（`features/auth`）の実装
- [ ] React Native UI層の実装（HTMLプロトタイプからの移植）

---

## [2026-05-03] Sprint 2 — FX Layer サブスプリント（描画エンジン実装 + 計測基盤）

### 1. 本日の目的
技術スパイントで確定した **@shopify/react-native-skia + react-native-reanimated ハイブリッド構成** を
実際のコードとして実装し、EAS Dev Client ビルドによる実機パフォーマンス計測が
できる状態にする。

### 2. 実施内容

#### Phase 2-A: EAS Dev Client セットアップ
- `app.json` — Tsumugu 向けに更新（name/slug/bundleIdentifier/package）
- `eas.json` — development / preview / production の3プロファイルを定義
  - development: Simulator（iOS）/ APK（Android）、developmentClient: true

#### Phase 2-B: 描画エンジン統合
- `package.json` — `@shopify/react-native-skia ^1.7.4` / `react-native-reanimated ~3.16.7` / `expo-dev-client ~5.0.12` を追加
- `babel.config.js` — 新規作成。reanimated plugin を最後に追加（公式要件）
- `metro.config.js` — 新規作成。`withSkiaMetroConfig` で Skia .sksl シェーダーを Metro に認識させる

#### Phase 2-C: FX Layer コンポーネント実装

新規作成: `src/components/FxLayer/`

| ファイル | 役割 |
|---|---|
| `AmbientBackground.tsx` | 感情連動 放射グラデーション。`useSharedValue` → Skia `useDerivedValue` 直結で 1.2s cubic-bezier 遷移を JS スレッド非経由で実行 |
| `PaperTexture.tsx` | 紙質テクスチャ。`BlendMode.Multiply` による乗算合成。**Android 未実装の SVG `mixBlendMode` バグを解決する核心実装** |
| `useParticles.ts` | パーティクル物理計算フック。全状態を `useSharedValue<ParticleState[]>` 単一配列で管理し、個別コンポーネント再レンダリングを排除 |
| `ParticleSystem.tsx` | 花びら（SVGパス）/ 光（RadialGradient円）/ 風（曲線ストローク）を Skia で GPU 一括描画 |
| `FxLayer.tsx` | 統合コンポーネント。`forwardRef` で `emit()` を公開し、PartnerView から呼び出し可能 |
| `index.ts` | 公開 API エクスポート |

#### Phase 2-D: パフォーマンス計測基盤

- `src/utils/performanceMonitor.ts` — rAF ループで FPS サンプリング。3シナリオの合否判定ロジックを実装
- `src/screens/_BenchmarkScreen.tsx` — `__DEV__` ガード付きの開発専用計測画面。全シナリオ順次実行 → ログ表示 → Alert で総合判定

### 3. 意思決定事項

| 決定内容 | 理由 |
|---|---|
| `@shopify/react-native-skia` を FX Layer エンジンとして採用 | `react-native-svg` の `mixBlendMode` Android 未実装バグ（既知・未解決）が Tsumugu の紙質テクスチャを Android で再現不能にするため。Skia の `BlendMode.Multiply` が唯一の実用解 |
| `useSharedValue` を Skia `useDerivedValue` に直接渡す設計 | PM指示。JS スレッド → UIスレッド → Skia の2段ブリッジを排除し、感情遷移時のドロップフレーム 0 を保証する |
| パーティクル状態を単一 `SharedValue<ParticleState[]>` で管理 | 50個のパーティクルを個別 React コンポーネントにすると50回の reconciliation が毎フレーム発生する。配列1本にまとめることで React のツリー更新を最小化 |
| `_BenchmarkScreen` を `__DEV__` ガードで保護 | 計測ツールが本番ビルドに混入しないようにする。ファイル名先頭の `_` も「開発専用」を示す規約として設定 |
| `eas.json` の development プロファイルで iOS は `simulator: true` | 実機なしで EAS Cloud ビルドをシミュレータで検証できるようにする。実機計測は preview プロファイルで行う |

### 4. 次のアクション（CEO側）

```bash
# 1. 依存関係のインストール
cd apps/mobile && npm install

# 2. EAS Dev Client ビルド実行（development プロファイル）
eas build --profile development --platform ios
eas build --profile development --platform android

# 3. Dev Client をデバイスにインストール後、_BenchmarkScreen を起動
#    → 「▶ 全シナリオ実行」ボタンで計測開始
#    → ログを本レポートに貼り付けてフィードバック
```

### 5. 残課題

- [ ] CEO による実機 EAS ビルド + 計測実行（Tier B: iPhone 13 / Pixel 6a）
- [ ] 計測結果レポートの受領と合否判定
- [ ] 不合格シナリオがあった場合の最適化対応
- [ ] `analyze-mood` LLM API 連携（Sprint 2 メインストリーム）
- [ ] 認証フロー（`features/auth`）の実装

---

### Sprint 1 テスト総括

| ドメイン | テストファイル | パス数 | 総数 |
|---|---|---|---|
| E2EE暗号化 | cryptoService.test.ts | 13 | 13 |
| Zustand Store | authStore.test.ts | 8 | 8 |
| Edge Function | analyze-mood.test.ts | 13 | 13 |
| **合計** | | **34** | **34** |
