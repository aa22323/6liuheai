/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Sparkles, BarChart3, Settings, Database, FileCode, Landmark, RefreshCw, Layers, Target, CheckCircle2, XCircle } from "lucide-react";
import { HistoryRecord, DEFAULT_SETTINGS, getRealtimeBacktestStats } from "./utils/lotteryEngine";
import { getHistoryRecords, getStrategyConfig } from "./firebase";
import { updateZodiacMapping } from "./utils/zodiacConfig";

// Import custom modular components
import PredictionTab from "./components/PredictionTab";
import BacktestTab from "./components/BacktestTab";
import StatisticsTab from "./components/StatisticsTab";
import ConfigTab from "./components/ConfigTab";
import DataTab from "./components/DataTab";
import PythonTab from "./components/PythonTab";

const getZodiacName = (year: number) => {
  const ZODIAC_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
  const baseYear = 2026;
  const baseIdx = 6; // 2026 马
  let idx = (baseIdx + (year - baseYear)) % 12;
  if (idx < 0) idx += 12;
  return ZODIAC_ORDER[idx];
};

const getLunisolarName = (year: number) => {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const offset = year - 2026;
  let stemIdx = (2 + offset) % 10;
  if (stemIdx < 0) stemIdx += 10;
  let branchIdx = (6 + offset) % 12;
  if (branchIdx < 0) branchIdx += 12;
  return `${stems[stemIdx]}${branches[branchIdx]}${getZodiacName(year)}年`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("predict");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [activeSettings, setActiveSettings] = useState<any>(DEFAULT_SETTINGS);

  const fetchHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const records = await getHistoryRecords();
      setHistory(records);
    } catch (e: any) {
      setError(`加载历史数据发生错误: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    
    // Direct Firestore load for strategy configuration
    getStrategyConfig()
      .then(config => {
        if (config) {
          setActiveSettings(config);
        }
      })
      .catch((err) => {
        console.error("Failed to load Firebase config:", err);
      });

    // Mobile browser visibility & bfcache refresh handler
    const handleVisibilityOrPageShow = () => {
      if (document.visibilityState === "visible") {
        fetchHistory();
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        fetchHistory();
      }
    };

    window.addEventListener("focus", handleVisibilityOrPageShow);
    document.addEventListener("visibilitychange", handleVisibilityOrPageShow);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrPageShow);
      document.removeEventListener("visibilitychange", handleVisibilityOrPageShow);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // 实时重构前端特码与生肖对应关系（在 Render 期间同步更新，防止 React useEffect 异步滞后导致预览不同步）
  if (activeSettings) {
    if (activeSettings.zodiacMode === "custom" && activeSettings.customZodiacMapping) {
      updateZodiacMapping(activeSettings.customZodiacMapping);
    } else if (activeSettings.lunarYear) {
      updateZodiacMapping(activeSettings.lunarYear);
    }
  }

  // 全量历史真实滚动回测统计数据（随 history 或 activeSettings 动态联动）
  const realtimeStats = getRealtimeBacktestStats(history, activeSettings);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 font-sans flex flex-col antialiased">
      {/* 顶部主横幅 / 导航 */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-xs backdrop-blur-md bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* 左侧：Logo & 标题 */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-600/10 shrink-0">
                <Sparkles className="text-white w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-md font-black tracking-tight text-slate-900 flex items-center gap-1.5 leading-none">
                  LOTTERY AI
                  <span className="text-[10px] bg-slate-100 border border-slate-200/50 text-slate-500 font-bold px-1.5 py-0.5 rounded-sm">
                    港彩特码量化版
                  </span>
                </h1>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                  12生肖多因子量化分析与滚动回测策略系统
                </p>
              </div>
            </div>

            {/* 右侧：状态面板与实时胜率 */}
            <div className="flex items-center gap-3 text-xs font-semibold">
              {/* 🎯 全局真实回测胜率实时小卡片 */}
              {history.length >= 30 && (
                <div 
                  className="hidden lg:flex items-center gap-2 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/50 border border-emerald-200/80 px-3 py-1.5 rounded-xl text-emerald-900 shadow-2xs hover:shadow-xs transition-all cursor-default"
                  title="根据严格 Walk-Forward 滚动无未来数据回测算出的真实胜率"
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Target className="w-4 h-4 text-emerald-600 animate-pulse shrink-0" />
                    <span className="text-gray-500 font-medium text-[11px]">真实回测胜率:</span>
                    <span className="font-mono font-black text-emerald-700 text-sm">
                      {realtimeStats.hitRate.toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-emerald-700/80 font-semibold font-mono">
                      ({realtimeStats.hits}/{realtimeStats.totalPeriods}期)
                    </span>
                  </div>

                  {realtimeStats.latestDetail && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 border shrink-0 ${
                      realtimeStats.latestDetail.isHit 
                        ? "bg-emerald-100/90 text-emerald-800 border-emerald-300" 
                        : "bg-rose-100/90 text-rose-800 border-rose-200"
                    }`}>
                      <span>第{realtimeStats.latestDetail.period}期</span>
                      {realtimeStats.latestDetail.isHit ? (
                        <span className="flex items-center gap-0.5 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>命中</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-rose-700">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>未中</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="hidden sm:flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                  <Landmark className="w-3.5 h-3.5" />
                  <span className="font-bold">
                    {activeSettings?.zodiacMode === "custom"
                      ? "自定义号码开奖映射表"
                      : `${activeSettings?.lunarYear ?? 2026}年 ${getLunisolarName(activeSettings?.lunarYear ?? 2026)}开奖映射表`}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>已载入：{history.length} 期数据</span>
                </div>
              </div>

              <button
                onClick={fetchHistory}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-slate-700 hover:bg-gray-100 rounded-lg transition-colors shrink-0 cursor-pointer"
                title="刷新数据"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">
        {/* 左侧边栏导航：模块选项卡 */}
        <nav className="w-full md:w-60 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-3 md:pb-0 scrollbar-none border-b md:border-b-0 border-gray-100">
          <button
            onClick={() => setActiveTab("predict")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "predict"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>🎯 推荐预测 (Predict)</span>
          </button>
          
          <button
            onClick={() => setActiveTab("backtest")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "backtest"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>📈 滚动回测 (Backtest)</span>
          </button>
          
          <button
            onClick={() => setActiveTab("statistics")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "statistics"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>📊 历史统计 (Stats)</span>
          </button>
          
          <button
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "config"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span>⚙️ 策略因子控制 (Config)</span>
          </button>
          
          <button
            onClick={() => setActiveTab("data")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "data"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/10"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span>📂 历史数据表 (Data)</span>
          </button>
          
          <button
            onClick={() => setActiveTab("python")}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "python"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-950 hover:bg-gray-100"
            }`}
          >
            <FileCode className="w-4 h-4 shrink-0" />
            <span>🐍 Python 项目源码</span>
          </button>
        </nav>

        {/* 右侧：主视窗面板 */}
        <main className="flex-1 min-w-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <RefreshCw className="w-10 h-10 mb-3 animate-spin text-emerald-600" />
              <div className="text-xs font-semibold">正在同步加载历史库 `history.csv` 数据...</div>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl text-center space-y-3">
              <div className="text-rose-800 font-extrabold text-sm">{error}</div>
              <p className="text-xs text-gray-500">
                请确认 `lottery-ai/data/history.csv` 文件是否存在，且格式正常。
              </p>
              <button
                onClick={fetchHistory}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors"
              >
                重试加载
              </button>
            </div>
          ) : (
            <div className="animate-fadeIn">
              {activeTab === "predict" && (
                <PredictionTab 
                  history={history} 
                  activeSettings={activeSettings} 
                  setActiveSettings={setActiveSettings} 
                  realtimeStats={realtimeStats}
                />
              )}
              {activeTab === "backtest" && (
                <BacktestTab 
                  history={history} 
                  activeSettings={activeSettings} 
                  setActiveSettings={setActiveSettings} 
                />
              )}
              {activeTab === "statistics" && <StatisticsTab history={history} />}
              {activeTab === "config" && (
                <ConfigTab 
                  activeSettings={activeSettings} 
                  setActiveSettings={setActiveSettings} 
                />
              )}
              {activeTab === "data" && (
                <DataTab 
                  history={history} 
                  activeSettings={activeSettings}
                  realtimeStats={realtimeStats}
                  onRefresh={fetchHistory} 
                />
              )}
              {activeTab === "python" && <PythonTab history={history} activeSettings={activeSettings} />}
            </div>
          )}
        </main>
      </div>

      {/* 底部页脚 */}
      <footer className="bg-white border-t border-gray-100 py-5 text-center text-[10px] font-semibold text-gray-400">
        <div className="max-w-7xl mx-auto px-4">
          © 2026 Lottery AI Quantitative System. Powered by React 19, TypeScript, and Python 3.14. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
