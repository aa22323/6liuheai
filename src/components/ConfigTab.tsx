/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Settings, Save, RotateCcw, ShieldCheck, Info, Sparkles, Layers } from "lucide-react";
import { DEFAULT_SETTINGS, IndicatorSettings } from "../utils/lotteryEngine";
import { saveStrategyConfig } from "../firebase";
import { ZODIAC_MAPPING } from "../utils/zodiacConfig";

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

  const handleLunarYearChange = (year: number) => {
    setActiveSettings((prev: any) => ({
      ...prev,
      lunarYear: year
    }));
  };

  const getZodiacForYear = (year: number) => {
    const ZODIAC_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
    const baseYear = 2026;
    const baseIdx = 6; // 2026 马
    let idx = (baseIdx + (year - baseYear)) % 12;
    if (idx < 0) idx += 12;
    return ZODIAC_ORDER[idx];
  };

  const handleModeChange = (mode: "auto" | "custom") => {
    setActiveSettings((prev: any) => {
      const next: any = {
        ...prev,
        zodiacMode: mode
      };
      if (mode === "custom" && !prev.customZodiacMapping) {
        // 自动初始化自定义映射（从当前公式生成）
        const ZODIAC_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
        const activeYear = prev.lunarYear ?? 2026;
        const baseYear = 2026;
        const baseIdx = 6;
        let activeIdx = (baseIdx + (activeYear - baseYear)) % 12;
        if (activeIdx < 0) activeIdx += 12;

        const importedMapping: Record<string, number[]> = {};
        ZODIAC_ORDER.forEach(z => {
          importedMapping[z] = [];
        });

        for (let num = 1; num <= 49; num++) {
          const offset = num - 1;
          const zIdx = (activeIdx - (offset % 12) + 12) % 12;
          const zodiac = ZODIAC_ORDER[zIdx];
          importedMapping[zodiac].push(num);
        }
        next.customZodiacMapping = importedMapping;
      }
      return next;
    });
  };

  const handleCustomMappingChange = (zodiac: string, valueStr: string) => {
    // 解析逗号/空格分隔的数字列表
    const parsedNums = valueStr
      .split(/[,，\s]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= 49);

    const uniqueNums = Array.from(new Set(parsedNums)).sort((a, b) => a - b);

    setActiveSettings((prev: any) => ({
      ...prev,
      customZodiacMapping: {
        ...(prev.customZodiacMapping || {}),
        [zodiac]: uniqueNums
      }
    }));
  };

  const handleImportFromFormula = () => {
    const ZODIAC_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
    const activeYear = settings.lunarYear ?? 2026;
    const baseYear = 2026;
    const baseIdx = 6;
    let activeIdx = (baseIdx + (activeYear - baseYear)) % 12;
    if (activeIdx < 0) activeIdx += 12;

    const importedMapping: Record<string, number[]> = {};
    ZODIAC_ORDER.forEach(z => {
      importedMapping[z] = [];
    });

    for (let num = 1; num <= 49; num++) {
      const offset = num - 1;
      const zIdx = (activeIdx - (offset % 12) + 12) % 12;
      const zodiac = ZODIAC_ORDER[zIdx];
      importedMapping[zodiac].push(num);
    }

    setActiveSettings((prev: any) => ({
      ...prev,
      customZodiacMapping: importedMapping
    }));
    setMessage("已根据当前选择年份的物理公式成功重置自定义号码映射！编辑完毕后，请点击上方‘保存因子配置’使设置全局生效。");
    setTimeout(() => setMessage(""), 5000);
  };

  const handleBacktestWindowChange = (windowVal: string) => {
    const parsedVal = windowVal === "all" ? null : parseInt(windowVal, 10);
    setActiveSettings((prev: any) => ({
      ...prev,
      backtestWindow: parsedVal
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
    },
    ENABLE_DECAY_MARKOV: {
      title: "20. 时间衰减马尔可夫转移 (Decay Markov)",
      desc: "基于时间衰减的一阶状态转移矩阵。近期的序列转移轨迹将被赋予更高的指数级权重，克服长期静态噪声，灵敏捕捉近期连贯惯性。",
      weightKey: "DECAY_MARKOV_WEIGHT"
    },
    ENABLE_ATTRIBUTE_TRANSITION: {
      title: "21. 属性特征关联转移因子 (Attribute-Zodiac Co-occurrence)",
      desc: "多维特征的深度伴随律。统计上期开奖对应的衍生属性组合（红/蓝/绿波色、大/小、单/双）在历史上伴随出现过的后续生肖概率，并加入时间衰减因子修正。",
      weightKey: "ATTRIBUTE_TRANSITION_WEIGHT"
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

      {/* 岁次更替：当前农历年份与生肖对应关系 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4 gap-3">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Layers className="text-slate-800 w-4.5 h-4.5" />
              生肖号码规则设置 (Zodiac & Numbers Mapping)
            </h4>
            <p className="text-xs text-gray-400">
              设置香港特码的生肖与号码（1-49）对应映射关系。支持按岁次公式自动演进，或根据特定规则手动自定义。
            </p>
          </div>
          
          {/* 模式选择 */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => handleModeChange("auto")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                (settings.zodiacMode ?? "auto") === "auto"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200/50"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              按岁次自动推导
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("custom")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                (settings.zodiacMode ?? "auto") === "custom"
                  ? "bg-white text-slate-900 shadow-2xs border border-slate-200/50"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              完全手动自定义
            </button>
          </div>
        </div>

        {/* 1. 自动岁次模式 UI */}
        {(settings.zodiacMode ?? "auto") === "auto" && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  选择农历年份：
                </span>
                <p className="text-[11px] text-gray-400">
                  支持自定义 2020 - 2036 宽幅年份（自动按逆时针岁次分配，本命年占据号码 1, 13, 25, 37, 49）。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <select
                  value={settings.lunarYear ?? 2026}
                  onChange={(e) => handleLunarYearChange(Number(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer shadow-2xs"
                >
                  {Array.from({ length: 17 }, (_, i) => 2020 + i).map((year) => (
                    <option key={year} value={year}>
                      {year} 年 ({getZodiacForYear(year)}年)
                    </option>
                  ))}
                </select>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                <div className="flex flex-wrap gap-1.5">
                  {[2025, 2026, 2027, 2028, 2029].map((year) => {
                    const yearLabels: Record<number, string> = {
                      2025: "2025 蛇年",
                      2026: "2026 马年",
                      2027: "2027 羊年",
                      2028: "2028 猴年",
                      2029: "2029 鸡年"
                    };
                    const isActive = (settings.lunarYear ?? 2026) === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => handleLunarYearChange(year)}
                        className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          isActive
                            ? "bg-slate-900 text-white shadow-sm"
                            : "bg-slate-100 text-gray-500 hover:bg-slate-200 border border-slate-200/50"
                        }`}
                      >
                        {yearLabels[year]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 自动对应号码实时预览 */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-bold text-slate-500 mb-3 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>当前设置【{settings.lunarYear ?? 2026} 年】的【生肖 ➔ 号码】对应关系公式预览：</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(ZODIAC_MAPPING).map(([zodiac, nums]) => (
                  <div key={zodiac} className="bg-white p-2.5 rounded-lg border border-gray-200/60 shadow-2xs flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">{zodiac}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500">
                        {nums.length}码
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {nums.map((n) => (
                        <span
                          key={n}
                          className="text-[10px] font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 border border-slate-200/40"
                        >
                          {String(n).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. 手动自定义模式 UI */}
        {(settings.zodiacMode ?? "auto") === "custom" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-amber-50/60 border border-amber-100 rounded-xl">
              <div className="space-y-1">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  当前处于“完全手动自定义号码”模式
                </span>
                <p className="text-[11px] text-amber-700">
                  您可以直接在下方输入框中手动键入或编辑12生肖对应的号码（1-49，使用空格或逗号分隔）。
                </p>
              </div>
              <button
                type="button"
                onClick={handleImportFromFormula}
                className="px-3 py-1.5 bg-white border border-amber-200 text-amber-800 text-xs font-bold rounded-lg shadow-2xs hover:bg-amber-50 transition-all cursor-pointer whitespace-nowrap"
              >
                从公式一键导入现有配置
              </button>
            </div>

            {/* 12生肖编辑输入框网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"].map((zodiac) => {
                const nums = settings.customZodiacMapping?.[zodiac] || [];
                const valueStr = nums.join(", ");
                return (
                  <div key={zodiac} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-5 h-5 flex items-center justify-center rounded-md bg-slate-900 text-white font-mono text-[11px]">
                          {zodiac}
                        </span>
                        <span>{zodiac}年专属号码</span>
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500">
                        已分配 {nums.length} 码
                      </span>
                    </div>
                    <input
                      type="text"
                      value={valueStr}
                      onChange={(e) => handleCustomMappingChange(zodiac, e.target.value)}
                      placeholder="输入号码，如：1, 13, 25, 37, 49"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg shadow-2xs focus:border-slate-400 focus:outline-hidden"
                    />
                    <div className="flex flex-wrap gap-1 mt-0.5 min-h-[20px]">
                      {nums.map((n) => (
                        <span
                          key={n}
                          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white text-slate-500 border border-slate-200/40"
                        >
                          {String(n).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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

      {/* 回测数据历史跨度控制 */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <RotateCcw className="text-indigo-600 w-4.5 h-4.5" />
              回测数据历史跨度控制 (Backtest History Window Size)
            </h4>
            <p className="text-xs text-gray-400">
              您可以控制滚动回测算法所调取的最大历史样本区间。如果只关心最新短线走势，缩短跨度可以更好观察最新几期的命中活跃度；如果想评估因子的跨年度宏观稳定性，建议使用“全部期数”。
            </p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/50 self-start lg:self-center shrink-0 gap-0.5">
            {[
              { label: "全部期数", value: "all" },
              { label: "最近 100 期", value: "100" },
              { label: "最近 50 期", value: "50" },
              { label: "最近 30 期", value: "30" }
            ].map((option) => {
              const currentValStr = settings.backtestWindow === null || settings.backtestWindow === undefined ? "all" : String(settings.backtestWindow);
              const isActive = currentValStr === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleBacktestWindowChange(option.value)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-indigo-600 shadow-2xs border border-slate-200/30"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {option.label}
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
