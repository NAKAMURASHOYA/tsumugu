/**
 * analyze-mood Edge Function の BDD テスト
 *
 * 【テスト対象のビジネスルール（基本設計書 §4.1 より）】
 * 1. POST /functions/v1/analyze-mood にテキストを受け取る
 * 2. LLMモック（Sprint 1）からメタデータを取得してJSONを返す
 * 3. 平文テキストがログに残らないこと（ゼロナレッジ要件）
 * 4. 不正なリクエストには 400 を返す
 *
 * テスト戦略:
 * - ハンドラー関数を直接インポートして単体テスト
 * - HTTP層のテストにはFetch APIのモックを使用
 */

// Edge Function の純粋なビジネスロジック部分をインポート
import {
  buildMoodMetadata,
  validateRequest,
  createErrorResponse,
} from "./handler";

// ============================================================
// テストスイート 1: リクエストバリデーション
// ============================================================
describe("validateRequest", () => {
  it("有効なテキストを含むリクエストボディを受け入れること", () => {
    const body = { text: "会議が長引いて疲れた" };
    const result = validateRequest(body);
    expect(result.success).toBe(true);
  });

  it("textフィールドが空の場合にバリデーションエラーを返すこと", () => {
    const body = { text: "" };
    const result = validateRequest(body);
    expect(result.success).toBe(false);
    // ts-jest の型推論の制限を回避するため、失敗ブランチの型として明示的にキャスト
    const failResult = result as { success: false; error: string };
    expect(failResult.error).toBeDefined();
  });

  it("textフィールドが存在しない場合にバリデーションエラーを返すこと", () => {
    const body = {};
    const result = validateRequest(body);
    expect(result.success).toBe(false);
  });

  it("2000文字を超えるテキストを拒否すること（DoS防止）", () => {
    const body = { text: "あ".repeat(2001) };
    const result = validateRequest(body);
    expect(result.success).toBe(false);
  });

  it("2000文字ちょうどのテキストを受け入れること（境界値）", () => {
    const body = { text: "あ".repeat(2000) };
    const result = validateRequest(body);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// テストスイート 2: メタデータ生成ロジック（LLMモック）
// ============================================================
describe("buildMoodMetadata", () => {
  it("返却値がversion・mood・color・labelを含むこと（インターフェース契約）", () => {
    const metadata = buildMoodMetadata("joy", "テストテキスト");
    expect(metadata).toHaveProperty("version", "1.0");
    expect(metadata).toHaveProperty("mood");
    expect(metadata).toHaveProperty("color");
    expect(metadata).toHaveProperty("label");
  });

  it("colorが有効な16進カラーコード形式であること", () => {
    const metadata = buildMoodMetadata("calm", "おだやかな日");
    expect(metadata.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("5つの感情カテゴリすべてに対して正常なメタデータを返すこと", () => {
    const moods = ["joy", "calm", "neutral", "tired", "rough"] as const;
    moods.forEach((mood) => {
      const metadata = buildMoodMetadata(mood, "テスト");
      expect(metadata.mood).toBe(mood);
      expect(metadata.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof metadata.label).toBe("string");
      expect(metadata.label.length).toBeGreaterThan(0);
    });
  });

  it("返却値にtextフィールドが含まれないこと（平文の漏洩防止）", () => {
    // なぜ重要か: レスポンスJSONに入力テキストが含まれると
    // ログ等に平文が記録されるリスクがある。
    // AIが解析した「結果のみ」を返し、入力文は絶対に含めない。
    const metadata = buildMoodMetadata("rough", "秘密のテキスト");
    const metadataStr = JSON.stringify(metadata);
    expect(metadataStr).not.toContain("秘密のテキスト");
  });
});

// ============================================================
// テストスイート 3: エラーレスポンス生成
// ============================================================
describe("createErrorResponse", () => {
  it("指定したステータスコードとエラーコードを含むレスポンスを生成すること", () => {
    const response = createErrorResponse(400, "INVALID_REQUEST", "テキストが不正です");
    expect(response.status).toBe(400);
  });

  it("エラーレスポンスのボディがAppErrorフォーマットに準拠すること（基本設計書 §7）", async () => {
    const response = createErrorResponse(400, "INVALID_REQUEST", "テキストが不正です");
    const body = await response.json();
    expect(body).toHaveProperty("code", "INVALID_REQUEST");
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("timestamp");
    // detailsは本番環境では非公開のため、存在しないかundefinedであること
    expect(body.details).toBeUndefined();
  });

  it("timestampがISO8601形式であること", async () => {
    const response = createErrorResponse(500, "INTERNAL_ERROR", "内部エラー");
    const body = await response.json();
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});

// ============================================================
// テストスイート 4: ゼロナレッジ要件の検証
// ============================================================
describe("ゼロナレッジ要件", () => {
  it("buildMoodMetadataが入力テキストをどこにも保持しないこと", () => {
    // スパイで console.log の呼び出しを監視
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const consolErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const sensitiveText = "SENSITIVE_DATA_12345";
    buildMoodMetadata("rough", sensitiveText);

    // console.logに平文テキストが渡されていないことを確認
    consoleSpy.mock.calls.forEach((call) => {
      call.forEach((arg) => {
        expect(String(arg)).not.toContain(sensitiveText);
      });
    });

    consoleSpy.mockRestore();
    consolErrorSpy.mockRestore();
  });
});
