import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@2.0.1";
import { createOpenAI } from "npm:@ai-sdk/openai@2.0.59";
import { type CoreMessage, generateObject } from "npm:ai@5.0.86";
import { z } from "npm:zod@3.25.76";
import OpenAI from "openai";

// AIプロバイダーの設定
const aiProvider = (Deno.env.get("AI_PROVIDER") ?? "google").toLowerCase();
const googleApiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") ??
  Deno.env.get("GOOGLE_AI_API_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("AI_OPENAI_API_KEY");
const customPromptId = Deno.env.get("OPENAI_CUSTOM_PROMPT_ID") ??
  "pmpt_690fd2994dac8195b1cb51e6d0aaf5e803d4e3d41577f693";
const customPromptVersion = Deno.env.get("OPENAI_CUSTOM_PROMPT_VERSION") ?? "6";

// モデル名の設定（環境変数から取得、デフォルト値あり）
const googleModel = Deno.env.get("GOOGLE_MODEL") ??
  Deno.env.get("GOOGLE_AI_MODEL") ??
  "gemini-flash-lite-latest";
const openaiModel = Deno.env.get("OPENAI_MODEL") ??
  Deno.env.get("AI_OPENAI_MODEL") ??
  "gpt-4o-mini";

console.log(`[DEBUG] AI Provider: ${aiProvider}`);
console.log("[DEBUG] Google AI API Key:", googleApiKey ? "設定済み" : "未設定");
console.log(`[DEBUG] Google Model: ${googleModel}`);
console.log("[DEBUG] OpenAI API Key:", openAiApiKey ? "設定済み" : "未設定");
console.log(`[DEBUG] OpenAI Model: ${openaiModel}`);
if (aiProvider === "custom-openai") {
  console.log(`[DEBUG] Custom Prompt ID: ${customPromptId}`);
  console.log(`[DEBUG] Custom Prompt Version: ${customPromptVersion}`);
}

// 選択されたプロバイダーのAPIキーをチェック
if (aiProvider === "google" && !googleApiKey) {
  console.warn(
    "[WARN] GOOGLE_GENERATIVE_AI_API_KEY (または GOOGLE_AI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
} else if (aiProvider === "openai" && !openAiApiKey) {
  console.warn(
    "[WARN] OPENAI_API_KEY (または AI_OPENAI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
} else if (aiProvider === "custom-openai" && !openAiApiKey) {
  console.warn(
    "[WARN] OPENAI_API_KEY (または AI_OPENAI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
}

// AIプロバイダーの初期化（必要に応じて）
const google = googleApiKey
  ? createGoogleGenerativeAI({
    apiKey: googleApiKey,
  })
  : null;

const openai = openAiApiKey
  ? createOpenAI({
    apiKey: openAiApiKey,
  })
  : null;

/**
 * AIプロバイダーを使用して画像解析を実行する関数
 * @param messages - AIに送信するメッセージ配列
 * @param schema - レスポンスのスキーマ（Zodスキーマ）
 * @returns スキーマに準拠した解析結果
 */
export async function analyzeImageWithAI<T extends z.ZodTypeAny>(
  messages: CoreMessage[],
  schema: T,
): Promise<z.infer<T>> {
  if (aiProvider === "google") {
    if (!google || !googleApiKey) {
      throw new Error("Google AI APIキーが設定されていません");
    }
    console.log(`[DEBUG] Google Gemini API (${googleModel}) を呼び出し中...`);
    const startTime = Date.now();
    const { object, usage } = await generateObject({
      model: google(googleModel),
      schema,
      messages,
      temperature: 0.0,
      topP: 1.0,
      maxOutputTokens: 2048,
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] Google Gemini APIレスポンス受信: ${elapsedTime}ms`);
    if (usage) {
      // AI SDKのusageオブジェクトのプロパティ名を確認して出力
      console.log(
        `[DEBUG] トークン使用量:`,
        JSON.stringify(usage, null, 2),
      );
    }
    return object;
  } else if (aiProvider === "openai") {
    if (!openai || !openAiApiKey) {
      throw new Error("OpenAI APIキーが設定されていません");
    }
    console.log(`[DEBUG] OpenAI API (${openaiModel}) を呼び出し中...`);
    const startTime = Date.now();
    const { object, usage } = await generateObject({
      model: openai(openaiModel),
      schema,
      messages,
      temperature: 0.0,
      topP: 1.0,
      maxOutputTokens: 2048,
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] OpenAI APIレスポンス受信: ${elapsedTime}ms`);
    if (usage) {
      // AI SDKのusageオブジェクトのプロパティ名を確認して出力
      console.log(
        `[DEBUG] トークン使用量:`,
        JSON.stringify(usage, null, 2),
      );
    }
    return object;
  } else {
    throw new Error(
      `サポートされていないAIプロバイダー: ${aiProvider} (google または openai を指定してください)`,
    );
  }
}

/**
 * 現在選択されているAIプロバイダーを取得
 */
export function getAIProvider(): "google" | "openai" | "custom-openai" {
  return aiProvider as "google" | "openai" | "custom-openai";
}

/**
 * 選択されたプロバイダーのAPIキーが設定されているかチェック
 */
export function validateAPIKey(): { valid: boolean; error?: string } {
  if (aiProvider === "google" && !googleApiKey) {
    return {
      valid: false,
      error:
        "Google AI APIキーが設定されていません。GOOGLE_GENERATIVE_AI_API_KEYを設定してください。",
    };
  } else if (aiProvider === "openai" && !openAiApiKey) {
    return {
      valid: false,
      error:
        "OpenAI APIキーが設定されていません。OPENAI_API_KEYを設定してください。",
    };
  } else if (aiProvider === "custom-openai" && !openAiApiKey) {
    return {
      valid: false,
      error:
        "OpenAI APIキーが設定されていません。OPENAI_API_KEYを設定してください。",
    };
  }
  return { valid: true };
}

/**
 * OpenAIカスタムAPI（Responses API）を使用して画像解析を実行する関数
 * @param imageData - Base64エンコードされた画像データ（data:image/...;base64,...形式）
 * @param foodsByGroup - 食品群ごとにフォーマットされた食品リスト文字列
 * @param schema - レスポンスのスキーマ（Zodスキーマ）
 * @returns スキーマに準拠した解析結果
 */
export async function analyzeImageWithCustomOpenAI<T extends z.ZodTypeAny>(
  imageData: string,
  foodsByGroup: string,
  schema: T,
): Promise<z.infer<T>> {
  if (!openAiApiKey) {
    throw new Error("OpenAI APIキーが設定されていません");
  }

  console.log("[DEBUG] OpenAI Custom API (Responses API) を呼び出し中...");
  console.log(
    `[DEBUG] Prompt ID: ${customPromptId}, Version: ${customPromptVersion}`,
  );
  console.log(`[DEBUG] Foods by Group length: ${foodsByGroup.length} 文字`);

  const startTime = Date.now();

  try {
    // OpenAI SDKをインポート（Denoではnpm:プレフィックスを使用）
    // const OpenAI = await import("npm:openai@4.0.0");
    const openaiClient = new OpenAI({
      apiKey: openAiApiKey,
    });

    // 画像データの検証（現在は使用していないが、将来的に画像送信が必要な場合に備えて保持）
    // data:image/jpeg;base64,xxxxx の形式をチェック
    if (!imageData.match(/^data:image\/(\w+);base64,(.+)$/)) {
      console.warn(
        "[WARN] 画像データの形式が不正です。data:image/...;base64,...形式である必要があります。",
      );
    }

    // OpenAI Responses APIを呼び出し
    // 注意: 現在は画像をinputに含めていません
    // 画像の送信方法は実際のAPIの仕様に合わせて調整が必要です
    // 画像を送信する場合は、multipart/form-dataで送信するか、
    // またはinput配列に適切な形式で追加する必要があります
    // ユーザーのコード例に基づいて実装
    // 画像はmultipart/form-dataで送信する必要がある可能性があるため、
    // まずは画像なしで試し、必要に応じて調整
    const response = await openaiClient.responses.create({
      prompt: {
        id: customPromptId,
        version: customPromptVersion,
        variables: {
          foods_by_group: foodsByGroup,
        },
      },
      input: [],
      text: {
        format: {
          type: "text",
        },
      },
      reasoning: {},
      max_output_tokens: 2048,
      store: false,
      // 画像は別の方法で送信する必要がある可能性がある
      // 実際のAPIの仕様に合わせて調整が必要
    });

    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] OpenAI Custom APIレスポンス受信: ${elapsedTime}ms`);
    
    // トークン使用量をログに出力
    if (
      typeof response === "object" &&
      response !== null &&
      "usage" in response
    ) {
      const usage = (response as { usage: unknown }).usage;
      if (
        typeof usage === "object" &&
        usage !== null &&
        ("prompt_tokens" in usage ||
          "completion_tokens" in usage ||
          "total_tokens" in usage)
      ) {
        const usageInfo = usage as {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
        console.log(
          `[DEBUG] トークン使用量: prompt=${usageInfo.prompt_tokens ?? "N/A"}, ` +
          `completion=${usageInfo.completion_tokens ?? "N/A"}, ` +
          `total=${usageInfo.total_tokens ?? "N/A"}`,
        );
      }
    }
    
    console.log(`[DEBUG] レスポンス:`, JSON.stringify(response, null, 2));

    // レスポンスをスキーマに合わせて検証・変換
    // OpenAI Responses APIのレスポンス形式に応じて調整が必要
    // レスポンスのテキスト部分をJSONとしてパースする必要がある可能性がある
    let result: unknown = response;

    // レスポンスがテキスト形式の場合、JSONとしてパースを試みる
    if (
      typeof response === "object" && response !== null && "output" in response
    ) {
      const output = (response as { output: unknown }).output;
      if (Array.isArray(output) && output.length > 0) {
        // output配列の最初の要素を取得
        const firstOutput = output[0];
        if (
          typeof firstOutput === "object" &&
          firstOutput !== null &&
          "text" in firstOutput
        ) {
          try {
            result = JSON.parse((firstOutput as { text: string }).text);
          } catch {
            // JSONパースに失敗した場合はそのまま使用
            result = firstOutput;
          }
        } else {
          result = firstOutput;
        }
      }
    } else if (
      typeof response === "object" && response !== null && "text" in response
    ) {
      try {
        const textValue = (response as { text: unknown }).text;
        if (typeof textValue === "string") {
          result = JSON.parse(textValue);
        } else {
          result = response;
        }
      } catch {
        // JSONパースに失敗した場合はそのまま使用
        result = response;
      }
    }

    const parsed = schema.parse(result);
    return parsed;
  } catch (error) {
    console.error("[ERROR] OpenAI Custom API呼び出しエラー:", error);
    throw error;
  }
}
