# Supabase接続確認方法

## 問題：foodsテーブルからデータが0件

Edge FunctionがSupabaseのDBに正しく接続できていない可能性があります。

## 確認方法

### 1. ローカル環境の場合

#### 現在の接続情報を確認

```bash
# Supabaseローカル環境の状態を確認
supabase status

# 出力例：
# API URL: http://127.0.0.1:54321
# service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Edge Functionのログで接続情報を確認

Functionを実行した際のログで以下を確認：

- `[DEBUG] Supabase URL:` - 実際に使用されているURL
- `[DEBUG] Service Role Key（最初の20文字）:` - 実際に使用されているKeyの一部

#### ローカル環境で自動設定される環境変数

ローカル環境では、Supabase CLIが自動的に以下を設定します：

- `SUPABASE_URL`: `http://kong:8000` （コンテナ内部から見たURL）
- `SUPABASE_SERVICE_ROLE_KEY`: ローカル環境のService Role Key

しかし、Edge Function内でこれらが正しく読み込まれていない場合があります。

### 2. リモート環境の場合

リモート環境を使用している場合は、正しいURLとService Role
Keyを設定する必要があります：

```bash
# リモート環境のURLとKeyを確認
supabase projects list
supabase projects api-keys --project-ref YOUR_PROJECT_REF
```

### 3. 接続先の確認方法

#### 方法1: ログで確認

Functionを実行して、ログに表示される以下を確認：

- `[DEBUG] Supabase URL:` - 実際に使用されているURL
- `[DEBUG] Service Role Key（最初の20文字）:` - 実際に使用されているKey

#### 方法2: データベースに直接接続して確認

```bash
# ローカル環境の場合
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "SELECT COUNT(*) FROM foods;"

# リモート環境の場合
supabase db connect
# その後、SQLを実行
SELECT COUNT(*) FROM foods;
```

### 4. よくある問題

#### 問題1: ローカル環境のURLが間違っている

**症状**: ログに `http://kong:8000` と表示されるが、データが取得できない

**原因**: Edge
Functionがコンテナ内部から見たURLを使っているが、実際のデータベースに接続できていない

**解決方法**:

- ローカル環境では `http://127.0.0.1:54321` を使用する必要がある場合があります
- または、Supabase CLIが自動設定する環境変数を確認

#### 問題2: Service Role Keyが間違っている

**症状**: 認証エラーが発生する

**解決方法**:

- `supabase status` で正しいService Role Keyを確認
- Edge Functionのログで実際に使用されているKeyを確認

#### 問題3: リモート環境とローカル環境を混同している

**症状**: ローカル環境を起動しているのに、リモート環境のURLを使っている

**解決方法**:

- ローカル環境を使う場合: `supabase start` を実行して、ローカル環境のURLを使用
- リモート環境を使う場合: リモート環境のURLとService Role Keyを正しく設定

## デバッグ用のログ追加

`index.ts`にデバッグログを追加しました。Functionを実行すると、以下の情報が表示されます：

- 接続先のURL
- Service Role Keyの一部（最初の20文字）
- エラー発生時の詳細情報
- 取得した食品の例（最初の3件）

これらを確認して、接続先が正しいか判断してください。
