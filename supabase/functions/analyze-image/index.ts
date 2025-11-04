import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createOpenAI } from "npm:@ai-sdk/openai@2.0.59";
import { type CoreMessage, generateObject } from "npm:ai@5.0.86";
import { z } from "npm:zod@3.25.76";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type FoodRecord = {
  id: string;
  name_jp: string;
  remarks: string | null;
  food_code: string | null;
  index_code: string | null;
  group_id: string;
  food_group: {
    name_jp: string;
    group_code: string;
    original_sort_order: number;
  };
};

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const openAiApiKey = Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("AI_OPENAI_API_KEY");
// REMOTE_SUPABASE_URLを優先的に使用（リモート環境への接続）
// SUPABASE_URLはローカル環境で自動設定されるが、リモート環境を使う場合はREMOTE_を優先
const supabaseUrl = Deno.env.get("REMOTE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("REMOTE_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

console.log("[DEBUG] OpenAI API Key:", openAiApiKey ? "設定済み" : "未設定");
console.log("[DEBUG] Supabase URL:", supabaseUrl || "未設定");
console.log(
  `[DEBUG] Service Role Key: ${serviceRoleKey ? "設定済み" : "未設定"}`,
  serviceRoleKey ? "設定済み" : "未設定",
);

if (!openAiApiKey) {
  console.warn(
    "[WARN] OPENAI_API_KEY (または AI_OPENAI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
}

const openai = createOpenAI({
  apiKey: openAiApiKey ?? "",
});

const responseSchema = z.object({
  detections: z
    .array(
      z.object({
        foodId: z.string(),
        nameJp: z.string(),
        weightGrams: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
        notes: z.string().optional().nullable(),
      }),
    )
    .default([]),
});

async function fetchFoods(): Promise<FoodRecord[]> {
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[WARN] Supabase認証情報が不足しています。空の食品リストを返します。",
    );
    console.warn(`[WARN] SUPABASE_URL: ${supabaseUrl ? "設定済み" : "未設定"}`);
    console.warn(
      `[WARN] SUPABASE_SERVICE_ROLE_KEY: ${
        serviceRoleKey ? "設定済み" : "未設定"
      }`,
    );
    return [];
  }

  console.log(`[DEBUG] Supabaseに接続中: ${supabaseUrl}`);
  console.log(
    `[DEBUG] Service Role Key（最初の20文字）: ${
      serviceRoleKey.substring(
        0,
        20,
      )
    }...`,
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("[DEBUG] foodsテーブルからデータを取得中...");
  
  // max_rowsの制限（通常1000件）を回避するため、ページネーションで複数回取得
  const PAGE_SIZE = 1000;
  const MAX_FOODS = 3000;
  let allData: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && allData.length < MAX_FOODS) {
    const limit = Math.min(PAGE_SIZE, MAX_FOODS - allData.length);
    const { data, error } = await supabase
      .from("foods")
      .select(`
        id,
        name_jp,
        remarks,
        food_code,
        index_code,
        group_id,
        food_groups!inner(
          name_jp,
          group_code,
          original_sort_order
        )
      `)
      .order("name_jp", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[ERROR] プロンプト用の食品リスト取得に失敗しました:", error);
      console.error("[ERROR] エラー詳細:", JSON.stringify(error, null, 2));
      console.error(`[ERROR] 接続URL: ${supabaseUrl}`);
      console.error(
        `[ERROR] Service Role Key（最初の20文字）: ${
          serviceRoleKey.substring(
            0,
            20,
          )
        }...`,
      );
      
      // DNS解決エラーなどのネットワークエラーの場合
      if (error.message && error.message.includes("dns error")) {
        console.error("[ERROR] DNS解決エラー: ネットワーク接続またはSupabase URLを確認してください");
      }
      
      // エラーが発生した場合、既に取得できたデータがあればそれを返す
      if (allData.length > 0) {
        console.warn(`[WARN] エラーが発生しましたが、既に取得した ${allData.length} 件のデータを使用します`);
        break;
      }
      return [];
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    allData = allData.concat(data);
    offset += data.length;
    
    console.log(
      `[DEBUG] ページネーション: ${allData.length} 件まで取得しました（今回: ${data.length} 件）`,
    );

    // 取得したデータが要求した件数より少ない場合は、これ以上データがない
    if (data.length < limit) {
      hasMore = false;
    }

    // 目標の件数に達した場合は終了
    if (allData.length >= MAX_FOODS) {
      hasMore = false;
    }
  }

  // 目標件数に達した場合、必要な分だけ使用
  const finalData = allData.slice(0, MAX_FOODS);

  console.log(
    `[DEBUG] データベースから合計 ${finalData.length} 件の食品を取得しました`,
  );
  if (finalData.length > 0) {
    console.log(
      `[DEBUG] 取得した食品の例（最初の3件）:`,
      finalData.slice(0, 3).map((f) => f.name_jp),
    );
  }
  
  // 1件の食品は必ず1つの食品群に属するため（多対1の関係）、単一オブジェクトとして返される
  // ただし、Supabaseの型定義が配列として推論される可能性があるため、型アサーションを使用
  const normalizedData: FoodRecord[] = finalData.map((item: any) => {
    // 実際には単一オブジェクトとして返されるが、型定義の都合で配列として扱われる可能性がある
    const foodGroup = Array.isArray(item.food_groups) 
      ? item.food_groups[0] 
      : item.food_groups;
    
    return {
      id: item.id,
      name_jp: item.name_jp,
      remarks: item.remarks,
      food_code: item.food_code,
      index_code: item.index_code,
      group_id: item.group_id,
      food_group: foodGroup,
    };
  });
  
  // 取得後に食品群の順序 → 食品名の順序でソート
  normalizedData.sort((a, b) => {
    const orderA = a.food_group.original_sort_order;
    const orderB = b.food_group.original_sort_order;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.name_jp.localeCompare(b.name_jp, "ja");
  });
  
  return normalizedData;
}

// 食品群ごとにグループ化する関数
function groupFoodsByCategory(foods: FoodRecord[]): Record<string, FoodRecord[]> {
  const grouped: Record<string, FoodRecord[]> = {};
  for (const food of foods) {
    const groupName = food.food_group.name_jp;
    if (!grouped[groupName]) {
      grouped[groupName] = [];
    }
    grouped[groupName].push(food);
  }
  return grouped;
}

function buildPrompt(foods: FoodRecord[]): string {
  // 食品群ごとにグループ化
  const groupedFoods = groupFoodsByCategory(foods);
  
  // 食品群ごとにテキスト形式で整理
  const foodsByGroup = Object.entries(groupedFoods)
    .sort(([a], [b]) => {
      // 食品群の順序を保持（original_sort_orderでソート済みのはず）
      const orderA = foods.find(f => f.food_group.name_jp === a)?.food_group.original_sort_order ?? 999;
      const orderB = foods.find(f => f.food_group.name_jp === b)?.food_group.original_sort_order ?? 999;
      return orderA - orderB;
    })
    .map(([groupName, groupFoods]) => {
      const foodList = groupFoods.map(food => {
        let item = `- ${food.name_jp} (ID: ${food.id})`;
        if (food.remarks) {
          item += ` [備考: ${food.remarks}]`;
        }
        return item;
      }).join('\n');
      
      return `## ${groupName}\n${foodList}`;
    }).join('\n\n');

  // IDマッピング用のリスト（検索用）
  // 現在は未使用だが、将来的にAIが検索しやすい形式で提供する可能性があるため残す
  // const foodIdMap = foods.map(food => ({
  //   id: food.id,
  //   name_jp: food.name_jp,
  //   group: food.food_group.name_jp,
  //   food_code: food.food_code,
  //   index_code: food.index_code,
  //   remarks: food.remarks,
  // }));

  const prompt = `あなたは食事画像から食品を特定し、重量を推定する専門家です。

## タスク
入力画像に写っている食品を以下のリストから特定し、それぞれのおおよその重量(g)を推定してください。

## 食品リスト（食品群ごとに分類）

${foodsByGroup}

## 重量推定のガイダンス

### 重量推定の基準
- **視覚的なサイズ比較**: 一般的なサイズ感を参考にしてください
  - 小さな茶碗1杯のご飯: 約100-120g
  - 中くらいの食パン1枚: 約30-35g
  - 卵1個: 約50-60g
  - ミニトマト1個: 約10-15g
  - リンゴ1個（中くらい）: 約200-250g
  - 鶏もも肉1枚: 約150-200g
  - サラダ用レタス1枚: 約10-15g

- **容器のサイズ**: 皿やボウルのサイズから全体量を推定
- **調理状態**: 生の状態を基準に、調理後の見た目から生の重量を逆算
- **一般的な1人前**: 日本の一般的な食事の1人前のサイズ感を参考に

### 確信度の評価基準
- **0.9-1.0**: 非常に確信がある（食品名が明確で、サイズもはっきり識別できる）
- **0.7-0.89**: かなり確信がある（食品名は特定できるが、重量には多少の不確実性がある）
- **0.5-0.69**: やや確信がある（食品名または重量のどちらかに不確実性がある）
- **0.3-0.49**: 低い確信（推測の要素が大きい）
- **0.0-0.29**: 非常に低い確信（使用しないでください）

### 重要なルール
1. **リストにない食品は無理に推定しない**: リストに完全に一致する食品がない場合は、空配列 [] を返してください
2. **類似食品の扱い**: 食品名が完全一致しなくても、見た目や特徴が近い場合は最も近い食品を選択してください（例: 「白米」→「精白米」）
3. **複数の食品が写っている場合**: すべての食品を検出し、それぞれの重量を推定してください
4. **重量の単位**: 必ず g（グラム）単位で数値を返してください（小数点以下は可）
5. **備考欄の活用**: 食品リストの備考欄に重要な情報がある場合は必ず参照してください

## 出力形式
以下のJSON形式で返してください：

\`\`\`json
{
  "detections": [
    {
      "foodId": "食品のID（上記リストから選択）",
      "nameJp": "食品名（リストに記載されている正確な名前）",
      "weightGrams": 重量の数値（g単位）,
      "confidence": 0.0-1.0の数値,
      "notes": "任意の補足情報（推定根拠や注意点など）"
    }
  ]
}
\`\`\`

候補が見つからない場合は、空配列を返してください: \`{"detections": []}\`

必ずJSONのみを返し、プレーンテキストや説明は含めないでください。`;

  return prompt;
}

serve(async (req) => {
  console.log(
    `[${new Date().toISOString()}] 📥 リクエスト受信: ${req.method} ${req.url}`,
  );

  if (req.method === "OPTIONS") {
    console.log("[DEBUG] OPTIONSリクエスト - CORSヘッダーを返します");
    return new Response(null, { headers: RESPONSE_HEADERS });
  }

  if (req.method !== "POST") {
    console.warn(`[WARN] 無効なメソッド: ${req.method} (POST が期待されます)`);
    return new Response(
      JSON.stringify({ error: "メソッドが許可されていません" }),
      {
        status: 405,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  if (!openAiApiKey) {
    console.error("[ERROR] OpenAI APIキーが設定されていません");
    return new Response(
      JSON.stringify({
        error: "AIプロバイダーのAPIキーが設定されていません。",
      }),
      {
        status: 500,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    console.log(`[DEBUG] Content-Type: ${contentType}`);

    if (!contentType.includes("multipart/form-data")) {
      console.warn(
        `[WARN] 無効なContent-Type: ${contentType} (multipart/form-data が期待されます)`,
      );
      return new Response(
        JSON.stringify({
          error: "Content-Typeはmultipart/form-dataである必要があります",
        }),
        {
          status: 400,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const formData = await req.formData();
    const imageFile = formData.get("image");

    if (!(imageFile instanceof File)) {
      console.warn("[WARN] imageフィールドが不足しているか無効です");
      return new Response(
        JSON.stringify({ error: "imageフィールドが必要です" }),
        {
          status: 400,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[DEBUG] 画像ファイル受信: 名前=${imageFile.name}, サイズ=${imageFile.size} バイト, タイプ=${imageFile.type}`,
    );

    console.log("[DEBUG] データベースから食品リストを取得中...");
    const foods = await fetchFoods();
    console.log(
      `[DEBUG] データベースから ${foods.length} 件の食品を取得しました`,
    );

    // 食品リストが空の場合はエラーを返す
    if (foods.length === 0) {
      console.error("[ERROR] 食品リストが空です。データベース接続を確認してください。");
      return new Response(
        JSON.stringify({
          error: "食品データの取得に失敗しました。データベース接続を確認してください。",
        }),
        {
          status: 503,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const prompt = buildPrompt(foods);
    console.log(`[DEBUG] プロンプト長: ${prompt.length} 文字`);

    // 環境変数 DEBUG_PROMPT が設定されている場合、プロンプト全体を出力
    if (Deno.env.get("DEBUG_PROMPT") === "true") {
      console.log("[DEBUG] ========== プロンプト内容（全体） ==========");
      console.log(prompt);
      console.log("[DEBUG] ==========================================");
    }

    console.log("[DEBUG] 画像をbase64に変換中...");
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64Image = btoa(
      Array.from(bytes)
        .map((byte) => String.fromCharCode(byte))
        .join(""),
    );
    const mimeType = imageFile.type || "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    console.log(
      `[DEBUG] 画像変換完了: base64長=${base64Image.length}, MIMEタイプ=${mimeType}`,
    );

    const messages: CoreMessage[] = [
      {
        role: "system",
        content:
          "あなたは食事画像から食品を特定し、重量を推定する専門家です。画像を詳細に分析し、提供された食品リストから最も適切な食品を選択し、視覚的な手がかり（サイズ、容器、一般的なサイズ感など）を基に重量を推定してください。確信度は、食品の識別精度と重量推定の確実性に基づいて評価してください。結果は必ず指定されたJSON形式で返してください。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            image: dataUrl,
          },
        ],
      },
    ];

    console.log("[DEBUG] OpenAI API (gpt-4o-mini) を呼び出し中...");
    const startTime = Date.now();
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: responseSchema,
      messages,
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] OpenAI APIレスポンス受信: ${elapsedTime}ms`);
    console.log(`[DEBUG] AI生レスポンス:`, JSON.stringify(object, null, 2));

    // generateObjectは自動でスキーマ検証を行うため、手動検証は不要
    console.log(
      `[DEBUG] AIレスポンスから ${object.detections.length} 件の検出結果を取得しました`,
    );

    const idSet = new Set(foods.map((food) => food.id));
    const detections = object.detections
      .filter((item) => idSet.has(item.foodId))
      .map((item) => ({
        foodId: item.foodId,
        nameJp: item.nameJp,
        weightGrams: item.weightGrams,
        confidence: Math.max(0, Math.min(1, item.confidence)),
        notes: item.notes ?? null,
      }));

    const filteredCount = object.detections.length - detections.length;
    if (filteredCount > 0) {
      console.warn(
        `[WARN] 無効な食品IDを持つ ${filteredCount} 件の検出結果をフィルタリングしました`,
      );
    }

    console.log(`[DEBUG] ${detections.length} 件の有効な検出結果を返します`);
    console.log(`[DEBUG] 検出結果:`, JSON.stringify(detections, null, 2));

    return new Response(JSON.stringify({ detections }), {
      status: 200,
      headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[ERROR] 予期しないエラーが発生しました:`, error);
    console.error(
      `[ERROR] エラースタック:`,
      error instanceof Error ? error.stack : "スタックトレースなし",
    );
    
    // エラーの種類に応じた詳細なメッセージ
    let errorMessage = "予期しないエラーが発生しました";
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes("dns error")) {
        errorMessage = "ネットワーク接続エラーが発生しました。外部サービスの接続を確認してください。";
        statusCode = 503;
      } else if (error.message.includes("OpenAI")) {
        errorMessage = "AIサービスの接続に失敗しました。APIキーとネットワーク接続を確認してください。";
        statusCode = 503;
      } else if (error.message.includes("Supabase")) {
        errorMessage = "データベース接続に失敗しました。Supabaseの設定を確認してください。";
        statusCode = 503;
      }
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: statusCode,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
