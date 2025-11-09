# analyze-image Function

画像をアップロードして、写っている食品を特定し、重量を推定する Supabase Edge Function です。

**注意**: この関数は全食品リストをプロンプトに含める方式です。エンベディング検索を使用する版は `analyze-image-with-embedding` を参照してください。

## 機能

- 画像から食品を特定
- 各食品の重量を推定（グラム単位）
- 日本食品標準成分表に基づいた食品データベースから検索

## 処理フロー

1. 画像をBase64形式に変換
2. データベースから全食品リストを取得（最大3000件、ページネーション対応）
3. 全食品リストをプロンプトに含めて、AIに画像分析を依頼
4. 検出された食品と推定重量をJSON形式で返却

## ローカルでの動作確認方法

### 1. 環境変数の設定

**重要**: Function を起動する前に、環境変数を設定する必要があります。

#### 方法 A: シェルで直接設定（推奨）

Function を起動するターミナルで以下を実行：

```bash
# OpenAI API Key（必須）
export OPENAI_API_KEY="sk-your-actual-api-key-here"

# Supabase URL（ローカル環境の場合）
export SUPABASE_URL="http://127.0.0.1:54321"

# Supabase Service Role Key（ローカル環境が起動している場合）
# supabase status で確認できます
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

#### 方法 B: .env ファイルを使用（推奨）

`supabase/`ディレクトリに`.env`ファイルを作成：

```bash
cd supabase
cp .env.example .env
# .env ファイルを編集して、実際の値を設定してください
```

`.env`ファイルを作成し、実際の値を設定します：

```bash
# AIプロバイダーの選択（google または openai、デフォルト: google）
AI_PROVIDER=google

# Google AI API Key（AI_PROVIDER=googleの場合に必要）
# Google AI Studio (https://ai.google.dev/) で取得
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key-here
# または
# GOOGLE_AI_API_KEY=your-google-api-key-here

# OpenAI API Key（AI_PROVIDER=openaiの場合に必要）
# OpenAI Platform (https://platform.openai.com/) で取得
OPENAI_API_KEY=sk-your-openai-api-key-here
# または
# AI_OPENAI_API_KEY=sk-your-openai-api-key-here

# Supabase設定（リモート環境を使用する場合）
# ローカルでFunctionを起動しつつ、リモートのSupabase DBに接続する場合
REMOTE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
REMOTE_SUPABASE_SERVICE_ROLE_KEY=your-remote-service-role-key

# デバッグ設定（オプション）
# プロンプト全文をコンソールに出力する場合は true に設定
DEBUG_PROMPT=false
```

**注意**: 
- ローカル環境を使用する場合、`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`は`supabase start`で自動設定されるため、`.env`ファイルには含めないでください
- `AI_PROVIDER`で選択したプロバイダーのAPIキーを設定してください（両方設定しても問題ありません）

**注意**: `.env`ファイルは`.gitignore`に含まれているため、Git にはコミットされません。

**重要**:
- `SUPABASE_`で始まる環境変数（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`など）は、Supabase CLI が自動的にスキップします。これらはローカル環境では`supabase start`で自動設定されるため、`.env`ファイルには含めないでください
- `AI_PROVIDER`で選択したプロバイダーのAPIキーを設定してください（例: `AI_PROVIDER=google`の場合は`GOOGLE_GENERATIVE_AI_API_KEY`を設定）

### 2. Supabase データベースへの接続設定

#### ローカル環境を使用する場合

データベースから食品リストを取得する場合のみ必要です：

```bash
supabase start
```

起動後、`supabase status`で環境変数を確認できます：

```bash
supabase status
# API URL と service_role key が表示されます
```

#### リモート環境を使用する場合（ローカルで Function を起動）

ローカルで Function を起動しつつ、リモートの Supabase データベースに接続する場合：

1. **リモート環境の URL と Service Role Key を取得**

```bash
# プロジェクト一覧を確認
supabase projects list

# プロジェクトのAPIキーを取得
supabase projects api-keys --project-ref YOUR_PROJECT_REF
```

または、Supabase ダッシュボードから：

- **Settings** → **API** → **Project URL** と **service_role** key を確認

2. **環境変数を設定**

リモート環境の URL と Service Role Key を環境変数として設定します：

