-- pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- foodsテーブルにエンベディングカラムを追加
ALTER TABLE foods 
ADD COLUMN IF NOT EXISTS name_embedding vector(1536);

-- コメントを追加
COMMENT ON COLUMN foods.name_embedding IS '食品名と備考をエンベディングAPIでベクトル化したデータ（1536次元）。意味的な類似性検索に使用。';

-- 注意: ivfflatインデックスは、エンベディングデータが投入された後に
-- 別のマイグレーション（20250103000002_create_vector_index.sql）で作成してください。
-- 理由: ivfflatは既存データをサンプリングしてクラスタを計算するため、
-- データが存在しない状態では作成できません。

