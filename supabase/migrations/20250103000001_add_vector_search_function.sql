-- ベクトル検索用のRPC関数
-- クエリベクトルと類似度閾値を受け取り、類似食品を返す
CREATE OR REPLACE FUNCTION search_foods_by_vector(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name_jp text,
  remarks text,
  food_code text,
  index_code text,
  group_id uuid,
  similarity float,
  food_group jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  validated_match_count int;
  validated_match_threshold float;
BEGIN
  -- パラメータのバリデーションと正規化
  -- NULLチェック: COALESCEでデフォルト値を設定してから正規化
  -- match_count: NULL/負の値/0の場合はデフォルト値200にし、その後1以上に制限
  validated_match_count := GREATEST(COALESCE(match_count, 200), 1);
  
  -- match_threshold: NULLの場合はデフォルト値0.7にし、その後0.0-1.0の範囲に制限
  validated_match_threshold := GREATEST(0.0, LEAST(1.0, COALESCE(match_threshold, 0.7)));
  
  RETURN QUERY
  SELECT
    f.id,
    f.name_jp,
    f.remarks,
    f.food_code,
    f.index_code,
    f.group_id,
    1 - (f.name_embedding <=> query_embedding) AS similarity,
    jsonb_build_object(
      'name_jp', fg.name_jp,
      'group_code', fg.group_code,
      'original_sort_order', fg.original_sort_order
    ) AS food_group
  FROM foods f
  JOIN food_groups fg ON f.group_id = fg.id
  WHERE f.name_embedding IS NOT NULL
    AND 1 - (f.name_embedding <=> query_embedding) > validated_match_threshold
  ORDER BY f.name_embedding <=> query_embedding
  LIMIT validated_match_count;
END;
$$;

-- 関数のコメントを追加
COMMENT ON FUNCTION search_foods_by_vector IS 
'クエリベクトルに基づいて類似度の高い食品を検索する関数。
query_embedding: 検索クエリのベクトル（1536次元）
match_threshold: 類似度の閾値（0.0-1.0、デフォルト0.7）。NULL、負の値、1.0を超える値は自動的に正規化されます。
match_count: 返す最大件数（デフォルト200）。NULL、負の値、0は自動的に正規化されます（NULL/負/0 → 200 → 200、それ以外の負/0 → 1）。
コサイン類似度でソートされ、類似度が高い順に返されます。';

