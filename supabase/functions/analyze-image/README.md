# analyze-image Function

画像をアップロードして、写っている食品を特定し、重量を推定する Supabase Edge
Function です。

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

`.env.example`をコピーして`.env`ファイルを作成し、実際の値を設定します：

```bash
# OpenAI API Key（必須）
OPENAI_API_KEY=sk-your-actual-api-key-here

# Supabase URL（ローカル環境の場合）
SUPABASE_URL=http://127.0.0.1:54321

# Supabase Service Role Key（ローカル環境が起動している場合）
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**注意**: `.env`ファイルは`.gitignore`に含まれているため、Git
にはコミットされません。

**重要**:
`SUPABASE_`で始まる環境変数（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`など）は、Supabase
CLI
が自動的にスキップします。これらはローカル環境では`supabase start`で自動設定されるため、`.env`ファイルには含めないでください（`.env`ファイルには`OPENAI_API_KEY`のみを含めてください）。

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

ローカルで Function を起動しつつ、リモートの Supabase
データベースに接続する場合：

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
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Functionを起動
supabase functions serve analyze-image --no-verify-jwt --env-file .env
```

**注意**:
`SUPABASE_`で始まる環境変数は`--env-file`オプションでスキップされるため、以下のいずれかの方法を使用してください。

**方法 A: 環境変数として直接設定（推奨）**

```bash
OPENAI_API_KEY="sk-your-key" \
SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
supabase functions serve analyze-image --no-verify-jwt
```

**方法 B: .env ファイルに別名で設定**

`.env`ファイルに以下を設定：

```bash
OPENAI_API_KEY=sk-your-key
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

**注意**: `export`で設定した環境変数は、`supabase functions serve`実行時に Edge
Runtime に渡されない場合があります。`--env-file`オプションの使用を推奨します。

### トラブルシューティング

**エラー: `OpenAI API key is not configured`**

1. Function を起動したターミナルで環境変数が設定されているか確認：

   ```bash
   echo $OPENAI_API_KEY
   ```

2. 設定されていない場合、同じターミナルで設定してから再起動：

   ```bash
   export OPENAI_API_KEY="sk-your-key"
   supabase functions serve analyze-image --no-verify-jwt
   ```

3. または、一行で実行：
   ```bash
   OPENAI_API_KEY="sk-your-key" supabase functions serve analyze-image --no-verify-jwt
   ```

### 4. テストリクエストの送信

別のターミナルで以下のコマンドを実行：

```bash
curl -X POST http://localhost:54321/functions/v1/analyze-image \
  -H "Content-Type: multipart/form-data" \
  -F "image=@/path/to/your/image.jpg"
```

または、ブラウザでテストする場合は、HTML フォームを使用：

```html
<form
  action="http://localhost:54321/functions/v1/analyze-image"
  method="POST"
  enctype="multipart/form-data"
>
  <input type="file" name="image" accept="image/*" />
  <button type="submit">送信</button>
</form>
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
