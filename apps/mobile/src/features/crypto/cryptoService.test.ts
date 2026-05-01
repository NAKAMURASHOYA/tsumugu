/**
 * cryptoService のBDDテスト（受入基準ベース）
 *
 * PRD §4 非機能要件「エンドツーエンドの暗号化を実装」に対応。
 * 基本設計書 §7「ユーザーは初回起動時にキーペアを生成。秘密鍵はSecure Enclaveに保存」に対応。
 */
import {
  generateKeyPair,
  encryptForPartner,
  decryptFromPartner,
  exportPublicKey,
  importPublicKey,
} from "./cryptoService";
import type { CryptoKeyPair, EncryptedPayload } from "../../types";

// ============================================================
// テストスイート 1: キーペア生成
// ============================================================
describe("generateKeyPair", () => {
  let keyPair: CryptoKeyPair;

  beforeAll(async () => {
    keyPair = await generateKeyPair();
  });

  it("公開鍵と秘密鍵の両方を返すこと", () => {
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
  });

  it("公開鍵がPEM形式（BEGIN PUBLIC KEY）であること", () => {
    expect(keyPair.publicKey).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(keyPair.publicKey).toMatch(/-----END PUBLIC KEY-----/);
  });

  it("秘密鍵がPEM形式（BEGIN PRIVATE KEY）であること", () => {
    expect(keyPair.privateKey).toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
  });

  it("生成するたびに異なるキーペアを返すこと（一意性の保証）", async () => {
    const anotherKeyPair = await generateKeyPair();
    // 同じキーが2回生成されることは天文学的に不可能だが、実装ミスを防ぐために確認する
    expect(keyPair.publicKey).not.toBe(anotherKeyPair.publicKey);
    expect(keyPair.privateKey).not.toBe(anotherKeyPair.privateKey);
  });
});

// ============================================================
// テストスイート 2: 暗号化と復号化（ラウンドトリップ）
// ============================================================
describe("encryptForPartner / decryptFromPartner", () => {
  let userAKeyPair: CryptoKeyPair;
  let userBKeyPair: CryptoKeyPair;
  const plaintext = "会議が長引いて、夕飯の支度が間に合わなかった。こういう日もある、と呟いてみる。";

  beforeAll(async () => {
    // ユーザーAとBがそれぞれキーペアを持つ（ペアリング済みの状態を想定）
    [userAKeyPair, userBKeyPair] = await Promise.all([
      generateKeyPair(),
      generateKeyPair(),
    ]);
  });

  it("暗号化した内容が元のテキストと異なること（平文が漏洩しないこと）", async () => {
    const encrypted = await encryptForPartner(plaintext, userBKeyPair.publicKey);
    expect(encrypted.ciphertext).not.toBe(plaintext);
    // Base64エンコードされた文字列であることを確認
    expect(encrypted.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("同じ平文を2回暗号化した場合、異なる暗号文になること（IVのランダム性）", async () => {
    // なぜこれが重要か: IVが固定だと攻撃者が暗号文を比較して
    // 「同じ内容が記録された」ことを推測できてしまう
    const encrypted1 = await encryptForPartner(plaintext, userBKeyPair.publicKey);
    const encrypted2 = await encryptForPartner(plaintext, userBKeyPair.publicKey);
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it("Bの秘密鍵でAが暗号化したメッセージを正常に復号できること（ラウンドトリップ）", async () => {
    // ユーザーAがユーザーBの公開鍵で暗号化
    const encrypted = await encryptForPartner(plaintext, userBKeyPair.publicKey);
    // ユーザーBが自分の秘密鍵で復号
    const decrypted = await decryptFromPartner(encrypted, userBKeyPair.privateKey);
    expect(decrypted).toBe(plaintext);
  });

  it("日本語テキストが正確に復号されること（Unicode対応）", async () => {
    const japaneseText = "窓の外の鳥の声で目が覚めた。あなたが淹れてくれた珈琲のかおり。🌿";
    const encrypted = await encryptForPartner(japaneseText, userBKeyPair.publicKey);
    const decrypted = await decryptFromPartner(encrypted, userBKeyPair.privateKey);
    expect(decrypted).toBe(japaneseText);
  });

  it("暗号化されたペイロードがciphertext・iv・encryptedSessionKeyの3フィールドを持つこと", async () => {
    const encrypted = await encryptForPartner(plaintext, userBKeyPair.publicKey);
    expect(encrypted).toHaveProperty("ciphertext");
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("encryptedSessionKey");
  });
});

// ============================================================
// テストスイート 3: エッジケース（復号失敗の検証）
// ============================================================
describe("decryptFromPartner — 異常系", () => {
  let userAKeyPair: CryptoKeyPair;
  let userBKeyPair: CryptoKeyPair;
  let encrypted: EncryptedPayload;
  const plaintext = "秘密のメッセージ";

  beforeAll(async () => {
    [userAKeyPair, userBKeyPair] = await Promise.all([
      generateKeyPair(),
      generateKeyPair(),
    ]);
    // Bの公開鍵で暗号化
    encrypted = await encryptForPartner(plaintext, userBKeyPair.publicKey);
  });

  it("関係のない第三者の秘密鍵では復号に失敗すること（セキュリティの核心）", async () => {
    // なぜ重要か: 義実家等の「第三者の監視を排除」するための基盤。
    // Bの公開鍵で暗号化されたメッセージはAの秘密鍵では絶対に復号できない。
    await expect(
      decryptFromPartner(encrypted, userAKeyPair.privateKey)
    ).rejects.toThrow();
  });

  it("改ざんされたciphertextの復号に失敗すること（完全性の保証）", async () => {
    // AES-GCMの認証タグにより、暗号文の改ざんを検出できる
    const tampered: EncryptedPayload = {
      ...encrypted,
      ciphertext: "dGFtcGVyZWQ=", // "tampered" のBase64
    };
    await expect(
      decryptFromPartner(tampered, userBKeyPair.privateKey)
    ).rejects.toThrow();
  });

  it("改ざんされたIVで復号に失敗すること", async () => {
    const tampered: EncryptedPayload = {
      ...encrypted,
      iv: Buffer.alloc(12, 0).toString("base64"), // ゼロ埋めの偽IV
    };
    await expect(
      decryptFromPartner(tampered, userBKeyPair.privateKey)
    ).rejects.toThrow();
  });
});

// ============================================================
// テストスイート 4: 公開鍵のエクスポート・インポート
// ============================================================
describe("exportPublicKey / importPublicKey", () => {
  it("PEM文字列として公開鍵をエクスポートし、再インポートして暗号化に使えること", async () => {
    const { publicKey, privateKey } = await generateKeyPair();
    // PEM → インポート → 暗号化 → 復号のラウンドトリップ
    const importedPublicKey = await importPublicKey(publicKey);
    const plaintext = "再インポートテスト";
    const exported = await exportPublicKey(importedPublicKey);
    const encrypted = await encryptForPartner(plaintext, exported);
    const decrypted = await decryptFromPartner(encrypted, privateKey);
    expect(decrypted).toBe(plaintext);
  });
});
