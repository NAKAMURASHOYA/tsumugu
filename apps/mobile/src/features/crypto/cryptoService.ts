/**
 * E2EE 暗号化サービス
 *
 * 【設計方針】
 * - RSA-OAEP (2048bit) でセッション鍵を暗号化（鍵交換）
 * - AES-GCM (256bit) でジャーナル本文を暗号化（速度と安全性の両立）
 * - この2層構造（Hybrid Encryption）により、長文テキストの高速暗号化と
 *   公開鍵暗号の鍵管理の利便性を同時に実現する
 *
 * 【本番環境】react-native-quick-crypto（Secure Enclave/Keystore連携）
 * 【テスト環境】__mocks__/react-native-quick-crypto.ts（Node.js crypto モジュール）
 */
import crypto from "react-native-quick-crypto";
import type { CryptoKeyPair, EncryptedPayload } from "../../types";

// RSA-OAEP に使用するハッシュアルゴリズム
const RSA_HASH = "sha256";
// AES-GCM のキー長（ビット）
const AES_KEY_BITS = 256;
// AES-GCM の初期化ベクトル長（バイト）。NIST推奨の12バイト
const AES_IV_BYTES = 12;

// ============================================================
// キーペア生成
// ============================================================

/**
 * RSA-OAEP (2048bit) キーペアを生成する
 *
 * なぜ2048bit か:
 * 現時点でNISTが推奨する最低限の安全性を満たしつつ、
 * モバイルデバイスでの生成速度を許容範囲に保つバランスを取っている。
 * 4096bitはモバイルで生成が遅すぎるため採用しない。
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      },
      (err: Error | null, publicKey: string, privateKey: string) => {
        if (err) {
          reject(new Error(`キーペア生成失敗: ${err.message}`));
          return;
        }
        resolve({ publicKey, privateKey });
      }
    );
  });
}

// ============================================================
// 公開鍵のエクスポート・インポート（DBとの橋渡し）
// ============================================================

/**
 * CryptoKey オブジェクトをPEM文字列にエクスポートする
 * DBへの登録時に使用する
 */
export async function exportPublicKey(key: unknown): Promise<string> {
  // react-native-quick-crypto はPEM文字列を直接扱うため、
  // CryptoKey オブジェクトでなくPEM文字列が渡された場合はそのまま返す
  if (typeof key === "string") {
    return key;
  }
  throw new Error("exportPublicKey: 無効な鍵形式です");
}

/**
 * PEM文字列の公開鍵を内部で使用可能な形式にインポートする
 * パートナーの公開鍵をDBから取得した際に使用する
 */
export async function importPublicKey(pemPublicKey: string): Promise<string> {
  // バリデーション: PEM形式かどうかチェック
  if (!pemPublicKey.includes("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("importPublicKey: PEM形式の公開鍵ではありません");
  }
  // react-native-quick-crypto はPEM文字列をそのまま受け付けるため、検証後に返す
  return pemPublicKey;
}

// ============================================================
// ハイブリッド暗号化（Encrypt）
// ============================================================

/**
 * パートナーの公開鍵を使ってテキストを暗号化する
 *
 * 【処理フロー】
 * 1. AES-256-GCM のセッション鍵（32バイト）とIV（12バイト）を乱数生成
 * 2. 平文をセッション鍵で暗号化 → ciphertext
 * 3. セッション鍵をパートナーの公開鍵（RSA-OAEP）で暗号化 → encryptedSessionKey
 * 4. {ciphertext, iv, encryptedSessionKey} を返す（平文はここで消える）
 *
 * @param plaintext - 暗号化する日記本文（平文）
 * @param partnerPublicKeyPem - パートナーのRSA公開鍵（PEM形式）
 */
export async function encryptForPartner(
  plaintext: string,
  partnerPublicKeyPem: string
): Promise<EncryptedPayload> {
  // Step 1: ランダムなAESセッション鍵とIVを生成
  // なぜ毎回乱数生成するか: 固定IVは既知平文攻撃に対して脆弱になるため
  const sessionKey = crypto.randomBytes(AES_KEY_BITS / 8); // 32バイト
  const iv = crypto.randomBytes(AES_IV_BYTES); // 12バイト

  // Step 2: 平文をUTF-8バイト列に変換してAES-GCMで暗号化
  const plaintextBytes = Buffer.from(plaintext, "utf-8");
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextBytes),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // GCMの認証タグ（改ざん検知用）

  // 認証タグを暗号文に付加する（復号時に完全性を検証するため）
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  // Step 3: セッション鍵をパートナーの公開鍵で暗号化
  // RSA-OAEP を使用する（旧来のPKCS#1v1.5はパディングオラクル攻撃に脆弱なため不採用）
  const encryptedSessionKey = crypto.publicEncrypt(
    {
      key: partnerPublicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: RSA_HASH,
    },
    sessionKey
  );

  return {
    ciphertext: ciphertextWithTag.toString("base64"),
    iv: iv.toString("base64"),
    encryptedSessionKey: encryptedSessionKey.toString("base64"),
  };
}

// ============================================================
// ハイブリッド復号化（Decrypt）
// ============================================================

/**
 * 自分の秘密鍵を使って暗号化されたペイロードを復号する
 *
 * 【処理フロー】
 * 1. 秘密鍵（RSA-OAEP）でencryptedSessionKeyを復号 → AESセッション鍵
 * 2. AESセッション鍵でciphertextを復号 → 平文
 * 3. GCMの認証タグ検証により、改ざんがあれば自動的にエラーを投げる
 *
 * @param payload - encryptForPartner が生成した暗号化ペイロード
 * @param myPrivateKeyPem - 自分のRSA秘密鍵（PEM形式）。Secure Storeから取得
 */
export async function decryptFromPartner(
  payload: EncryptedPayload,
  myPrivateKeyPem: string
): Promise<string> {
  const { ciphertext, iv, encryptedSessionKey } = payload;

  // Step 1: 秘密鍵でセッション鍵を復号
  // 他人の秘密鍵では復号できず、エラーが発生する（セキュリティの核心）
  const sessionKey = crypto.privateDecrypt(
    {
      key: myPrivateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: RSA_HASH,
    },
    Buffer.from(encryptedSessionKey, "base64")
  );

  // Step 2: AES-GCMでciphertextを復号
  const ivBuffer = Buffer.from(iv, "base64");
  const ciphertextBuffer = Buffer.from(ciphertext, "base64");

  // 末尾16バイトが認証タグ（GCMのデフォルト）、それ以前が暗号文本体
  const AUTH_TAG_BYTES = 16;
  const encryptedData = ciphertextBuffer.subarray(
    0,
    ciphertextBuffer.length - AUTH_TAG_BYTES
  );
  const authTag = ciphertextBuffer.subarray(
    ciphertextBuffer.length - AUTH_TAG_BYTES
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey, ivBuffer);
  decipher.setAuthTag(authTag);

  // GCMモードでは、authTagが一致しない場合（改ざん検知）にここでエラーが発生する
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}
