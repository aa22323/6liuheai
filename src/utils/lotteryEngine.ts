/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZODIAC_MAPPING, NUM_TO_ZODIAC, NUM_TO_WAVE, WAVE_COLORS } from "./zodiacConfig";

export interface HistoryRecord {
  period: number;
  number: number;
  zodiac: string;
  waveColor?: "红" | "蓝" | "绿";
  oddEven?: "单" | "双";
  size?: "大" | "小";
  tail?: number;
}

export interface IndicatorSettings {
  indicators: Record<string, boolean>;
  weights: Record<string, number>;
  recommendCount?: number;
  lunarYear?: number;
  zodiacMode?: "auto" | "custom";
  customZodiacMapping?: Record<string, number[]> | null;
  backtestWindow?: number | null;
}

export const DEFAULT_SETTINGS: IndicatorSettings = {
  recommendCount: 5,
  lunarYear: 2026,
  zodiacMode: "auto",
  customZodiacMapping: null,
  backtestWindow: null,
  indicators: {
    ENABLE_HISTORICAL_HEAT: true,
    ENABLE_RECENT_HEAT_10: true,
    ENABLE_RECENT_HEAT_20: true,
    ENABLE_RECENT_HEAT_50: true,
    ENABLE_MISSING_VALUE: true,
    ENABLE_AVERAGE_INTERVAL: true,
    ENABLE_COLD_HOT_BALANCE: true,
    ENABLE_MARKOV: true,
    ENABLE_WAVE_REVERSION: true,
    ENABLE_ODD_EVEN_REVERSION: true,
    ENABLE_SIZE_REVERSION: true,
    ENABLE_TAIL_REVERSION: true,
    ENABLE_CONSECUTIVE_PENALTY: true,
    ENABLE_MAX_MISSING_RECOVERY: true,
    ENABLE_CYCLE_ANALYSIS: true,
    ENABLE_SIMILAR_WINDOW: true,
    ENABLE_WUXING_HARMONY: true,
    ENABLE_ZODIAC_HARMONY: true,
    ENABLE_HESHU_REVERSION: true,
    ENABLE_DECAY_MARKOV: true,
    ENABLE_ATTRIBUTE_TRANSITION: true
  },
  weights: {
    HISTORICAL_HEAT_WEIGHT: 1.0,
    RECENT_HEAT_10_WEIGHT: 2.0,
    RECENT_HEAT_20_WEIGHT: 2.5,
    RECENT_HEAT_50_WEIGHT: 1.5,
    MISSING_VALUE_WEIGHT: 2.0,
    AVERAGE_INTERVAL_WEIGHT: 1.0,
    COLD_HOT_BALANCE_WEIGHT: 1.5,
    MARKOV_WEIGHT: 2.0,
    WAVE_REVERSION_WEIGHT: 1.2,
    ODD_EVEN_REVERSION_WEIGHT: 1.0,
    SIZE_REVERSION_WEIGHT: 1.0,
    TAIL_REVERSION_WEIGHT: 1.5,
    CONSECUTIVE_PENALTY_WEIGHT: -3.0, // negative penalty
    MAX_MISSING_RECOVERY_WEIGHT: 2.5,
    CYCLE_ANALYSIS_WEIGHT: 1.5,
    SIMILAR_WINDOW_WEIGHT: 2.0,
    WUXING_HARMONY_WEIGHT: 1.5,
    ZODIAC_HARMONY_WEIGHT: 1.8,
    HESHU_REVERSION_WEIGHT: 1.2,
    DECAY_MARKOV_WEIGHT: 2.5,
    ATTRIBUTE_TRANSITION_WEIGHT: 2.0
  }
};

/**
 * 自动计算衍生特征
 */
export function enrichData(records: HistoryRecord[]): HistoryRecord[] {
  return records.map(r => {
    const num = r.number;
    const waveColor = NUM_TO_WAVE[num] as "红" | "蓝" | "绿";
    const oddEven = (num % 2 !== 0 ? "单" : "双") as "单" | "双";
    const size = (num >= 25 ? "大" : "小") as "大" | "小";
    const tail = num % 10;
    return {
      ...r,
      waveColor,
      oddEven,
      size,
      tail
    };
  }).sort((a, b) => a.period - b.period);
}

/**
 * 预计算基础统计
 */
export function precomputeStats(df: HistoryRecord[]) {
  const total = df.length;
  const allZodiacs = Object.keys(ZODIAC_MAPPING);
  
  // 1. 频数
  const zCounts: Record<string, number> = {};
  allZodiacs.forEach(z => { zCounts[z] = 0; });
  df.forEach(r => {
    zCounts[r.zodiac] = (zCounts[r.zodiac] || 0) + 1;
  });

  // 2. 遗漏与平均间隔
  const missingStats: Record<string, { currentMissing: number; avgInterval: number; maxMissing: number; intervals: number[] }> = {};
  
  allZodiacs.forEach(z => {
    const idxList: number[] = [];
    df.forEach((r, idx) => {
      if (r.zodiac === z) {
        idxList.push(idx);
      }
    });

    let currentMissing = total;
    let intervals: number[] = [];
    
    if (idxList.length === 0) {
      currentMissing = total;
      intervals = [total];
    } else {
      currentMissing = (total - 1) - idxList[idxList.length - 1];
      intervals = [idxList[0] + 1];
      for (let i = 1; i < idxList.length; i++) {
        intervals.push(idxList[i] - idxList[i - 1]);
      }
    }

    const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const maxMissing = Math.max(...intervals);
    
    missingStats[z] = {
      currentMissing,
      avgInterval: avgInterval || 12.0,
      maxMissing: maxMissing || 24,
      intervals
    };
  });

  return {
    zCounts,
    missingStats,
    dfRich: df
  };
}

