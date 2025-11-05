import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const openAiApiKey = Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("AI_OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("REMOTE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("REMOTE_SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// エンベディングを取得する関数
async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: RESPONSE_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  // クエリパラメータで処理件数を制限（タイムアウト対策）
  const url = new URL(req.url);
  const maxProcess = url.searchParams.get("max_process");
  const MAX_ALLOWED = 500; // 一度に処理できる最大件数（タイムアウト対策）
  const DEFAULT_MAX = 100; // デフォルト処理件数
  
  // パラメータのバリデーションと正規化
  let maxProcessCount = DEFAULT_MAX;
  if (maxProcess) {
    const parsed = parseInt(maxProcess, 10);
    // 数値判定と範囲チェック（1以上、MAX_ALLOWED以下）
    if (Number.isFinite(parsed) && parsed > 0) {
      maxProcessCount = Math.max(1, Math.min(MAX_ALLOWED, parsed));
    } else {
      console.warn(
        `[WARN] 無効なmax_process値: ${maxProcess}。デフォルト値 ${DEFAULT_MAX} を使用します。`,
      );
    }
  }

  try {
    if (!openAiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEYが設定されていません" }),
        {
          status: 500,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase認証情報が設定されていません" }),
        {
          status: 500,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 全食品を取得
    console.log("[DEBUG] 食品データを取得中...");
    const PAGE_SIZE = 1000;
    let allFoods: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("foods")
        .select("id, name_jp, remarks")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw new Error(`データ取得エラー: ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      allFoods = allFoods.concat(data);
      offset += data.length;
      console.log(`[DEBUG] ${allFoods.length} 件まで取得しました`);

      if (data.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    console.log(`[DEBUG] 合計 ${allFoods.length} 件の食品を取得しました`);

    // エンベディングが未生成の食品をフィルタ（ページネーションで全件取得）
    const embeddedIds = new Set<string>();
    let offsetEmbedded = 0;
    const PAGE_SIZE_EMBEDDED = 1000;
    let hasMoreEmbedded = true;

    while (hasMoreEmbedded) {
      // ページネーションで全件取得（.range()を使用してmax_rows制限を回避）
      const endRange = offsetEmbedded + PAGE_SIZE_EMBEDDED - 1;
      const { data: foodsWithEmbeddings, error: checkError } = await supabase
        .from("foods")
        .select("id")
        .not("name_embedding", "is", null)
        .order("id", { ascending: true })
        .range(offsetEmbedded, endRange);

      if (checkError) {
        console.warn("[WARN] エンベディングチェックエラー:", checkError);
        break;
      }

      if (!foodsWithEmbeddings || foodsWithEmbeddings.length === 0) {
        hasMoreEmbedded = false;
        break;
      }

      // 取得件数が期待値と一致するか確認（max_rows制限の検出）
      const expectedCount = Math.min(PAGE_SIZE_EMBEDDED, endRange - offsetEmbedded + 1);
      if (foodsWithEmbeddings.length < expectedCount && foodsWithEmbeddings.length < PAGE_SIZE_EMBEDDED) {
        console.warn(
          `[WARN] 取得件数が期待値より少ない可能性があります。取得: ${foodsWithEmbeddings.length} 件 / 期待: ${expectedCount} 件`,
        );
      }

      foodsWithEmbeddings.forEach((f: any) => embeddedIds.add(f.id));
      offsetEmbedded += foodsWithEmbeddings.length;
      console.log(
        `[DEBUG] エンベディング済みチェック: ${embeddedIds.size} 件まで確認（今回: ${foodsWithEmbeddings.length} 件）`,
      );

      // 取得件数がページサイズより少ない場合は終了
      if (foodsWithEmbeddings.length < PAGE_SIZE_EMBEDDED) {
        hasMoreEmbedded = false;
      }
    }

    console.log(`[DEBUG] エンベディング済みチェック完了: 合計 ${embeddedIds.size} 件`);

    const foodsToProcess = allFoods.filter((f) => !embeddedIds.has(f.id));

    console.log(
      `[DEBUG] エンベディング未生成: ${foodsToProcess.length} 件 / 全体: ${allFoods.length} 件`,
    );

    if (foodsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          message: "すべての食品のエンベディングが既に生成されています",
          total: allFoods.length,
        }),
        {
          status: 200,
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
        },
      );
    }

    // タイムアウト対策: 処理件数を制限
    const foodsToProcessLimited = foodsToProcess.slice(0, maxProcessCount);
    const remainingCount = foodsToProcess.length - foodsToProcessLimited.length;
    
    console.log(
      `[DEBUG] 処理対象: ${foodsToProcessLimited.length} 件（未生成: ${foodsToProcess.length} 件、制限: ${maxProcessCount} 件）`,
    );

    if (remainingCount > 0) {
      console.log(
        `[DEBUG] タイムアウト対策: ${maxProcessCount} 件まで処理し、残り ${remainingCount} 件は次回実行してください`,
      );
    }

    // エンベディングを生成して保存
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 10; // バッチサイズ

    for (let i = 0; i < foodsToProcessLimited.length; i += batchSize) {
      const batch = foodsToProcessLimited.slice(i, i + batchSize);
      const promises = batch.map(async (food) => {
        try {
          // 食品名と備考を結合してエンベディング化
          const text = `${food.name_jp} ${food.remarks || ""}`.trim();
          const embedding = await getEmbedding(text);

          // データベースに保存
          const { error: updateError } = await supabase
            .from("foods")
            .update({ name_embedding: embedding })
            .eq("id", food.id);

          if (updateError) {
            console.error(
              `[ERROR] エンベディング保存エラー (${food.name_jp}):`,
              updateError,
            );
            errorCount++;
          } else {
            successCount++;
            console.log(
              `[DEBUG] エンベディング生成完了: ${food.name_jp} (${successCount}/${foodsToProcessLimited.length})`,
            );
          }

          // APIレート制限を考慮して少し待機
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `[ERROR] エンベディング生成エラー (${food.name_jp}):`,
            error,
          );
          errorCount++;
        }
      });

      await Promise.all(promises);
      const processedSoFar = Math.min(i + batchSize, foodsToProcessLimited.length);
      console.log(
        `[DEBUG] バッチ処理完了: ${processedSoFar}/${foodsToProcessLimited.length} 件（進捗: ${Math.round((processedSoFar / foodsToProcessLimited.length) * 100)}%）`,
      );
    }

    // 次のステップの案内
    // 注意: エンベディング生成後、インデックス作成が必要です
    const indexNote = successCount > 0
      ? "⚠️ 次のステップ: ベクトル検索を高速化するため、マイグレーション 20250103000002_create_vector_index.sql を実行してインデックスを作成してください。"
      : "インデックス作成はスキップされました（エンベディング生成が0件のため）。";

    const response: any = {
      message: remainingCount > 0
        ? `エンベディング生成を進めました（一部のみ）`
        : "エンベディング生成が完了しました",
      total: allFoods.length,
      processed: foodsToProcessLimited.length,
      remaining: remainingCount,
      success: successCount,
      errors: errorCount,
      nextStep: indexNote,
    };

    if (remainingCount > 0) {
      response.continueMessage = `残り ${remainingCount} 件を処理するには、再度このFunctionを呼び出してください。`;
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[ERROR] エンベディング生成処理エラー:", error);
    return new Response(
      JSON.stringify({
        error: "エンベディング生成に失敗しました",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});

