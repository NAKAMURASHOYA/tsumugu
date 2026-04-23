# AI Startup Template 🚀

このリポジトリは、AI部下チーム（Gemini, Claude Code, Claude Design, Antigravity）を活用して、超高速かつ安全にプロダクト開発を行うためのベーステンプレートです。

## 🏢 AIチーム組織図とCEO承認フロー

開発は以下のフェーズで進行し、各所でCEO（Human-in-the-Loop）の承認ゲートを設けています。

1. **【戦略・企画】 PM / CMO (Gemini)**
   * 要件定義書（PRD）を作成。
   * 🛑 **Gate 1:** CEOがビジネス要件をレビューし承認。
2. **【設計・UI/UX】 アーキテクト (Gemini) / UIUX (Claude Design)**
   * 基本設計書とプロトタイプを作成。
   * 🛑 **Gate 2:** CEOが技術仕様とデザインを承認。
3. **【コア実装】 テックリード (Claude Code)**
   * ターミナル上で実装計画を提示。
   * 🛑 **Gate 3:** CEOが実装計画とセキュリティ方針を承認後、コード生成開始。
4. **【品質保証】 テスター / AIエンジニア (Antigravity)**
   * テストの実行とバグ修正。
   * 🛑 **Gate 4:** CEOが動作確認を行い、本番デプロイ。

## 📂 ディレクトリ構成

* `docs/`: 各AI部下に与えるシステムプロンプト（指示書）を格納。
* `output_templates/`: AIに出力させるドキュメントのフォーマット（空枠）。
* `TECH_LEAD_RULES.md`: Claude Code起動時に必ず読み込ませる絶対ルール。
* `src/`: 実際のソースコード格納用ディレクトリ。

## 🚀 使い方 (新規プロジェクト立ち上げ時)

1. このリポジトリをテンプレートとして新規リポジトリを作成。
2. Geminiに `docs/01_PM_Prompt.md` を読み込ませ、アイデアを伝えて要件定義を作成。
3. 出力結果を `output_templates/PRD.md` に保存。
4. Geminiに `docs/02_Arch_Prompt.md` を読み込ませ、PRDを元に設計書を作成。
5. 出力結果を `output_templates/Architecture.md` に保存。
6. ターミナルで本ディレクトリを開き、以下を実行して実装開始。
   `claude "TECH_LEAD_RULES.mdを読み込んで、PRDと基本設計書に基づく実装計画を提示してください"`
