# ETL ツール概要

このディレクトリには、日本食品標準成分表（八訂・増補 2023）の CSV
を正規化スキーマ向けに変換する簡易 ETL スクリプトと出力物がまとまっています。

## ディレクトリ構成

- `scripts/normalize_food_composition.py`\
  元 CSV を読み込み、`build/` 配下にテーブル別 CSV
  を生成します。内部で食品群・食品・成分・値・注記・スナップショットの JSON
  を切り出す処理を行います。
- `db/schema.sql`\
  Supabase/PostgreSQL 向けのテーブル定義。`normalize_food_composition.py`
  の出力とスキーマが対応しています。
- `build/`\
  スクリプト実行後の生成結果。`COPY`
  などでそのままデータベースに取り込める形式です。
- `data_sources/`\
  元となる CSV データ（八訂・増補 2023）。
- `specs/`\
  スキーマ設計やドキュメント。

## 使い方

```bash
python3 scripts/normalize_food_composition.py data_sources/日本食品標準成分表（八訂）増補2023年/20230428-mxt_kagsei-mext_00001_012_processed_v2.csv --output-dir build
```

上記コマンドで最新の CSV を再生成できます。必要に応じて `--data-source-id`
などのオプションで UUID やタイトルを指定してください。