/**
 * 16因子评分引擎
 */
export function computeZodiacScores(dfUpToT: HistoryRecord[], settings: IndicatorSettings): Record<string, number> {
  const scores: Record<string, number> = {};
  const allZodiacs = Object.keys(ZODIAC_MAPPING);
  allZodiacs.forEach(z => { scores[z] = 0.0; });

  const total = dfUpToT.length;
  if (total < 20) {
    allZodiacs.forEach(z => { scores[z] = 50.0; });
    return scores;
  }

  const { zCounts, missingStats, dfRich } = precomputeStats(dfUpToT);
  const { indicators, weights } = settings;

  // 1. 历史热度
  if (indicators.ENABLE_HISTORICAL_HEAT) {
    const w = weights.HISTORICAL_HEAT_WEIGHT ?? 1.0;
    allZodiacs.forEach(z => {
      const freq = (zCounts[z] || 0) / total;
      scores[z] += freq * 100 * w;
    });
  }

  // 2~4. 最近热度 (10, 20, 50)
  const spans = [
    { span: 10, ind: "ENABLE_RECENT_HEAT_10", wKey: "RECENT_HEAT_10_WEIGHT" },
    { span: 20, ind: "ENABLE_RECENT_HEAT_20", wKey: "RECENT_HEAT_20_WEIGHT" },
    { span: 50, ind: "ENABLE_RECENT_HEAT_50", wKey: "RECENT_HEAT_50_WEIGHT" }
  ];

  spans.forEach(({ span, ind, wKey }) => {
    if (indicators[ind] && total >= span) {
      const w = weights[wKey] ?? 1.0;
      const recentSlice = dfRich.slice(-span);
      const recentCounts: Record<string, number> = {};
      allZodiacs.forEach(z => { recentCounts[z] = 0; });
      recentSlice.forEach(r => { recentCounts[r.zodiac] = (recentCounts[r.zodiac] || 0) + 1; });

      allZodiacs.forEach(z => {
        const freq = recentCounts[z] / span;
        scores[z] += freq * 100 * w;
      });
    }
  });

  // 5. 遗漏值因子
  if (indicators.ENABLE_MISSING_VALUE) {
    const w = weights.MISSING_VALUE_WEIGHT ?? 1.0;
    allZodiacs.forEach(z => {
      const m = missingStats[z];
      let ratio = m.currentMissing / m.avgInterval;
      if (ratio > 3.0) ratio = 3.0; // clamp
      scores[z] += ratio * 10 * w;
    });
  }

  // 6. 平均间隔
  if (indicators.ENABLE_AVERAGE_INTERVAL) {
    const w = weights.AVERAGE_INTERVAL_WEIGHT ?? 1.0;
    allZodiacs.forEach(z => {
      const m = missingStats[z];
      scores[z] += (12.0 / m.avgInterval) * 10 * w;
    });
  }

  // 7. 冷热平衡
  if (indicators.ENABLE_COLD_HOT_BALANCE) {
    const w = weights.COLD_HOT_BALANCE_WEIGHT ?? 1.0;
    const recent15 = dfRich.slice(-15);
    const rCounts: Record<string, number> = {};
    allZodiacs.forEach(z => { rCounts[z] = 0; });
    recent15.forEach(r => { rCounts[r.zodiac] = (rCounts[r.zodiac] || 0) + 1; });

    allZodiacs.forEach(z => {
      const recentFreq = rCounts[z] / 15.0;
      const histFreq = (zCounts[z] || 0) / total;
      const momentum = Math.max(0.0, recentFreq - histFreq);
      scores[z] += momentum * 50 * w;
    });
  }

  // 8. 马尔可夫转移概率
  if (indicators.ENABLE_MARKOV && total > 2) {
    const w = weights.MARKOV_WEIGHT ?? 1.0;
    const lastZ = dfRich[total - 1].zodiac;
    
    // 计算转移矩阵
    const transitions: Record<string, Record<string, number>> = {};
    allZodiacs.forEach(z1 => {
      transitions[z1] = {};
      allZodiacs.forEach(z2 => { transitions[z1][z2] = 0; });
    });

    for (let i = 0; i < total - 1; i++) {
      const z1 = dfRich[i].zodiac;
      const z2 = dfRich[i + 1].zodiac;
      if (transitions[z1]) {
        transitions[z1][z2] = (transitions[z1][z2] || 0) + 1;
      }
    }

    const lastZTrans = transitions[lastZ] || {};
    let totalTrans = 0;
    Object.values(lastZTrans).forEach(v => { totalTrans += v; });

    allZodiacs.forEach(z => {
      const prob = totalTrans > 0 ? (lastZTrans[z] || 0) / totalTrans : (1.0 / 12.0);
      scores[z] += prob * 100 * w;
    });
  }

  // 9. 波色纠偏
  if (indicators.ENABLE_WAVE_REVERSION) {
    const w = weights.WAVE_REVERSION_WEIGHT ?? 1.0;
    const recent15 = dfRich.slice(-15);
    const waveCounts = { "红": 0, "蓝": 0, "绿": 0 };
    recent15.forEach(r => {
      if (r.waveColor && r.waveColor in waveCounts) {
        waveCounts[r.waveColor]++;
      }
    });

    const recentWavePct = {
      "红": waveCounts["红"] / 15,
      "蓝": waveCounts["蓝"] / 15,
      "绿": waveCounts["绿"] / 15
    };

    const expected = { "红": 17 / 49, "蓝": 16 / 49, "绿": 16 / 49 };
    const bias = {
      "红": Math.max(0, expected["红"] - recentWavePct["红"]),
      "蓝": Math.max(0, expected["蓝"] - recentWavePct["蓝"]),
      "绿": Math.max(0, expected["绿"] - recentWavePct["绿"])
    };

    allZodiacs.forEach(z => {
      const nums = ZODIAC_MAPPING[z];
      let sumBias = 0;
      nums.forEach(n => {
        const c = NUM_TO_WAVE[n] as "红" | "蓝" | "绿";
        sumBias += bias[c] || 0;
      });
      const zBiasScore = sumBias / nums.length;
      scores[z] += zBiasScore * 100 * w;
    });
  }

  // 10. 单双纠偏
  if (indicators.ENABLE_ODD_EVEN_REVERSION) {
    const w = weights.ODD_EVEN_REVERSION_WEIGHT ?? 1.0;
    const recent12 = dfRich.slice(-12);
    let oddCount = 0;
    recent12.forEach(r => { if (r.oddEven === "单") oddCount++; });
    const oddPct = oddCount / 12;
    const evenPct = 1 - oddPct;

    const biasOdd = Math.max(0, (25 / 49) - oddPct);
    const biasEven = Math.max(0, (24 / 49) - evenPct);

    allZodiacs.forEach(z => {
      const nums = ZODIAC_MAPPING[z];
      const odds = nums.filter(n => n % 2 !== 0).length / nums.length;
      const evens = 1 - odds;
      const zOeBias = (odds * biasOdd) + (evens * biasEven);
      scores[z] += zOeBias * 100 * w;
    });
  }

  // 11. 大小纠偏
  if (indicators.ENABLE_SIZE_REVERSION) {
    const w = weights.SIZE_REVERSION_WEIGHT ?? 1.0;
    const recent12 = dfRich.slice(-12);
    let bigCount = 0;
    recent12.forEach(r => { if (r.size === "大") bigCount++; });
    const bigPct = bigCount / 12;
    const smallPct = 1 - bigPct;

    const biasBig = Math.max(0, (25 / 49) - bigPct);
    const biasSmall = Math.max(0, (24 / 49) - smallPct);

    allZodiacs.forEach(z => {
      const nums = ZODIAC_MAPPING[z];
      const bigs = nums.filter(n => n >= 25).length / nums.length;
      const smalls = 1 - bigs;
      const zSzBias = (bigs * biasBig) + (smalls * biasSmall);
      scores[z] += zSzBias * 100 * w;
    });
  }

  // 12. 尾数纠偏
  if (indicators.ENABLE_TAIL_REVERSION) {
    const w = weights.TAIL_REVERSION_WEIGHT ?? 1.0;
    const recent20 = dfRich.slice(-20);
    const tailCounts: Record<number, number> = {};
    for (let t = 0; t < 10; t++) tailCounts[t] = 0;
    recent20.forEach(r => {
      if (r.tail !== undefined) tailCounts[r.tail]++;
    });

    const biasTails: Record<number, number> = {};
    for (let t = 0; t < 10; t++) {
      const expectedPct = t === 0 ? 4 / 49 : 5 / 49;
      const obsPct = tailCounts[t] / 20;
      biasTails[t] = Math.max(0, expectedPct - obsPct);
    }

    allZodiacs.forEach(z => {
      const nums = ZODIAC_MAPPING[z];
      let sumTailBias = 0;
      nums.forEach(n => {
        sumTailBias += biasTails[n % 10] || 0;
      });
      const zTailBias = sumTailBias / nums.length;
      scores[z] += zTailBias * 150 * w;
    });
  }

  // 13. 连续出现惩罚
  if (indicators.ENABLE_CONSECUTIVE_PENALTY) {
    const w = weights.CONSECUTIVE_PENALTY_WEIGHT ?? -3.0;
    const lastZ = dfRich[total - 1].zodiac;
    const lastZ2 = total >= 2 ? dfRich[total - 2].zodiac : null;

    // w is typically negative
    scores[lastZ] += 10.0 * Math.abs(w) * (w / Math.abs(w));

    if (lastZ2 && lastZ === lastZ2) {
      scores[lastZ] += 20.0 * Math.abs(w) * (w / Math.abs(w));
    }
  }

  // 14. 极限遗漏回补
  if (indicators.ENABLE_MAX_MISSING_RECOVERY) {
    const w = weights.MAX_MISSING_RECOVERY_WEIGHT ?? 2.5;
    allZodiacs.forEach(z => {
      const m = missingStats[z];
      if (m.currentMissing >= m.maxMissing * 0.8) {
        const recoveryFactor = Math.pow(m.currentMissing / m.maxMissing, 2);
        scores[z] += recoveryFactor * 15 * w;
      }
    });
  }

  // 15. 周期自相关分析
  if (indicators.ENABLE_CYCLE_ANALYSIS && total > 30) {
    const w = weights.CYCLE_ANALYSIS_WEIGHT ?? 1.5;
    allZodiacs.forEach(z => {
      const series = dfRich.map(r => r.zodiac === z ? 1 : 0);
      const meanVal = series.reduce((s, v) => s + v, 0) / total;
      const varVal = series.reduce((s, v) => s + Math.pow(v - meanVal, 2), 0) / total;

      let bestLag = 0;
      let maxCorr = -1.0;

      if (varVal > 0) {
        for (let lag = 1; lag <= 15; lag++) {
          const sT = series.slice(0, -lag);
          const sLag = series.slice(lag);
          let sumCorr = 0;
          for (let i = 0; i < sT.length; i++) {
            sumCorr += (sT[i] - meanVal) * (sLag[i] - meanVal);
          }
          const corr = (sumCorr / sT.length) / varVal;
          if (corr > maxCorr) {
            maxCorr = corr;
            bestLag = lag;
          }
        }
      }

      const m = missingStats[z];
      if (bestLag > 0 && m.currentMissing === bestLag && maxCorr > 0.05) {
        scores[z] += maxCorr * 50 * w;
      }
    });
  }

  // 16. 相似历史窗口
  if (indicators.ENABLE_SIMILAR_WINDOW && total > 10) {
    const w = weights.SIMILAR_WINDOW_WEIGHT ?? 2.0;
    const zSeries = dfRich.map(r => r.zodiac);
    
    // 2-order pattern: [Z_T-1, Z_T]
    let patternLen = 2;
    let targetPattern = zSeries.slice(-patternLen);
    
    const successorCounts: Record<string, number> = {};
    allZodiacs.forEach(z => { successorCounts[z] = 0; });
    let matches = 0;

    for (let i = 0; i < total - patternLen - 1; i++) {
      const window = zSeries.slice(i, i + patternLen);
      if (window[0] === targetPattern[0] && window[1] === targetPattern[1]) {
        const nextZ = zSeries[i + patternLen];
        successorCounts[nextZ]++;
        matches++;
      }
    }

    // fallback to 1-order: [Z_T]
    if (matches === 0) {
      patternLen = 1;
      targetPattern = zSeries.slice(-patternLen);
      for (let i = 0; i < total - patternLen - 1; i++) {
        const window = zSeries.slice(i, i + patternLen);
        if (window[0] === targetPattern[0]) {
          const nextZ = zSeries[i + patternLen];
          successorCounts[nextZ]++;
          matches++;
        }
      }
    }

    if (matches > 0) {
      allZodiacs.forEach(z => {
        const prob = successorCounts[z] / matches;
        scores[z] += prob * 40 * w;
      });
    }
  }

  // 17. 五行相生相克因子
  if (indicators.ENABLE_WUXING_HARMONY && total > 0) {
    const w = weights.WUXING_HARMONY_WEIGHT ?? 1.5;
    const lastZ = dfRich[total - 1].zodiac;
    
    const wuxingMap: Record<string, string> = {
      "猴": "金", "鸡": "金",
      "虎": "木", "兔": "木",
      "鼠": "水", "猪": "水",
      "蛇": "火", "马": "火",
      "牛": "土", "龙": "土", "羊": "土", "狗": "土"
    };

    const generationMap: Record<string, string> = {
      "金": "水",
      "水": "木",
      "木": "火",
      "火": "土",
      "土": "金"
    };

    const lastWuxing = wuxingMap[lastZ];
    const targetWuxing = generationMap[lastWuxing];

    allZodiacs.forEach(z => {
      if (wuxingMap[z] === targetWuxing) {
        scores[z] += 15.0 * w;
      }
    });
  }

  // 18. 生肖三合/六合共振因子
  if (indicators.ENABLE_ZODIAC_HARMONY && total > 0) {
    const w = weights.ZODIAC_HARMONY_WEIGHT ?? 1.8;
    const recent3 = dfRich.slice(-3).map(r => r.zodiac);

    const ChineseTriads = [
      ["鼠", "龙", "猴"],
      ["牛", "蛇", "鸡"],
      ["虎", "马", "狗"],
      ["兔", "羊", "猪"]
    ];

    const sixHarmonies: Record<string, string> = {
      "鼠": "牛", "牛": "鼠",
      "虎": "猪", "猪": "虎",
      "兔": "狗", "狗": "兔",
      "龙": "鸡", "鸡": "龙",
      "蛇": "羊", "羊": "蛇",
      "马": "猴", "猴": "马"
    };

    allZodiacs.forEach(z => {
      let resonance = 0;
      recent3.forEach(prevZ => {
        if (sixHarmonies[prevZ] === z) {
          resonance += 1.0;
        }
        ChineseTriads.forEach(triad => {
          if (triad.includes(prevZ) && triad.includes(z) && prevZ !== z) {
            resonance += 0.8;
          }
        });
      });
      scores[z] += resonance * 10 * w;
    });
  }

  // 19. 合数单双/大小大数纠偏因子
  if (indicators.ENABLE_HESHU_REVERSION && total > 12) {
    const w = weights.HESHU_REVERSION_WEIGHT ?? 1.2;
    const recent12 = dfRich.slice(-12);
    
    let oddCount = 0;
    let bigCount = 0;
    
    recent12.forEach(r => {
      const num = r.number;
      const sumOfDigits = Math.floor(num / 10) + (num % 10);
      if (sumOfDigits % 2 !== 0) oddCount++;
      if (sumOfDigits >= 7) bigCount++;
    });

    const oddPct = oddCount / 12;
    const bigPct = bigCount / 12;

    const biasOdd = Math.max(0, 0.5 - oddPct);
    const biasEven = Math.max(0, 0.5 - (1 - oddPct));
    const biasBig = Math.max(0, 0.5 - bigPct);
    const biasSmall = Math.max(0, 0.5 - (1 - bigPct));

    allZodiacs.forEach(z => {
      const nums = ZODIAC_MAPPING[z];
      let sumBias = 0;
      nums.forEach(n => {
        const sod = Math.floor(n / 10) + (n % 10);
        const isOdd = sod % 2 !== 0;
        const isBig = sod >= 7;
        
        sumBias += isOdd ? biasOdd : biasEven;
        sumBias += isBig ? biasBig : biasSmall;
      });
      const zHeShuBias = sumBias / nums.length;
      scores[z] += zHeShuBias * 100 * w;
    });
  }

  // 20. 时间衰减一阶马尔可夫 (Markov with Recency Decay)
  if (indicators.ENABLE_DECAY_MARKOV && total > 2) {
    const w = weights.DECAY_MARKOV_WEIGHT ?? 2.5;
    const lastZ = dfRich[total - 1].zodiac;
    
    const lambda = 0.97;
    const transitionScores: Record<string, number> = {};
    allZodiacs.forEach(z => { transitionScores[z] = 0; });
    let totalWeight = 0;

    for (let i = 0; i < total - 1; i++) {
      const z1 = dfRich[i].zodiac;
      const z2 = dfRich[i + 1].zodiac;
      if (z1 === lastZ) {
        const dist = total - 1 - i;
        const weight = Math.pow(lambda, dist);
        transitionScores[z2] += weight;
        totalWeight += weight;
      }
    }

    allZodiacs.forEach(z => {
      const prob = totalWeight > 0 ? transitionScores[z] / totalWeight : (1.0 / 12.0);
      scores[z] += prob * 100 * w;
    });
  }

  // 21. 属性联合转移因子 (Last Period Attribute to Next Zodiac Association)
  if (indicators.ENABLE_ATTRIBUTE_TRANSITION && total > 1) {
    const w = weights.ATTRIBUTE_TRANSITION_WEIGHT ?? 2.0;
    const lastRow = dfRich[total - 1];
    const lastStateKey = `${lastRow.waveColor || "红"}_${lastRow.size || "小"}_${lastRow.oddEven || "双"}`;

    const succCounts: Record<string, number> = {};
    allZodiacs.forEach(z => { succCounts[z] = 0; });
    let matchesCount = 0;

    for (let i = 0; i < total - 1; i++) {
      const row = dfRich[i];
      const stateKey = `${row.waveColor || "红"}_${row.size || "小"}_${row.oddEven || "双"}`;
      if (stateKey === lastStateKey) {
        const nextZodiac = dfRich[i + 1].zodiac;
        const recencyWeight = Math.pow(0.98, total - 1 - i);
        succCounts[nextZodiac] += recencyWeight;
        matchesCount += recencyWeight;
      }
    }

    if (matchesCount > 0) {
      allZodiacs.forEach(z => {
        const prob = succCounts[z] / matchesCount;
        scores[z] += prob * 100 * w;
      });
    }
  }

  // 归一化至 10 ~ 95
  const vals = Object.values(scores);
  const minS = Math.min(...vals);
  const maxS = Math.max(...vals);

  const normalized: Record<string, number> = {};
  if (maxS > minS) {
    allZodiacs.forEach(z => {
      normalized[z] = Math.round((10 + (scores[z] - minS) / (maxS - minS) * 85) * 10) / 10;
    });
  } else {
    allZodiacs.forEach(z => { normalized[z] = 50.0; });
  }

  return normalized;
}

