/**
 * analyze-mood Edge Function — ビジネスロジック層
 *
 * 【ゼロナレッジ設計の徹底】
 * - 入力テキスト（平文）はこのモジュールの外に一切出力しない
 * - console.log への平文の渡し込みを禁止（コードレビューで必ず確認すること）
 * - Denoランタイムの特性上、リクエスト完了時にメモリは自動破棄される
 *
 * 【Sprint 1 スコープ】
 * - LLMとの連携はモック実装
 * - インターフェース（JSONスキーマ）の確立が主目的
 * - Sprint 2でClaude APIへの差し替えを予定
 */
import { z } from "zod";

// ============================================================
// 入力バリデーション（Zodスキーマ）
// ============================================================
const AnalyzeMoodRequestSchema = z.object({
  text: z.string().min(1, "テキストを入力してください").max(2000, "テキストは2000文字以内にしてください"),
});

type ValidationResult =
  | { success: true; data: { text: string } }
  | { success: false; error: string };

/**
 * リクエストボディをバリデーションする
 * なぜ Zod を使うか: 型安全なバリデーションで、スキーマ定義が仕様書になる
 */
export function validateRequest(body: unknown): ValidationResult {
  const result = AnalyzeMoodRequestSchema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors.map((e) => e.message).join(", "),
    };
  }
  // ts-jest の strictNullChecks 設定との互換性のため明示的にキャスト
  return { success: true, data: { text: result.data.text as string } };
}

// ============================================================
// 感情メタデータ定義（LLMモック）
// ============================================================
type MoodType = "joy" | "calm" | "neutral" | "tired" | "rough";

const MOOD_METADATA: Record<
  MoodType,
  { color: string; label: string; tone: string }
> = {
  joy: {
    color: "#FFBF00",
    label: "心がふわっと、軽くなった日",
    tone: "bright_warm",
  },
  calm: {
    color: "#6B8E23",
    label: "おだやかに、流れていく時間",
    tone: "soft_cool",
  },
  neutral: {
    color: "#8a8880",
    label: "いつもの、当たり前の一日",
    tone: "neutral",
  },
  tired: {
    color: "#4682B4",
    label: "すこし、休んでもいいよ",
    tone: "soft_blue",
  },
  rough: {
    color: "#DB7093",
    label: "すこし、こころが揺れているみたい",
    tone: "soft_warm",
  },
};

/**
 * 感情タイプからメタデータを生成する（Sprint 1: モック実装）
 *
 * 【重要】入力テキストはログに出力しない。感情分類の結果のみを返す。
 * Sprint 2でLLM APIを統合する際は、この関数内でプロンプトを構築・送信する。
 *
 * @param mood - 感情カテゴリ（クライアント側のUIから選択された値）
 * @param _text - 入力テキスト（Sprint 1では未使用。アンダースコアで意図を明示）
 */
export function buildMoodMetadata(
  mood: MoodType,
  _text: string // NOTE: Sprint 1ではモックのため使用しない。平文はここで消える。
) {
  const base = MOOD_METADATA[mood] ?? MOOD_METADATA.neutral;

  return {
    version: "1.0" as const,
    mood,
    color: base.color,
    label: base.label,
    tone: base.tone,
    // context（天気・位置情報・歩数）はクライアント側で付加するため、
    // Edge Functionからは提供しない（センサー情報にサーバーはアクセスしない）
  };
}

// ============================================================
// エラーレスポンス生成（基本設計書 §7 AppError フォーマット準拠）
// ============================================================
export function createErrorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
      timestamp: new Date().toISOString(),
      // detailsは本番環境では公開しない（情報漏洩防止）
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
