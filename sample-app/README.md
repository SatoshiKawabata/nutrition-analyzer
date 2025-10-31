# 栄養価計算サンプルアプリ

Supabase 上に構築した日本食品標準成分表データベースを用いて、100 g あたりの栄養値を検索・換算する React + Vite 製のサンプルアプリです。

## セットアップ

1. 依存パッケージをインストールします。
   ```bash
   pnpm install
   ```
2. Supabase のエンドポイントを `.env` に設定します（`.env.example` をコピー）。
   ```bash
   cp .env.example .env
   # .env を開き、VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を入力
   ```
3. 開発サーバーを起動します。
   ```bash
   pnpm dev
   ```

## 主な機能

- 食品名・食品群名による候補検索（最大 20 件）
- 検索結果から食品を選び、重量 (g) を入力すると栄養素列を自動換算
- 行の追加・削除、合計栄養値の算出
- CSV ヘッダー構造を踏襲した多段テーブル

## 補足

- 栄養値の換算は 100 g あたりの値を基準に `入力重量 / 100` を掛けて算出しています。
- Supabase 側で匿名権限に `foods`, `food_groups`, `food_nutrient_values`, `nutrient_components` の参照権限が必要です。