export interface BacktestDetail {
  period: number;
  number: number;
  actual: string;
  recommended: string[];
  isHit: boolean;
  scores: Record<string, number>;
}

export interface BacktestResult {
  hitRate: number;
  hits: number;
  totalPeriods: number;
  randomHitRate: number;
  improvement: number;
  maxConsecutiveMisses: number;
  details: BacktestDetail[];
}

/**
 * 运行滚动回测 (Walk Forward)
 */
export function runWalkForwardBacktest(
  df: HistoryRecord[],
  startPeriod = 151,
  endPeriod = 191,
  settings: IndicatorSettings
): BacktestResult {
  const periods = df.map(r => r.period);
  const minPeriod = Math.min(...periods);
  const maxPeriod = Math.max(...periods);

  const testStart = Math.max(startPeriod, minPeriod + 30);
  const testEnd = Math.min(endPeriod, maxPeriod);

  let hits = 0;
  let totalTests = 0;
  const details: BacktestDetail[] = [];

  for (let p = testStart; p <= testEnd; p++) {
    // 1. Slice history strictly before period p
    const dfSlice = df.filter(r => r.period < p);
    if (dfSlice.length === 0) continue;

    // 2. Predict scores for next period p
    const scores = computeZodiacScores(dfSlice, settings);
    
    const recommendCount = settings?.recommendCount ?? 5;

    // Sort to get top recommendCount
    const sortedZodiacs = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    const recommended = sortedZodiacs.slice(0, recommendCount);

    // 3. Get actual result
    const actualRow = df.find(r => r.period === p);
    if (!actualRow) continue;

    const actualZodiac = actualRow.zodiac;
    const actualNum = actualRow.number;

    const isHit = recommended.includes(actualZodiac);
    if (isHit) hits++;
    totalTests++;

    details.push({
      period: p,
      number: actualNum,
      actual: actualZodiac,
      recommended,
      isHit,
      scores
    });
  }

  const recommendCount = settings?.recommendCount ?? 5;
  const hitRate = totalTests > 0 ? (hits / totalTests) * 100 : 0;
  const randomHitRate = (recommendCount / 12) * 100;
  const improvement = randomHitRate > 0 ? ((hitRate - randomHitRate) / randomHitRate) * 100 : 0;

  // Calculate maximum consecutive misses (连挂)
  let maxConsecutiveMisses = 0;
  let currentConsecutiveMisses = 0;
  details.forEach(d => {
    if (!d.isHit) {
      currentConsecutiveMisses++;
      if (currentConsecutiveMisses > maxConsecutiveMisses) {
        maxConsecutiveMisses = currentConsecutiveMisses;
      }
    } else {
      currentConsecutiveMisses = 0;
    }
  });

  return {
    hitRate: Math.round(hitRate * 100) / 100,
    hits,
    totalPeriods: totalTests,
    randomHitRate: Math.round(randomHitRate * 100) / 100,
    improvement: Math.round(improvement * 100) / 100,
    maxConsecutiveMisses,
    details
  };
}

