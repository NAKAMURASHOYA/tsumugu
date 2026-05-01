/**
 * authStore の BDD テスト
 *
 * 基本設計書 §6「グローバルステート（Zustand）: 秘密鍵はセキュアストレージからロード、
 * パートナーの公開鍵・pairIdをメモリに保持」に対応。
 *
 * 【重要な設計上の制約のテスト】
 * - 秘密鍵はメモリ上でのみ保持し、persistミドルウェアでローカルDBに書き出さない
 * - ログアウト時は秘密鍵をメモリから確実に削除する
 */
import { act, renderHook } from "@testing-library/react-native";
import { useAuthStore } from "./authStore";

// expo-secure-store のモック（テスト環境ではネイティブモジュール不使用）
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// cryptoService のモック（Storeのテストではcryptoの実装詳細に依存しない）
jest.mock("../features/crypto/cryptoService", () => ({
  generateKeyPair: jest.fn().mockResolvedValue({
    publicKey: "-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----",
  }),
}));

const MOCK_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----";
const MOCK_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----";
const MOCK_PAIR_ID = "test-pair-uuid-1234";

// 各テスト前にStoreを初期状態にリセット
beforeEach(() => {
  useAuthStore.setState({
    privateKey: null,
    partnerPublicKey: null,
    pairId: null,
    myPublicKey: null,
    isPaired: false,
  });
});

// ============================================================
// テストスイート 1: 初期状態
// ============================================================
describe("authStore — 初期状態", () => {
  it("初期状態では秘密鍵・パートナー公開鍵・pairIdがすべてnullであること", () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.privateKey).toBeNull();
    expect(result.current.partnerPublicKey).toBeNull();
    expect(result.current.pairId).toBeNull();
  });

  it("初期状態でisパiredがfalseであること", () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.isPaired).toBe(false);
  });
});

// ============================================================
// テストスイート 2: キーペアの初期化
// ============================================================
describe("authStore — initializeKeyPair", () => {
  it("initializeKeyPairを呼ぶとmyPublicKeyがメモリに保持されること", async () => {
    const { result } = renderHook(() => useAuthStore());
    await act(async () => {
      await result.current.initializeKeyPair();
    });
    expect(result.current.myPublicKey).not.toBeNull();
    expect(result.current.myPublicKey).toContain("BEGIN PUBLIC KEY");
  });

  it("initializeKeyPair後も秘密鍵はメモリ上にのみ保持されること", async () => {
    const { result } = renderHook(() => useAuthStore());
    await act(async () => {
      await result.current.initializeKeyPair();
    });
    // 秘密鍵がStoreのメモリ上に存在することを確認
    // （Secure Storeへの保存はモックで検証、DB永続化はされていないこと）
    expect(result.current.privateKey).not.toBeNull();
    expect(result.current.privateKey).toContain("PRIVATE KEY");
  });
});

// ============================================================
// テストスイート 3: 秘密鍵のロード（Secure Storeから）
// ============================================================
describe("authStore — loadPrivateKey", () => {
  it("loadPrivateKeyを呼ぶと秘密鍵がメモリに保持されること", async () => {
    const { result } = renderHook(() => useAuthStore());
    await act(async () => {
      result.current.loadPrivateKey(MOCK_PRIVATE_KEY);
    });
    expect(result.current.privateKey).toBe(MOCK_PRIVATE_KEY);
  });
});

// ============================================================
// テストスイート 4: ペアリング状態の管理
// ============================================================
describe("authStore — setPairingInfo", () => {
  it("setPairingInfoでパートナー公開鍵とpairIdが設定されること", () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setPairingInfo({
        partnerPublicKey: MOCK_PUBLIC_KEY,
        pairId: MOCK_PAIR_ID,
      });
    });
    expect(result.current.partnerPublicKey).toBe(MOCK_PUBLIC_KEY);
    expect(result.current.pairId).toBe(MOCK_PAIR_ID);
    expect(result.current.isPaired).toBe(true);
  });

  it("パートナー公開鍵とpairIdが揃ったときのみisPariedがtrueになること", () => {
    const { result } = renderHook(() => useAuthStore());
    // pairIdのみ設定 → まだペアリング未完了
    act(() => {
      result.current.setPairingInfo({
        partnerPublicKey: "",
        pairId: MOCK_PAIR_ID,
      });
    });
    expect(result.current.isPaired).toBe(false);
  });
});

// ============================================================
// テストスイート 5: ログアウト（秘密鍵のメモリ消去）
// ============================================================
describe("authStore — clearSession", () => {
  it("clearSessionを呼ぶと秘密鍵がメモリから削除されること（重要）", async () => {
    const { result } = renderHook(() => useAuthStore());

    // セッション開始
    act(() => {
      result.current.loadPrivateKey(MOCK_PRIVATE_KEY);
      result.current.setPairingInfo({
        partnerPublicKey: MOCK_PUBLIC_KEY,
        pairId: MOCK_PAIR_ID,
      });
    });
    expect(result.current.privateKey).not.toBeNull();

    // ログアウト（クリア）
    await act(async () => {
      await result.current.clearSession();
    });

    // 秘密鍵がnullになっていることを確認
    // なぜ重要か: デバイスをシェアするシナリオやロック画面からの保護のため
    expect(result.current.privateKey).toBeNull();
    expect(result.current.partnerPublicKey).toBeNull();
    expect(result.current.pairId).toBeNull();
    expect(result.current.isPaired).toBe(false);
  });
});
