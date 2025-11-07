# generate-embeddings Function

`foods`テーブルの全食品に対して、エンベディングAPIを使用してベクトルデータを生成し、`name_embedding`カラムに保存するSupabase Edge Functionです。

## 概要

- OpenAI Embeddings API (`text-embedding-3-small`) を使用して食品名と備考をベクトル化（1536次元）
- 生成したベクトルを`foods.name_embedding`カラムに保存
- タイムアウト対策のため、デフォルトで100件ずつ処理（複数回実行が必要）
- 既にエンベディングが生成済みの食品は自動的にスキップ

## 環境変数の設定

### 必須環境変数

- `OPENAI_API_KEY`: OpenAI API Key（必須）

### リモートDB接続（ローカル実行時）

- `REMOTE_SUPABASE_URL`: リモートSupabaseプロジェクトのURL
- `REMOTE_SUPABASE_SERVICE_ROLE_KEY`: リモートSupabaseのService Role Key

### 設定方法

#### 方法1: `.env`ファイルを使用（推奨）

`supabase/.env`ファイルを作成：

```bash
OPENAI_API_KEY=sk-your-openai-api-key
REMOTE_SUPABASE_URL=https://your-project-ref.supabase.co
REMOTE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### 方法2: 環境変数として直接設定

```bash
export OPENAI_API_KEY="sk-your-key"
export REMOTE_SUPABASE_URL="https://your-project-ref.supabase.co"
export REMOTE_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## 実行方法

### 1. Functionsを起動

```bash
cd supabase
supabase functions serve --env-file .env
```

### 2. エンベディング生成を実行

別のターミナルで実行：

```bash
# デフォルト（100件処理）
curl -X POST "http://127.0.0.1:54321/functions/v1/generate-embeddings" \
  -H "Authorization: Bearer sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"

# カスタム件数（最大500件まで）
curl -X POST "http://127.0.0.1:54321/functions/v1/generate-embeddings?max_process=200" \
  -H "Authorization: Bearer sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
```

### 3. 繰り返し実行

レスポンスの`remaining`が0になるまで、同じコマンドを繰り返し実行してください。

**例（自動化スクリプト）:**

```bash
#!/bin/bash
while true; do
  response=$(curl -s -X POST "http://127.0.0.1:54321/functions/v1/generate-embeddings?max_process=100" \
    -H "Authorization: Bearer sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz")
  
  remaining=$(echo "$response" | jq -r '.remaining // 0')
  echo "残り: $remaining 件"
  
  if [ "$remaining" = "0" ] || [ "$remaining" = "null" ]; then
    echo "完了！"
    break
  fi
  
  sleep 2
done
```

## レスポンス例

```json
{
  "message": "エンベディング生成を進めました（一部のみ）",
  "total": 2538,
  "processed": 100,
  "remaining": 2438,
  "success": 100,
  "errors": 0,
  "nextStep": "⚠️ 次のステップ: ベクトル検索を高速化するため、マイグレーション 20250103000002_create_vector_index.sql を実行してインデックスを作成してください。",
  "continueMessage": "残り 2438 件を処理するには、再度このFunctionを呼び出してください。"
}
```

## パラメータ

### クエリパラメータ

- `max_process` (オプション): 一度に処理する最大件数
  - デフォルト: `100`
  - 最大値: `500`
  - タイムアウト対策のため、大きな値を設定する場合は注意

## 実行後の確認

```sql
-- エンベディング生成状況を確認
SELECT 
  COUNT(*) as total_foods,
  COUNT(name_embedding) as foods_with_embedding,
  COUNT(*) - COUNT(name_embedding) as foods_without_embedding
FROM foods;
```

## 次のステップ

### 1. ベクトル検索用インデックスの作成

エンベディング生成が完了したら、ベクトル検索用インデックスを作成してください：

```bash
# マイグレーションを実行
supabase db push

# または、SQLを直接実行
supabase db connect --project-ref your-project-ref
# SQL: マイグレーションファイル 20250103000002_create_vector_index.sql の内容を実行
```

### 2. 画像解析APIのテスト

エンベディングとインデックスが準備できたら、`analyze-image`関数で画像解析をテストできます：

```bash
# analyze-image関数をテスト
curl -X POST "http://127.0.0.1:54321/functions/v1/analyze-image" \
  -H "Authorization: Bearer sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz" \
  -F "image=@/path/to/your/test-image.jpg"
```

詳細は [`analyze-image/README.md`](../analyze-image/README.md) を参照してください。

## トラブルシューティング

### エラー: `OPENAI_API_KEYが設定されていません`

環境変数が正しく設定されているか確認してください。

### タイムアウトエラー

`max_process`パラメータで処理件数を減らしてください（例: `max_process=50`）。

### エンベディングが生成されない

- データベース接続を確認（`REMOTE_SUPABASE_URL`と`REMOTE_SUPABASE_SERVICE_ROLE_KEY`が正しいか）
- Functionsのログでエラー内容を確認