/**
 * 计算全量历史真实滚动回测统计数据（用于全局实时胜率看板与录入动态联动）
 */
export function getRealtimeBacktestStats(
  df: HistoryRecord[],
  settings?: IndicatorSettings
) {
  if (!df || df.length < 30) {
    return {
      hitRate: 0,
      hits: 0,
      totalPeriods: 0,
      randomHitRate: 41.67,
      improvement: 0,
      latestDetail: null,
      previousDetail: null,
      details: []
    };
  }

  const result = runWalkForwardBacktest(
    df,
    0,
    999999,
    settings || DEFAULT_SETTINGS
  );

  const details = result.details || [];
  const latestDetail = details.length > 0 ? details[details.length - 1] : null;
  const previousDetail = details.length > 1 ? details[details.length - 2] : null;

  return {
    ...result,
    latestDetail,
    previousDetail
  };
}

/**
 * 贪心指标选择器与权重优化器
 */
export interface WeightChangeItem {
  key: string;
  weightKey: string;
  name: string;
  oldWeight: number;
  newWeight: number;
  oldEnabled: boolean;
  newEnabled: boolean;
  impact: number;
}

export interface OptimizationResult {
  settings: IndicatorSettings;
  initialHitRate: number;
  bestHitRate: number;
  improvement: number;
  weightChanges: WeightChangeItem[];
  logs: string[];
  initialMaxConsecutiveMisses: number;
  bestMaxConsecutiveMisses: number;
}

