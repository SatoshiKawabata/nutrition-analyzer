import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@2.0.1";
import { createOpenAI } from "npm:@ai-sdk/openai@2.0.59";
import { type CoreMessage, generateObject } from "npm:ai@5.0.86";
import { z } from "npm:zod@3.25.76";

// AIプロバイダーの設定
const aiProvider = (Deno.env.get("AI_PROVIDER") ?? "google").toLowerCase();
const googleApiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY") ??
  Deno.env.get("GOOGLE_AI_API_KEY");
const openAiApiKey = Deno.env.get("OPENAI_API_KEY") ??
  Deno.env.get("AI_OPENAI_API_KEY");

console.log(`[DEBUG] AI Provider: ${aiProvider}`);
console.log("[DEBUG] Google AI API Key:", googleApiKey ? "設定済み" : "未設定");
console.log("[DEBUG] OpenAI API Key:", openAiApiKey ? "設定済み" : "未設定");

// 選択されたプロバイダーのAPIキーをチェック
if (aiProvider === "google" && !googleApiKey) {
  console.warn(
    "[WARN] GOOGLE_GENERATIVE_AI_API_KEY (または GOOGLE_AI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
} else if (aiProvider === "openai" && !openAiApiKey) {
  console.warn(
    "[WARN] OPENAI_API_KEY (または AI_OPENAI_API_KEY) が設定されていません。analyze-image function は失敗します。",
  );
}

// AIプロバイダーの初期化（必要に応じて）
const google = googleApiKey ? createGoogleGenerativeAI({
  apiKey: googleApiKey,
}) : null;

const openai = openAiApiKey ? createOpenAI({
  apiKey: openAiApiKey,
}) : null;

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
    
    console.log("[DEBUG] Google Gemini API (gemini-2.0-flash) を呼び出し中...");
    const startTime = Date.now();
    const { object } = await generateObject({
      model: google("gemini-2.0-flash"),
      schema,
      messages,
      temperature: 0.0,
      topP: 1.0,
      maxOutputTokens: 2048,
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] Google Gemini APIレスポンス受信: ${elapsedTime}ms`);
    return object;
  } else if (aiProvider === "openai") {
    if (!openai || !openAiApiKey) {
      throw new Error("OpenAI APIキーが設定されていません");
    }
    
    console.log("[DEBUG] OpenAI API (gpt-4o-mini) を呼び出し中...");
    const startTime = Date.now();
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema,
      messages,
      temperature: 0.0,
      topP: 1.0,
      maxOutputTokens: 2048,
    });
    const elapsedTime = Date.now() - startTime;
    console.log(`[DEBUG] OpenAI APIレスポンス受信: ${elapsedTime}ms`);
    return object;
  } else {
    throw new Error(`サポートされていないAIプロバイダー: ${aiProvider} (google または openai を指定してください)`);
  }
}

/**
 * 現在選択されているAIプロバイダーを取得
 */
export function getAIProvider(): "google" | "openai" {
  return aiProvider as "google" | "openai";
}

/**
 * 選択されたプロバイダーのAPIキーが設定されているかチェック
 */
export function validateAPIKey(): { valid: boolean; error?: string } {
  if (aiProvider === "google" && !googleApiKey) {
    return {
      valid: false,
      error: "Google AI APIキーが設定されていません。GOOGLE_GENERATIVE_AI_API_KEYを設定してください。",
    };
  } else if (aiProvider === "openai" && !openAiApiKey) {
    return {
      valid: false,
      error: "OpenAI APIキーが設定されていません。OPENAI_API_KEYを設定してください。",
    };
  }
  return { valid: true };
}

