import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createOpenAI } from 'npm:@ai-sdk/openai@2.0.59';
import { generateObject, type CoreMessage } from 'npm:ai@5.0.86';
import { z } from 'npm:zod@3.25.76';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type FoodRecord = {
  id: string;
  name_jp: string;
  remarks: string | null;
  food_code: string | null;
};

const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const openAiApiKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_OPENAI_API_KEY');
// REMOTE_SUPABASE_URLを優先的に使用（リモート環境への接続）
// SUPABASE_URLはローカル環境で自動設定されるが、リモート環境を使う場合はREMOTE_を優先
const supabaseUrl = Deno.env.get('REMOTE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('REMOTE_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

console.log('[DEBUG] OpenAI API Key:', openAiApiKey ? '設定済み' : '未設定');
console.log('[DEBUG] Supabase URL:', supabaseUrl || '未設定');
console.log('[DEBUG] Service Role Key:', serviceRoleKey ? '設定済み' : '未設定');

if (!openAiApiKey) {
  console.warn('[WARN] OPENAI_API_KEY (または AI_OPENAI_API_KEY) が設定されていません。analyze-image function は失敗します。');
}

const openai = createOpenAI({
  apiKey: openAiApiKey ?? ''
});

const responseSchema = z.object({
  detections: z
    .array(
      z.object({
        foodId: z.string(),
        nameJp: z.string(),
        weightGrams: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
        notes: z.string().optional().nullable()
      })
    )
    .default([])
});

async function fetchFoods(): Promise<FoodRecord[]> {
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[WARN] Supabase認証情報が不足しています。空の食品リストを返します。');
    console.warn(`[WARN] SUPABASE_URL: ${supabaseUrl ? '設定済み' : '未設定'}`);
    console.warn(`[WARN] SUPABASE_SERVICE_ROLE_KEY: ${serviceRoleKey ? '設定済み' : '未設定'}`);
    return [];
  }

  console.log(`[DEBUG] Supabaseに接続中: ${supabaseUrl}`);
  console.log(`[DEBUG] Service Role Key（最初の20文字）: ${serviceRoleKey.substring(0, 20)}...`);
  
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  console.log('[DEBUG] foodsテーブルからデータを取得中...');
  const { data, error } = await supabase
    .from('foods')
    .select('id, name_jp, remarks, food_code')
    .limit(120);

  if (error) {
    console.error('[ERROR] プロンプト用の食品リスト取得に失敗しました:', error);
    console.error('[ERROR] エラー詳細:', JSON.stringify(error, null, 2));
    console.error(`[ERROR] 接続URL: ${supabaseUrl}`);
    console.error(`[ERROR] Service Role Key（最初の20文字）: ${serviceRoleKey.substring(0, 20)}...`);
    return [];
  }

  console.log(`[DEBUG] データベースから ${data?.length ?? 0} 件の食品を取得しました`);
  if (data && data.length > 0) {
    console.log(`[DEBUG] 取得した食品の例（最初の3件）:`, data.slice(0, 3).map(f => f.name_jp));
  }
  return data ?? [];
}