```bash
# リモート環境のURLとService Role Keyを設定
export REMOTE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export REMOTE_SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**注意**:
`SUPABASE_`で始まる環境変数は`--env-file`オプションでスキップされるため、以下のいずれかの方法を使用してください。

**方法 A: 環境変数として直接設定（推奨）**

```bash
OPENAI_API_KEY="sk-your-key" \
REMOTE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
REMOTE_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
supabase functions serve analyze-image --no-verify-jwt
```

**方法 B: .env ファイルに設定**

`.env`ファイルに以下を設定：

```bash
# AIプロバイダーの選択
AI_PROVIDER=google

# 選択したプロバイダーのAPIキー
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key
# または OpenAI を使用する場合
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-your-openai-api-key

# リモート環境の設定
REMOTE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
REMOTE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

コードは自動的に`REMOTE_SUPABASE_URL`と`REMOTE_SUPABASE_SERVICE_ROLE_KEY`も読み込みます。

### 3. Function の起動

#### .env ファイルを使用する場合（推奨）

`.env`ファイルを作成済みの場合、`--env-file`オプションを使用して実行：

```bash
cd supabase
supabase functions serve analyze-image --no-verify-jwt --env-file .env
```

これで、`.env`ファイルの環境変数が Edge Runtime に正しく渡されます。

#### 環境変数を直接設定する場合

`.env`ファイルを使わない場合、環境変数を設定してから実行：

```bash
export OPENAI_API_KEY="sk-your-key"
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
supabase functions serve analyze-image --no-verify-jwt
```

**注意**: `export`で設定した環境変数は、`supabase functions serve`実行時に Edge Runtime に渡されない場合があります。`--env-file`オプションの使用を推奨します。

### トラブルシューティング

**エラー: `AI API key is not configured`**

1. `.env`ファイルで`AI_PROVIDER`が正しく設定されているか確認：

   ```bash
   # Google AIを使用する場合
   AI_PROVIDER=google
   GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key
   
   # OpenAIを使用する場合
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-your-openai-api-key
   ```

2. Function を起動したターミナルで環境変数が設定されているか確認：

   ```bash
   echo $AI_PROVIDER
   echo $GOOGLE_GENERATIVE_AI_API_KEY  # Google AIを使用する場合
   echo $OPENAI_API_KEY                # OpenAIを使用する場合
   ```

3. 設定されていない場合、`.env`ファイルを確認してから再起動：

   ```bash
   supabase functions serve analyze-image --no-verify-jwt --env-file .env
   ```

### 4. テストリクエストの送信

別のターミナルで以下のコマンドを実行：

```bash
curl -X POST http://localhost:54321/functions/v1/analyze-image \
  -H "Content-Type: multipart/form-data" \
  -F "image=@/path/to/your/image.jpg"
```

または、ブラウザでテストする場合は、`test.html`を使用：

```bash
# ブラウザで test.html を開く
open supabase/functions/analyze-image/test.html
```

## リクエスト形式

- **Method**: POST
- **Content-Type**: multipart/form-data
- **Body**: `image`フィールドに画像ファイルを含める

## レスポンス形式

```json
{
  "detections": [
    {
      "foodId": "string",
      "nameJp": "string",
      "weightGrams": number,
      "confidence": number (0.0-1.0),
      "notes": "string | null"
    }
  ]
}
```

## プロンプトの確認方法

プロンプトの内容を確認したい場合は、環境変数`DEBUG_PROMPT=true`を設定してください：

```bash
DEBUG_PROMPT=true supabase functions serve analyze-image --no-verify-jwt
```

これにより、プロンプトの全文がログに出力されます。

## AIプロバイダーの切り替え

環境変数`AI_PROVIDER`で、Google GeminiとOpenAI GPTを切り替えできます：

- **Google Gemini（デフォルト）**: `AI_PROVIDER=google`
  - モデル: `gemini-2.0-flash`
  - APIキー: `GOOGLE_GENERATIVE_AI_API_KEY`または`GOOGLE_AI_API_KEY`
  
- **OpenAI GPT**: `AI_PROVIDER=openai`
  - モデル: `gpt-4o-mini`
  - APIキー: `OPENAI_API_KEY`または`AI_OPENAI_API_KEY`

## 注意事項

- 全食品リストをプロンプトに含めるため、プロンプトサイズが大きくなります（約240KB程度）
- AIモデルのコンテキストウィンドウ制限内に収まるよう、食品数は最大3000件に制限しています
- より効率的な検索を希望する場合は、`analyze-image-with-embedding`（エンベディング検索版）の使用を検討してください

