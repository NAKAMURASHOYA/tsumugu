/**
 * Zustand 認証・ペアリング状態管理 Store
 *
 * 【設計上の絶対ルール】
 * - `privateKey` は persist ミドルウェアで永続化しない。
 *   メモリ上のみで保持し、アプリ再起動時はSecure Storeから再ロードする。
 * - `partnerPublicKey` はDBから取得するため、キャッシュとしてメモリに保持する。
 * - `isPaired` は partnerPublicKey と pairId の両方が揃った場合のみ true になる。
 */
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { generateKeyPair } from "../features/crypto/cryptoService";

// Secure Store のキー定数（変更するとユーザーが鍵を失う。慎重に）
const SECURE_STORE_PRIVATE_KEY = "tsumugu_private_key_v1";
const SECURE_STORE_PUBLIC_KEY = "tsumugu_public_key_v1";

// ============================================================
// State の型定義
// ============================================================
interface AuthState {
  /** 自分のRSA秘密鍵（PEM）。メモリのみ保持。persistしない */
  privateKey: string | null;
  /** 自分のRSA公開鍵（PEM）。DBに登録済み */
  myPublicKey: string | null;
  /** パートナーのRSA公開鍵（PEM）。暗号化時に使用 */
  partnerPublicKey: string | null;
  /** ペアのUUID。すべてのDB操作で使用するスコープキー */
  pairId: string | null;
  /** パートナーとのペアリングが完了しているか */
  isPaired: boolean;
}

interface AuthActions {
  /**
   * 初回起動時: キーペアを生成してSecure Storeに保存する
   * 既にキーが存在する場合はスキップする（冪等性の保証）
   */
  initializeKeyPair: () => Promise<void>;
  /**
   * アプリ起動時: Secure Storeから秘密鍵をメモリにロードする
   * @param privateKey - Secure Storeから取得した秘密鍵
   */
  loadPrivateKey: (privateKey: string) => void;
  /**
   * ペアリング完了時: パートナーの公開鍵とpairIdを設定する
   */
  setPairingInfo: (info: { partnerPublicKey: string; pairId: string }) => void;
  /**
   * ログアウト時: メモリ上の秘密鍵を確実に消去する
   * なぜ重要か: デバイスを他者と共有するシナリオや、
   * アカウント切り替え時に秘密鍵が残留するリスクを防ぐ
   */
  clearSession: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

// ============================================================
// Store の実装
// ============================================================
export const useAuthStore = create<AuthStore>((set, get) => ({
  // 初期状態: すべてnull（未認証・未ペアリング）
  privateKey: null,
  myPublicKey: null,
  partnerPublicKey: null,
  pairId: null,
  isPaired: false,

  initializeKeyPair: async () => {
    // 既に鍵が存在する場合はスキップ（再生成すると既存の暗号化データが読めなくなる）
    const existing = await SecureStore.getItemAsync(SECURE_STORE_PRIVATE_KEY);
    if (existing) {
      const existingPublicKey = await SecureStore.getItemAsync(SECURE_STORE_PUBLIC_KEY);
      set({ privateKey: existing, myPublicKey: existingPublicKey });
      return;
    }

    const { publicKey, privateKey } = await generateKeyPair();

    // Secure Enclave（iOS）/ Keystore（Android）に保存
    await SecureStore.setItemAsync(SECURE_STORE_PRIVATE_KEY, privateKey);
    await SecureStore.setItemAsync(SECURE_STORE_PUBLIC_KEY, publicKey);

    set({ privateKey, myPublicKey: publicKey });
  },

  loadPrivateKey: (privateKey: string) => {
    set({ privateKey });
  },

  setPairingInfo: ({ partnerPublicKey, pairId }) => {
    // 両方の値が揃った場合のみペアリング完了とみなす
    const isPaired = Boolean(partnerPublicKey && pairId);
    set({ partnerPublicKey, pairId, isPaired });
  },

  clearSession: async () => {
    // メモリ上の状態をクリア
    set({
      privateKey: null,
      myPublicKey: null,
      partnerPublicKey: null,
      pairId: null,
      isPaired: false,
    });
    // Secure Storeからも削除（デバイスリセット・アカウント削除時）
    await SecureStore.deleteItemAsync(SECURE_STORE_PRIVATE_KEY);
    await SecureStore.deleteItemAsync(SECURE_STORE_PUBLIC_KEY);
  },
}));