function buildPrompt(foods: FoodRecord[]): string {
  const payload = {
    foods: foods.map((food) => ({
      id: food.id,
      name_jp: food.name_jp,
      food_code: food.food_code,
      remarks: food.remarks
    })),
    instructions: {
      goal:
        '入力画像に写っている食品をリストから特定し、それぞれのおおよその重量(g)を推定してください。リストに無い食品は無理に推定しなくて構いません。',
      return_format: {
        type: 'json',
        schema: [
          {
            foodId: 'string (foods[].id)',
            nameJp: 'string',
            weightGrams: 'number',
            confidence: '0.0-1.0',
            notes: 'optional string'
          }
        ]
      },
      rules: [
        '必ず JSON のみを返してください。プレーンテキストや説明は含めないでください。',
        '候補が無い場合は空配列 [] を返してください。',
        '重量は g 単位で一つの数値として回答してください。',
        '食品リストの備考欄が役立つ場合は参照して構いません。'
      ]
    }
  };

  return JSON.stringify(payload);
}

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] 📥 リクエスト受信: ${req.method} ${req.url}`);
  
  if (req.method === 'OPTIONS') {
    console.log('[DEBUG] OPTIONSリクエスト - CORSヘッダーを返します');
    return new Response(null, { headers: RESPONSE_HEADERS });
  }

  if (req.method !== 'POST') {
    console.warn(`[WARN] 無効なメソッド: ${req.method} (POST が期待されます)`);
    return new Response(JSON.stringify({ error: 'メソッドが許可されていません' }), {
      status: 405,
      headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  if (!openAiApiKey) {
    console.error('[ERROR] OpenAI APIキーが設定されていません');
    return new Response(JSON.stringify({ error: 'AIプロバイダーのAPIキーが設定されていません。' }), {
      status: 500,
      headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  try {
    const contentType = req.headers.get('content-type') ?? '';
    console.log(`[DEBUG] Content-Type: ${contentType}`);
    
    if (!contentType.includes('multipart/form-data')) {
      console.warn(`[WARN] 無効なContent-Type: ${contentType} (multipart/form-data が期待されます)`);
      return new Response(JSON.stringify({ error: 'Content-Typeはmultipart/form-dataである必要があります' }), {
        status: 400,
        headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const formData = await req.formData();
    const imageFile = formData.get('image');

    if (!(imageFile instanceof File)) {
      console.warn('[WARN] imageフィールドが不足しているか無効です');
      return new Response(JSON.stringify({ error: 'imageフィールドが必要です' }), {
        status: 400,
        headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[DEBUG] 画像ファイル受信: 名前=${imageFile.name}, サイズ=${imageFile.size} バイト, タイプ=${imageFile.type}`);

    console.log('[DEBUG] データベースから食品リストを取得中...');
    const foods = await fetchFoods();
    console.log(`[DEBUG] データベースから ${foods.length} 件の食品を取得しました`);
    
    const prompt = buildPrompt(foods);
    console.log(`[DEBUG] プロンプト長: ${prompt.length} 文字`);

    console.log('[DEBUG] 画像をbase64に変換中...');
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64Image = btoa(
      Array.from(bytes)
        .map((byte) => String.fromCharCode(byte))
        .join('')
    );
    const mimeType = imageFile.type || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    console.log(`[DEBUG] 画像変換完了: base64長=${base64Image.length}, MIMEタイプ=${mimeType}`);

    const messages: CoreMessage[] = [
      {
        role: 'system',
        content:
          'You are an assistant that analyses meal images. Respond strictly in JSON that follows the provided schema.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '食品候補リストと指示:' },
          { type: 'text', text: prompt },
          {
            type: 'image',
            image: dataUrl
          }
        ]
      }
    ];

    console.log('[DEBUG] OpenAI API (gpt-4o-mini) を呼び出し中...');
    const startTime = Date.now();
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: responseSchema,
      messages
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] OpenAI APIレスポンス受信: ${elapsedTime}ms`);
    console.log(`[DEBUG] AI生レスポンス:`, JSON.stringify(object, null, 2));

    console.log('[DEBUG] AIレスポンスをスキーマに対して検証中...');
    const parsed = responseSchema.safeParse(object);
    if (!parsed.success) {
      console.error('[ERROR] AIレスポンスのパースに失敗しました:', parsed.error);
      console.error('[ERROR] スキーマ検証エラー:', parsed.error.errors);
      return new Response(
        JSON.stringify({
          detections: [],
          error: 'AIレスポンスを解析できませんでした'
        }),
        {
          status: 502,
          headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[DEBUG] AIレスポンスから ${parsed.data.detections.length} 件の検出結果をパースしました`);
    
    const idSet = new Set(foods.map((food) => food.id));
    const detections = parsed.data.detections
      .filter((item) => idSet.has(item.foodId))
      .map((item) => ({
        foodId: item.foodId,
        nameJp: item.nameJp,
        weightGrams: item.weightGrams,
        confidence: Math.max(0, Math.min(1, item.confidence)),
        notes: item.notes ?? null
      }));

    const filteredCount = parsed.data.detections.length - detections.length;
    if (filteredCount > 0) {
      console.warn(`[WARN] 無効な食品IDを持つ ${filteredCount} 件の検出結果をフィルタリングしました`);
    }
    
    console.log(`[DEBUG] ${detections.length} 件の有効な検出結果を返します`);
    console.log(`[DEBUG] 検出結果:`, JSON.stringify(detections, null, 2));

    return new Response(JSON.stringify({ detections }), {
      status: 200,
      headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`[ERROR] 予期しないエラーが発生しました:`, error);
    console.error(`[ERROR] エラースタック:`, error instanceof Error ? error.stack : 'スタックトレースなし');
    return new Response(JSON.stringify({ error: '予期しないエラーが発生しました' }), {
      status: 500,
      headers: { ...RESPONSE_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
