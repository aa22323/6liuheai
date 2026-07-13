/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Settings, Save, RotateCcw, ShieldCheck, Info, Sparkles } from "lucide-react";
import { DEFAULT_SETTINGS, IndicatorSettings } from "../utils/lotteryEngine";
import { saveStrategyConfig } from "../firebase";

interface ConfigTabProps {
  activeSettings: any;
  setActiveSettings: (settings: any) => void;
}

export default function ConfigTab({ activeSettings, setActiveSettings }: ConfigTabProps) {
  const settings = activeSettings;
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const handleRecommendCountChange = (count: number) => {
    setActiveSettings((prev: any) => ({
      ...prev,
      recommendCount: count
    }));
  };

  const handleToggle = (key: string) => {
    setActiveSettings((prev: any) => ({
      ...prev,
      indicators: {
        ...prev.indicators,
        [key]: !prev.indicators[key]
      }
    }));
  };

  const handleWeightChange = (key: string, val: number) => {
    setActiveSettings((prev: any) => ({
      ...prev,
      weights: {
        ...prev.weights,
        [key]: val
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveStrategyConfig(settings);
      setMessage("🎉 策略因子与权重已成功写入 Cloud Firestore 数据库，下一次预测与回测立即生效！");
    } catch (e: any) {
      setMessage(`❌ 保存失败: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const handleResetDefaults = () => {
    setActiveSettings(DEFAULT_SETTINGS);
    setMessage("已恢复默认的科学评测量化系数！点击保存以应用。");
    setTimeout(() => setMessage(""), 4000);
  };

  // 保证已载入设置
  if (!settings || !settings.indicators) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Settings className="w-12 h-12 mb-3 text-emerald-500 animate-spin" />
        <div className="text-sm font-medium">正在读取因子权重配置...</div>
      </div>
    );
  }

  // 指标中英文对照定义
  const INDICATOR_DETAILS: Record<string, { title: string; desc: string; weightKey: string }> = {
    ENABLE_HISTORICAL_HEAT: {
      title: "1. 历史冷热度 (Historical Heat)",
      desc: "计算生肖在长周期所有期数中的总体出场频次占比。",
      weightKey: "HISTORICAL_HEAT_WEIGHT"
    },
    ENABLE_RECENT_HEAT_10: {
      title: "2. 最近10期爆发度",
      desc: "近10期滑动窗内的高频活跃度，捕捉中短线强势生肖脉冲。",
      weightKey: "RECENT_HEAT_10_WEIGHT"
    },
    ENABLE_RECENT_HEAT_20: {
      title: "3. 最近20期爆发度",
      desc: "近20期滑动窗频数占比，结合10期形成动量金叉效应。",
      weightKey: "RECENT_HEAT_20_WEIGHT"
    },
    ENABLE_RECENT_HEAT_50: {
      title: "4. 最近50期爆发度",
      desc: "近50期滑动窗频数，提供中长线支撑位频数数据支持。",
      weightKey: "RECENT_HEAT_50_WEIGHT"
    },
    ENABLE_MISSING_VALUE: {
      title: "5. 现行遗漏值比例 (Missing Ratio)",
      desc: "当前已遗漏未出的期数除以其历史平均出现间隔。越接近或超过1.0回归动能越大。",
      weightKey: "MISSING_VALUE_WEIGHT"
    },
    ENABLE_AVERAGE_INTERVAL: {
      title: "6. 历史平均间隔 (Avg Interval)",
      desc: "生肖每次开出之间的平均空白周期。平均周期越短代表其自身循环频度越高。",
      weightKey: "AVERAGE_INTERVAL_WEIGHT"
    },
    ENABLE_COLD_HOT_BALANCE: {
      title: "7. 冷热能量守恒 (Momentum Balance)",
      desc: "近期频次对比历史总平均，计算能量动量溢出差，偏好追随高热势能。",
      weightKey: "COLD_HOT_BALANCE_WEIGHT"
    },
    ENABLE_MARKOV: {
      title: "8. 马尔可夫转移概率 (Markov Chain)",
      desc: "基于一阶状态转移矩阵，计算上期生肖向本期12生肖流向的历史转移概率。",
      weightKey: "MARKOV_WEIGHT"
    },
    ENABLE_WAVE_REVERSION: {
      title: "9. 红蓝绿波色纠偏",
      desc: "若近期开出某主色系波色严重低于大数规律概率 (34/32/32%)，拉抬该波色所属生肖评分。",
      weightKey: "WAVE_REVERSION_WEIGHT"
    },
    ENABLE_ODD_EVEN_REVERSION: {
      title: "10. 单双概率修正",
      desc: "监测近12期内单数与双数的极端占比。当某一方过度饱和时，反向拉抬对立面生肖评分。",
      weightKey: "ODD_EVEN_REVERSION_WEIGHT"
    },
    ENABLE_SIZE_REVERSION: {
      title: "11. 大小概率纠偏",
      desc: "类似单双。对近12期开奖号码大小比进行反演修正，促使号码大小指标向 1:1 回归。",
      weightKey: "SIZE_REVERSION_WEIGHT"
    },
    ENABLE_TAIL_REVERSION: {
      title: "12. 0-9尾数分布均值偏离",
      desc: "极细粒度的数字尾数偏离分析。近20期如果某些尾数稀缺，会强烈拉抬含有该尾数生肖的分值。",
      weightKey: "TAIL_REVERSION_WEIGHT"
    },
    ENABLE_CONSECUTIVE_PENALTY: {
      title: "13. 连续开出惩罚 (Consecutive Penalty)",
      desc: "香港特码极罕见连续3期开出相同生肖。上期或近2期刚开出的生肖将面临严重的降权调减（负权重）。",
      weightKey: "CONSECUTIVE_PENALTY_WEIGHT"
    },
    ENABLE_MAX_MISSING_RECOVERY: {
      title: "14. 历史最大遗漏突破回补",
      desc: "当某生肖目前遗漏期数逼近该生肖历史录得的最大遗漏值的80%以上时，给予呈二次幂增长的回归补偿高分。",
      weightKey: "MAX_MISSING_RECOVERY_WEIGHT"
    },
    ENABLE_CYCLE_ANALYSIS: {
      title: "15. 周期自相关谱 (Autocorrelation)",
      desc: "应用自相关滞后 (lags 1~15) 搜索自相关系数极值。当遗漏达到该自相关周期峰值时给予高分奖励。",
      weightKey: "CYCLE_ANALYSIS_WEIGHT"
    },
    ENABLE_SIMILAR_WINDOW: {
      title: "16. 相似历史时空窗口 (Pattern Matching)",
      desc: "对比最近几期生肖走势，在全历史轴搜索相近的特码指纹序列片段，提取其历史下一期后续生肖的共性统计。",
      weightKey: "SIMILAR_WINDOW_WEIGHT"
    },
    ENABLE_WUXING_HARMONY: {
      title: "17. 五行相生相克磁场 (Five Elements)",
      desc: "计算上期生肖之五行属性（金木水火土），依据相生相克循环（如木生火，火生土）动态计算下期合宜生肖。",
      weightKey: "WUXING_HARMONY_WEIGHT"
    },
    ENABLE_ZODIAC_HARMONY: {
      title: "18. 三合/六合共振动能 (Zodiac Harmonies)",
      desc: "分析近期开奖生肖的传统“三合”（如虎马狗）与“六合”（如鼠牛）和谐磁场，对产生关联共振的生肖进行增益奖励。",
      weightKey: "ZODIAC_HARMONY_WEIGHT"
    },
    ENABLE_HESHU_REVERSION: {
      title: "19. 合数大小/单双大数修正 (He Shu Reversion)",
      desc: "分析号码个位与十位相加之和（合数）的单双/大小近期偏离度，对偏离值较高的反向属性生肖实施回归补偿。",
      weightKey: "HESHU_REVERSION_WEIGHT"
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部配置操作 */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-md font-bold text-gray-900 flex items-center gap-1.5">
            <Settings className="text-slate-700 w-5 h-5" />
            评分决策控制面板 (16项核心因子)
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            你可以手动调整各个因子开关与权重。点击保存后将直接修改服务器端，下一期分析将完全采用你的专属设置。
          </p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={handleResetDefaults}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            还原默认值
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-emerald-400" />
            {saving ? "写入中..." : "保存因子配置"}
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-fadeIn font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* 推荐生肖个数自由选择 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Sparkles className="text-emerald-600 w-4.5 h-4.5" />
              自由选择推荐生肖个数 (Recommended Zodiacs Count)
            </h4>
            <p className="text-xs text-gray-400">
              设置系统在<strong>推荐预测</strong>和<strong>滚动回测</strong>中推荐的生肖个数。生肖选择越多，命中难度越低（覆盖率更宽），策略基准率相应变化。
            </p>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/50 self-start lg:self-center shrink-0">
            {[5, 6, 7, 8].map((count) => {
              const isActive = (settings.recommendCount ?? 5) === count;
              const randomRate = ((count / 12) * 100).toFixed(1);
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleRecommendCountChange(count)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center gap-0.5 min-w-[80px] ${
                    isActive
                      ? "bg-white text-emerald-600 shadow-sm border border-slate-200/30"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <span>{count} 生肖</span>
                  <span className={`text-[9px] font-medium ${isActive ? "text-emerald-500/80" : "text-gray-400"}`}>
                    基准 {randomRate}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 因子列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Object.entries(INDICATOR_DETAILS).map(([indKey, detail]) => {
          const isEnabled = settings.indicators[indKey] ?? false;
          const wKey = detail.weightKey;
          const weightVal = settings.weights[wKey] ?? 1.0;

          return (
            <div
              key={indKey}
              className={`p-5 rounded-2xl border transition-all ${
                isEnabled
                  ? "bg-white border-slate-200 shadow-xs"
                  : "bg-gray-50/50 border-gray-100 opacity-70"
              }`}
            >
              {/* 开关部分 */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isEnabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                    {detail.title}
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                    {detail.desc}
                  </p>
                </div>
                
                {/* Switch checkbox */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggle(indKey)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {/* 权重调节滑块 */}
              {isEnabled && (
                <div className="mt-5 pt-4 border-t border-gray-50 flex items-center gap-4 animate-fadeIn">
                  <div className="text-xs font-semibold text-gray-500 shrink-0 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-gray-400" />
                    量化评分权重系数：
                  </div>
                  
                  <input
                    type="range"
                    min={wKey.includes("PENALTY") ? -5 : 0.5}
                    max={wKey.includes("PENALTY") ? -0.5 : 5}
                    step="0.1"
                    value={weightVal}
                    onChange={e => handleWeightChange(wKey, parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-slate-800"
                  />
                  
                  <div className="w-12 text-right font-mono text-xs font-bold text-slate-800">
                    {weightVal.toFixed(1)}x
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
