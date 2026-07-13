/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

// Embedded Gemini API Key provided by the user for personal, safe usage
const EMBEDDED_GEMINI_KEY = "AQ.Ab8RN6IeBtkd356xKdxmp_-syvH8HA5wfbMZlp_rtopBah5DYw";

/**
 * Get the active Gemini API Key, prioritizing the environment variable
 * but falling back gracefully to the user's provided key.
 * 
 * SECURITY WARNING FOR WEB COMPILE:
 * The user explicitly requested embedding the key directly for personal, unshared deployment on Vercel/Netlify.
 */
export function getGeminiApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }
  return EMBEDDED_GEMINI_KEY;
}

/**
 * Calls Gemini to generate a high-end, masterclass quantitative and statistical analysis
 * for the next period prediction.
 * 
 * Model Used: gemini-3.5-flash (Standard for intelligent text reasoning and speed)
 */
export async function generatePredictionAnalysis(params: {
  nextPeriod: number;
  recentHistory: { period: number; number: number; zodiac: string }[];
  topRecommended: { rank: number; zodiac: string; score: number; reasons: string[] }[];
  allScores: [string, number][];
}): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is not configured.");
  }

  // Initialize the official @google/genai SDK on the client side as requested
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      }
    }
  });

  // Construct a premium prompt with structured data
  const prompt = `
你是一位精通香港六合彩走势分析的资深量化统计科学家，擅长结合大数法则、统计学和马尔可夫链实施生肖因子打分。

我们的系统刚刚针对下一期「第 ${params.nextPeriod} 期」进行了多因子量化评分。现在，请为你（Lottery AI 系统）的 VIP 用户撰写一份极其专业、极具深度、分析透彻的「AI量化智能推荐深度研判白皮书」。

【当前期数】
下一期预测期数：第 ${params.nextPeriod} 期

【近期开奖走势（倒序）】
${params.recentHistory.map(h => `第 ${h.period} 期：特别号码 ${h.number.toString().padStart(2, "0")}（生肖: ${h.zodiac}）`).join("\n")}

【模型高分推荐生肖列表】
${params.topRecommended.map(r => `第 ${r.rank} 名：生肖「 ${r.zodiac} 」（量化综合评分：${r.score.toFixed(1)}分）。
评分要点说明：${r.reasons.join("；")}`).join("\n")}

【完整的12生肖评分看板】
${params.allScores.map(([z, sc], idx) => `第 ${idx+1} 名：${z} (${sc.toFixed(1)}分)`).join(" | ")}

【写作任务与格式指南】
请用专业、冷静、科学、严谨的中性文字撰写报告。严格避免低端的博彩神学迷信字眼，聚焦在“大数法则”、“均值回归规律”、“状态转移链条”、“极限偏离收敛”等数学术语。
整篇报告字数约 500-800 字，按如下结构输出（必须包含精美排版和 Markdown 格式）：

### 🎯 核心摘要 (AI Executive Summary)
（简述当前模型推荐的核心判断，以及下一期生肖出场的宏观期望）

### 📊 多因子共振分析 (Multi-Factor Resonance)
- **遗漏偏离回归**：（针对排名第1名的生肖，解读其遗漏状态与补开拉力的数学期望）
- **马尔可夫状态链**：（解读上期开出生肖向本期前两名推荐生肖的转移概率分布特征）
- **大数波色与单双纠偏**：（对近期连续开出的大/小、单/双或红/绿/蓝波色进行归纳纠偏分析）

### 🔮 星级风险控制与策略建议 (Strategy & Risk Controls)
- 给出对 Top 推荐生肖的投资关注度排序，提供防御规避的战术组合（例如防守连庄，合理分散）。
- 强调免责声明：系统基于量化概率，无绝对担保，倡导理性购彩。

请开始撰写：
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.75,
        topP: 0.95,
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned empty text.");
    }
    return text;
  } catch (error: any) {
    console.error("[Gemini API Error] Failed to generate AI analysis:", error);
    // Bulletproof Fallback: Direct REST API call if the SDK has any CORS or runtime issues
    try {
      console.log("[Gemini Fallback] Attempting direct REST fetch...");
      const directResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.75,
              topP: 0.95
            }
          })
        }
      );
      const directData = await directResponse.json();
      const directText = directData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (directText) {
        return directText;
      }
      throw new Error(directData.error?.message || "REST response format invalid.");
    } catch (fallbackErr: any) {
      throw new Error(`AI 研判生成失败。请检查 API 密钥是否有效。原错误：${error.message || error}，Fallback 错误：${fallbackErr.message || fallbackErr}`);
    }
  }
}
