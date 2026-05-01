-- ============================================================
-- Tsumugu 初期スキーマ定義
-- 基本設計書 §3「データモデル定義」に完全準拠
-- ============================================================

-- uuid_generate_v4() を有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Pair テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS "Pair" (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- User テーブル
-- PRD §4「既読機能を一切持たない」に従い、isRead系カラムは一切作成しない
-- ============================================================
CREATE TABLE IF NOT EXISTS "User" (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "pairId"    UUID REFERENCES "Pair"(id),
  "publicKey" TEXT NOT NULL,               -- E2EE用RSA公開鍵（PEM形式）
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Journal テーブル
-- E2EE: encryptedNote はサーバー側で復号不可
-- ============================================================
CREATE TABLE IF NOT EXISTS "Journal" (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "authorId"       UUID NOT NULL REFERENCES "User"(id),
  "pairId"         UUID NOT NULL REFERENCES "Pair"(id),
  "encryptedNote"  TEXT NOT NULL,          -- クライアント側で暗号化済み本文
  "metadataJson"   JSONB NOT NULL,         -- AIが抽出したメタデータ（平文OK）
  -- タイムカプセル機能用: 「〇年前の今日」クエリに使用する仮想インデックスカラム
  "monthDay"       VARCHAR(5) NOT NULL,    -- "MM-DD" 形式
  "recordedAt"     TIMESTAMPTZ NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- パフォーマンス: ジャーナル一覧取得（pairId + 時系列順）
CREATE INDEX IF NOT EXISTS idx_journal_pair_recorded
  ON "Journal"("pairId", "recordedAt" DESC);

-- パフォーマンス: タイムカプセル機能（「On This Day」クエリ）
CREATE INDEX IF NOT EXISTS idx_journal_pair_monthday
  ON "Journal"("pairId", "monthDay");

-- ============================================================
-- Reaction テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS "Reaction" (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "authorId"  UUID NOT NULL REFERENCES "User"(id),
  "journalId" UUID NOT NULL REFERENCES "Journal"(id),
  "fxType"    VARCHAR(20) NOT NULL CHECK ("fxType" IN ('petal', 'light', 'breeze')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS) の有効化
-- ペアのメンバー以外は一切データにアクセスできない
-- ============================================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pair" ENABLE ROW LEVEL SECURITY;

-- ジャーナルはペアメンバーのみ参照可能
CREATE POLICY "journal_pair_access" ON "Journal"
  FOR ALL
  USING (
    "pairId" IN (
      SELECT "pairId" FROM "User" WHERE id = auth.uid()
    )
  );

-- リアクションはペアメンバーのみ
CREATE POLICY "reaction_pair_access" ON "Reaction"
  FOR ALL
  USING (
    "journalId" IN (
      SELECT id FROM "Journal"
      WHERE "pairId" IN (
        SELECT "pairId" FROM "User" WHERE id = auth.uid()
      )
    )
  );
