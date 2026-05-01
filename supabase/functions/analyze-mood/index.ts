/**
 * analyze-mood Edge Function — エントリーポイント (Deno)
 *
 * Endpoint: POST /functions/v1/analyze-mood
 * 基本設計書 §4.1 に準拠
 *
 * 【ゼロナレッジ保証】
 * Deno Edge Runtime の特性: HTTP レスポンス返却後にコンテキストが破棄される。
 * 入力テキストはリクエスト処理中にのみメモリに存在し、永続化されない。
 */
import { buildMoodMetadata, createErrorResponse, validateRequest } from "./handler.ts";

// Deno のグローバル型
declare const Deno: { serve: (handler: (req: Request) => Promise<Response>) => void };

Deno.serve(async (req: Request) => {
  // CORS プリフライトリクエストへの対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // POSTのみ受け付ける
  if (req.method !== "POST") {
    return createErrorResponse(405, "METHOD_NOT_ALLOWED", "POSTリクエストのみ受け付けます");
  }

  // リクエストボディのパース
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse(400, "INVALID_JSON", "リクエストボディのJSON解析に失敗しました");
  }

  // バリデーション（Zodスキーマによる型安全な検証）
  const validation = validateRequest(body);
  if (!validation.success) {
    return createErrorResponse(400, "INVALID_REQUEST", validation.error);
  }

  // 感情分類を実行
  // NOTE: Sprint 1 では mood をクライアントから受け取る。
  //       Sprint 2 では LLM API がテキストから自動分類する。
  const requestBody = body as { text: string; mood?: string };
  const mood = (requestBody.mood ?? "neutral") as
    | "joy"
    | "calm"
    | "neutral"
    | "tired"
    | "rough";

  // ゼロナレッジ: テキストをハンドラに渡した後、この変数はスコープ外になり破棄される
  const metadata = buildMoodMetadata(mood, validation.data.text);

  // リクエストIDのみをログに記録（平文テキストは絶対に出力しない）
  // console.log(`[analyze-mood] processed request, mood=${mood}`); // ← OK（平文なし）
  // console.log(validation.data.text); // ← 絶対禁止

  return new Response(JSON.stringify(metadata), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
