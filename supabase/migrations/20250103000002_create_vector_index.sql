-- ベクトル検索用インデックス作成
-- このマイグレーションは、エンベディングデータが投入された後に実行してください。
-- 
-- 実行前の確認:
-- 1. エンベディング生成スクリプト（generate-embeddings Function）を実行済みであること
-- 2. foodsテーブルにname_embeddingがNULLでないレコードが存在すること
--
-- 実行手順:
-- 1. エンベディング生成: supabase functions invoke generate-embeddings
-- 2. 統計情報更新: ANALYZE foods; （このマイグレーション内で実行）
-- 3. インデックス作成: このマイグレーションを実行

-- 統計情報を更新（ivfflatのクラスタ計算精度向上のため）
ANALYZE foods;

-- ベクトル検索用インデックス作成
-- ivfflatインデックス: 高速な近似ベクトル検索のため
-- lists = 100: 2538件のデータに対して適切なクラスタ数
-- データが存在しない場合はエラーになるため、事前にエンベディング生成が必要
CREATE INDEX IF NOT EXISTS idx_foods_name_embedding ON foods 
USING ivfflat (name_embedding vector_cosine_ops)
WITH (lists = 100)
WHERE name_embedding IS NOT NULL;

-- インデックス作成後の統計情報更新
ANALYZE foods;