/**
 * 因子键到权重键的标准映射
 */
export const INDICATOR_TO_WEIGHT_MAP: Record<string, string> = {
  ENABLE_HISTORICAL_HEAT: "HISTORICAL_HEAT_WEIGHT",
  ENABLE_RECENT_HEAT_10: "RECENT_HEAT_10_WEIGHT",
  ENABLE_RECENT_HEAT_20: "RECENT_HEAT_20_WEIGHT",
  ENABLE_RECENT_HEAT_50: "RECENT_HEAT_50_WEIGHT",
  ENABLE_MISSING_VALUE: "MISSING_VALUE_WEIGHT",
  ENABLE_AVERAGE_INTERVAL: "AVERAGE_INTERVAL_WEIGHT",
  ENABLE_COLD_HOT_BALANCE: "COLD_HOT_BALANCE_WEIGHT",
  ENABLE_MARKOV: "MARKOV_WEIGHT",
  ENABLE_WAVE_REVERSION: "WAVE_REVERSION_WEIGHT",
  ENABLE_ODD_EVEN_REVERSION: "ODD_EVEN_REVERSION_WEIGHT",
  ENABLE_SIZE_REVERSION: "SIZE_REVERSION_WEIGHT",
  ENABLE_TAIL_REVERSION: "TAIL_REVERSION_WEIGHT",
  ENABLE_CONSECUTIVE_PENALTY: "CONSECUTIVE_PENALTY_WEIGHT",
  ENABLE_MAX_MISSING_RECOVERY: "MAX_MISSING_RECOVERY_WEIGHT",
  ENABLE_CYCLE_ANALYSIS: "CYCLE_ANALYSIS_WEIGHT",
  ENABLE_SIMILAR_WINDOW: "SIMILAR_WINDOW_WEIGHT",
  ENABLE_WUXING_HARMONY: "WUXING_HARMONY_WEIGHT",
  ENABLE_ZODIAC_HARMONY: "ZODIAC_HARMONY_WEIGHT",
  ENABLE_HESHU_REVERSION: "HESHU_REVERSION_WEIGHT",
  ENABLE_DECAY_MARKOV: "DECAY_MARKOV_WEIGHT",
  ENABLE_ATTRIBUTE_TRANSITION: "ATTRIBUTE_TRANSITION_WEIGHT"
};

