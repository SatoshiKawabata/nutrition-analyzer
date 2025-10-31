-- 日本食品標準成分表（八訂・増補 2023）データベース スキーマ
-- Supabase/PostgreSQL 15 を想定

-- uuid_generate_v4 を使う場合のみ
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

SET search_path = public;

-- 更新日時を自動更新する共通トリガー
CREATE OR REPLACE FUNCTION set_timestamptz_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE data_sources (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  file_name text NOT NULL,
  publish_date date,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON data_sources
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE food_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  group_code text NOT NULL,
  name_jp text NOT NULL,
  original_sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (data_source_id, group_code)
);

CREATE TRIGGER trg_food_groups_updated_at
  BEFORE UPDATE ON food_groups
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE foods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  food_code text NOT NULL,
  index_code text NOT NULL,
  group_id uuid NOT NULL REFERENCES food_groups(id) ON DELETE RESTRICT,
  name_jp text NOT NULL,
  waste_rate numeric(5,2),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (data_source_id, food_code),
  UNIQUE (data_source_id, index_code)
);

CREATE INDEX idx_foods_group_id ON foods (group_id);

CREATE TRIGGER trg_foods_updated_at
  BEFORE UPDATE ON foods
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE raw_snapshots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (food_id)
);

CREATE TRIGGER trg_raw_snapshots_updated_at
  BEFORE UPDATE ON raw_snapshots
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE nutrient_components (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  component_code text NOT NULL,
  group_1_name_ja text NOT NULL,
  group_2_name_ja text,
  group_3_name_ja text,
  unit text,
  category text NOT NULL,
  has_flag boolean NOT NULL DEFAULT FALSE,
  original_sort_order integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (data_source_id, component_code)
);

CREATE INDEX idx_nutrient_components_category
  ON nutrient_components (category, component_code);

CREATE TRIGGER trg_nutrient_components_updated_at
  BEFORE UPDATE ON nutrient_components
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE value_annotation_defs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  meaning text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (data_source_id, symbol)
);

CREATE TRIGGER trg_value_annotation_defs_updated_at
  BEFORE UPDATE ON value_annotation_defs
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

CREATE TABLE food_nutrient_values (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES nutrient_components(id) ON DELETE CASCADE,
  value_numeric numeric,
  value_raw text NOT NULL,
  value_annotation_id uuid REFERENCES value_annotation_defs(id) ON DELETE SET NULL,
  in_parentheses boolean NOT NULL DEFAULT FALSE,
  is_tr boolean NOT NULL DEFAULT FALSE,
  is_missing boolean NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (data_source_id, food_id, component_id)
);

CREATE INDEX idx_food_nutrient_values_food_component
  ON food_nutrient_values (food_id, component_id);

CREATE INDEX idx_food_nutrient_values_component
  ON food_nutrient_values (component_id);

CREATE TRIGGER trg_food_nutrient_values_updated_at
  BEFORE UPDATE ON food_nutrient_values
  FOR EACH ROW
  EXECUTE PROCEDURE set_timestamptz_updated_at();

-- 食品×成分の最新値を横持ちで確認するビュー（分析用）
CREATE OR REPLACE VIEW vw_food_nutrient_wide AS
SELECT
  f.id AS food_id,
  f.name_jp AS food_name_jp,
  f.food_code,
  nc.component_code,
  nc.group_1_name_ja,
  nc.group_2_name_ja,
  nc.group_3_name_ja,
  nc.unit,
  fnv.value_numeric,
  fnv.value_raw,
  fnv.in_parentheses,
  fnv.is_tr,
  fnv.is_missing,
  vad.symbol AS annotation_symbol
FROM food_nutrient_values fnv
JOIN foods f ON f.id = fnv.food_id
JOIN nutrient_components nc ON nc.id = fnv.component_id
LEFT JOIN value_annotation_defs vad ON vad.id = fnv.value_annotation_id;

COMMENT ON VIEW vw_food_nutrient_wide IS
  '食品ごとの各成分値をジョイン済みで参照できる分析用ビュー';
