import { z } from "zod";

// ============================================================
// E2EE 暗号化関連の型
// ============================================================

/** RSA キーペア（生成直後のメモリ上の表現） */
export interface CryptoKeyPair {
  /** PEM形式の公開鍵（DBに登録する） */
  publicKey: string;
  /** PEM形式の秘密鍵（Secure Storeに保存する。外部へは絶対に渡さない） */
  privateKey: string;
}

/** E2EEで暗号化されたジャーナルの電送形式 */
export interface EncryptedPayload {
  /**
   * AES-GCM で暗号化された本文（Base64）
   * 復号にはセッション鍵が必要
   */
  ciphertext: string;
  /** AES-GCM の初期化ベクトル（Base64）。毎回ランダム生成 */
  iv: string;
  /**
   * パートナーの公開鍵（RSA-OAEP）で暗号化されたAESセッション鍵（Base64）
   * DBサーバーはこのセッション鍵を復号できない
   */
  encryptedSessionKey: string;
}

// ============================================================
// AI メタデータ関連の型（Zodスキーマ + 型推論）
// ============================================================

/** analyze-mood Edge Function のリクエストスキーマ */
export const AnalyzeMoodRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});

/** analyze-mood Edge Function のレスポンスJSONスキーマ */
export const MoodMetadataSchema = z.object({
  version: z.literal("1.0"),
  mood: z.enum(["joy", "calm", "neutral", "tired", "rough"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  label: z.string().max(50),
  tone: z.string().optional(),
  context: z
    .object({
      weather: z.string().optional(),
      location: z.string().optional(),
      steps: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type AnalyzeMoodRequest = z.infer<typeof AnalyzeMoodRequestSchema>;
export type MoodMetadata = z.infer<typeof MoodMetadataSchema>;

// ============================================================
// Supabase DBモデルに対応する型
// ============================================================

export interface DbUser {
  id: string;
  pairId: string | null;
  publicKey: string;
  createdAt: string;
}

export interface DbJournal {
  id: string;
  authorId: string;
  pairId: string;
  encryptedNote: string;
  metadataJson: MoodMetadata;
  monthDay: string; // "MM-DD" 形式。タイムカプセル検索用
  recordedAt: string;
  createdAt: string;
}

export interface DbReaction {
  id: string;
  authorId: string;
  journalId: string;
  fxType: "petal" | "light" | "breeze";
  createdAt: string;
}

// ============================================================
// アプリ全体のエラー型（基本設計書 §7 準拠）
// ============================================================

export interface AppError {
  code: string;
  message: string;
  timestamp: string;
  details?: unknown;
}