/**
 * 因子权重智能优化器 (真实坐标下降与多轮参数自适应寻优，融合最大连挂惩罚)
 */
export function optimizeSettings(
  df: HistoryRecord[],
  startPeriod = 151,
  endPeriod = 191,
  baseSettings?: IndicatorSettings,
  onStepProgress?: (step: number, total: number, msg: string) => void,
  consecutiveMissPenaltyWeight = 2.0
): OptimizationResult {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  const initialSettings: IndicatorSettings = JSON.parse(
    JSON.stringify(baseSettings || DEFAULT_SETTINGS)
  );

  log(`🚀 启动 AI 因子权重智能优化引擎...`);
  log(`📊 滚动训练区间: 第 ${startPeriod} 期 ➔ 第 ${endPeriod} 期`);
  log(`🛡 最大连挂(连续未中)惩罚项权重: ${consecutiveMissPenaltyWeight.toFixed(1)}`);

  // 计算初始状态基准率与最大连挂
  const baseResult = runWalkForwardBacktest(df, startPeriod, endPeriod, initialSettings);
  const initialHitRate = baseResult.hitRate;
  const initialMaxMisses = baseResult.maxConsecutiveMisses;
  
  let bestHitRate = initialHitRate;
  let bestMaxMisses = initialMaxMisses;
  // 综合评估得分（Fitness）：胜率 - 惩罚权重 * 最大连挂期数
  let bestFitness = initialHitRate - (consecutiveMissPenaltyWeight * initialMaxMisses);

  log(`📌 初始基准表现 -> 命中率: ${initialHitRate.toFixed(2)}% | 最大连挂: ${initialMaxMisses}期 | 综合评分: ${bestFitness.toFixed(2)}`);

  const currentSettings: IndicatorSettings = JSON.parse(JSON.stringify(initialSettings));
  const indicatorKeys = Object.keys(DEFAULT_SETTINGS.indicators);

  // 第一阶段：多轮（2轮）双向因子筛选与开关修剪 (Multi-Pass Pruning & Activation)
  log(`\n🔍 [阶段一] 因子有效性与去噪深度测试 (双向贪心筛查 21 项因子，优化综合评分)...`);
  
  for (let pass = 1; pass <= 2; pass++) {
    log(`   ➔ 第 ${pass} 轮因子去噪与组合优化...`);
    indicatorKeys.forEach((indKey, idx) => {
      if (onStepProgress) {
        onStepProgress(
          (pass - 1) * indicatorKeys.length + idx + 1,
          indicatorKeys.length * 3,
          `第${pass}轮去噪筛查: ${indKey}...`
        );
      }

      const isCurrentlyOn = !!currentSettings.indicators[indKey];
      const trialSettings: IndicatorSettings = JSON.parse(JSON.stringify(currentSettings));
      
      // 尝试反转状态（开启变为关闭，关闭变为开启）
      trialSettings.indicators[indKey] = !isCurrentlyOn;

      const trialRes = runWalkForwardBacktest(df, startPeriod, endPeriod, trialSettings);
      const trialHitRate = trialRes.hitRate;
      const trialMaxMisses = trialRes.maxConsecutiveMisses;
      const trialFitness = trialHitRate - (consecutiveMissPenaltyWeight * trialMaxMisses);

      // 如果反转后综合评分（Fitness）严格增加，则采用新状态（开启有效因子，关闭噪音因子）
      if (trialFitness > bestFitness + 0.001) {
        currentSettings.indicators[indKey] = !isCurrentlyOn;
        const deltaHit = trialHitRate - bestHitRate;
        const deltaMisses = trialMaxMisses - bestMaxMisses;
        bestFitness = trialFitness;
        bestHitRate = trialHitRate;
        bestMaxMisses = trialMaxMisses;
        log(`  ✔ [因子去噪] ${indKey} 调为 [${!isCurrentlyOn ? "开启" : "静默/关闭"}] ➔ 胜率变化: ${deltaHit >= 0 ? "+" : ""}${deltaHit.toFixed(2)}%, 最大连挂变化: ${deltaMisses >= 0 ? "+" : ""}${deltaMisses}期 (综合评分提升至 ${bestFitness.toFixed(2)})`);
      } else if (isCurrentlyOn && Math.abs(trialFitness - bestFitness) <= 0.001) {
        // 保证系统至少保留 4 项活跃分析因子，避免模型完全退化
        const activeCount = Object.values(currentSettings.indicators).filter(Boolean).length;
        if (activeCount > 4) {
          currentSettings.indicators[indKey] = false;
          bestFitness = trialFitness;
          bestHitRate = trialHitRate;
          bestMaxMisses = trialMaxMisses;
          log(`  🛡 [去除冗余] ${indKey} 对综合评分无贡献，已调为 [静默/关闭] (保持评分 ${bestFitness.toFixed(2)})`);
        }
      }
    });
  }

  // 第二阶段：因子权重坐标下降深探 (Coordinate Descent Weight Optimization)
  log(`\n⚡ [阶段二] 活跃因子权重系数自适应调优 (坐标下降法)...`);

  const activeIndicators = indicatorKeys.filter(k => currentSettings.indicators[k]);

  activeIndicators.forEach((indKey, idx) => {
    const wKey = INDICATOR_TO_WEIGHT_MAP[indKey];
    if (!wKey) return;

    if (onStepProgress) {
      onStepProgress(
        indicatorKeys.length * 2 + idx + 1,
        indicatorKeys.length * 3,
        `优化权重 ${wKey}...`
      );
    }

    const currentW = currentSettings.weights[wKey] ?? 1.0;
    
    // 针对负惩罚因子与正加分因子设计探针集合
    let candidateWeights: number[] = [];

    if (currentW < 0 || indKey.includes("PENALTY")) {
      candidateWeights = [-0.5, -1.0, -1.5, -2.0, -2.5, -3.0, -4.0, -5.0, -6.0, -8.0, 0.0];
    } else {
      candidateWeights = [
        currentW * 0.2,
        currentW * 0.5,
        currentW * 0.8,
        currentW * 1.2,
        currentW * 1.5,
        currentW * 2.0,
        currentW * 2.5,
        currentW * 3.0,
        currentW * 4.0,
        currentW * 5.0,
        currentW + 0.5,
        currentW + 1.0,
        currentW + 2.0,
        Math.max(0.1, currentW - 0.5)
      ];
    }

    // 过滤并去重，控制在合理区间 [-10, 10]
    candidateWeights = Array.from(
      new Set(
        candidateWeights
          .map(w => Math.round(w * 10) / 10)
          .filter(w => w >= -10 && w <= 10 && w !== currentW)
      )
    );

    let bestWForThisKey = currentW;

    candidateWeights.forEach(trialW => {
      const trialSettings: IndicatorSettings = JSON.parse(JSON.stringify(currentSettings));
      trialSettings.weights[wKey] = trialW;

      const trialRes = runWalkForwardBacktest(df, startPeriod, endPeriod, trialSettings);
      const trialHitRate = trialRes.hitRate;
      const trialMaxMisses = trialRes.maxConsecutiveMisses;
      const trialFitness = trialHitRate - (consecutiveMissPenaltyWeight * trialMaxMisses);

      if (trialFitness > bestFitness) {
        const deltaHit = trialHitRate - bestHitRate;
        const deltaMisses = trialMaxMisses - bestMaxMisses;
        bestFitness = trialFitness;
        bestHitRate = trialHitRate;
        bestMaxMisses = trialMaxMisses;
        bestWForThisKey = trialW;
        log(`  ★ [权重升级] ${wKey}: ${currentW.toFixed(1)}x ➔ ${trialW.toFixed(1)}x | 胜率变化: ${deltaHit >= 0 ? "+" : ""}${deltaHit.toFixed(2)}%, 最大连挂变化: ${deltaMisses >= 0 ? "+" : ""}${deltaMisses}期 (综合评分提升至 ${bestFitness.toFixed(2)})`);
      }
    });

    currentSettings.weights[wKey] = bestWForThisKey;
  });

  // 第三阶段：统计对比并生成变更明细
  const weightChanges: WeightChangeItem[] = [];

  indicatorKeys.forEach(indKey => {
    const wKey = INDICATOR_TO_WEIGHT_MAP[indKey];
    if (!wKey) return;

    const oldW = initialSettings.weights[wKey] ?? 1.0;
    const newW = currentSettings.weights[wKey] ?? 1.0;
    const oldEnabled = !!initialSettings.indicators[indKey];
    const newEnabled = !!currentSettings.indicators[indKey];

    // 计算单个因子的贡献
    const singleTrialSettings = JSON.parse(JSON.stringify(currentSettings));
    singleTrialSettings.weights[wKey] = oldW;
    singleTrialSettings.indicators[indKey] = oldEnabled;

    const singleRes = runWalkForwardBacktest(df, startPeriod, endPeriod, singleTrialSettings);
    const singleFitness = singleRes.hitRate - (consecutiveMissPenaltyWeight * singleRes.maxConsecutiveMisses);
    const impact = Math.round((bestFitness - singleFitness) * 100) / 100;

    weightChanges.push({
      key: indKey,
      weightKey: wKey,
      name: indKey,
      oldWeight: oldW,
      newWeight: newW,
      oldEnabled,
      newEnabled,
      impact
    });
  });

  const improvement = Math.round((bestHitRate - initialHitRate) * 100) / 100;

  log(`\n🎉 AI 因子权重寻优圆满完成！`);
  log(`🎯 初始指标 -> 命中率: ${initialHitRate.toFixed(2)}% | 最大连挂: ${initialMaxMisses}期`);
  log(`🎯 最佳指标 -> 命中率: ${bestHitRate.toFixed(2)}% | 最大连挂: ${bestMaxMisses}期 (连挂较最初减少 ${initialMaxMisses - bestMaxMisses} 期)`);
  log(`🎯 综合评估最佳评分: ${bestFitness.toFixed(2)} (比原始评分提升 +${(bestFitness - (initialHitRate - consecutiveMissPenaltyWeight * initialMaxMisses)).toFixed(2)})`);

  return {
    settings: currentSettings,
    initialHitRate: Math.round(initialHitRate * 100) / 100,
    bestHitRate: Math.round(bestHitRate * 100) / 100,
    improvement,
    weightChanges,
    logs,
    initialMaxConsecutiveMisses: initialMaxMisses,
    bestMaxConsecutiveMisses: bestMaxMisses
  };
}
