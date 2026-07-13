/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, Compass, PieChart as PieIcon, Eye } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { HistoryRecord, precomputeStats } from "../utils/lotteryEngine";

interface StatisticsTabProps {
  history: HistoryRecord[];
}

export default function StatisticsTab({ history }: StatisticsTabProps) {
  const [statsData, setStatsData] = useState<any>(null);
  const [activeMetric, setActiveMetric] = useState<"history" | "recent" | "properties">("history");

  useEffect(() => {
    if (history.length === 0) return;

    // 预计算统计
    const s = precomputeStats(history);
    
    // 1. 组装历史频次排序数据
    const historyCounts = Object.entries(s.zCounts).map(([zodiac, count]) => ({
      name: zodiac,
      "出场次数": count,
      "理论平均": Math.round((history.length / 12) * 10) / 10
    })).sort((a, b) => b["出场次数"] - a["出场次数"]);

    // 2. 组装近期热度对比数据 (10, 20, 50期)
    const r10 = history.slice(-10).map(r => r.zodiac);
    const r20 = history.slice(-20).map(r => r.zodiac);
    const r50 = history.slice(-50).map(r => r.zodiac);

    const recentHeat = Object.keys(s.zCounts).map(z => ({
      name: z,
      "近10期": r10.filter(x => x === z).length,
      "近20期": r20.filter(x => x === z).length,
      "近50期": r50.filter(x => x === z).length
    })).sort((a, b) => b["近20期"] - a["近20期"]);

    // 3. 组装衍生属性分布 (波色, 单双, 大小, 尾数)
    const waveCounts = { "红": 0, "蓝": 0, "绿": 0 };
    const oeCounts = { "单": 0, "双": 0 };
    const szCounts = { "大": 0, "小": 0 };
    const tailCounts: Record<number, number> = {};
    for (let i = 0; i < 10; i++) tailCounts[i] = 0;

    history.forEach(r => {
      if (r.waveColor) waveCounts[r.waveColor]++;
      if (r.oddEven) oeCounts[r.oddEven]++;
      if (r.size) szCounts[r.size]++;
      if (r.tail !== undefined) tailCounts[r.tail]++;
    });

    const waveData = Object.entries(waveCounts).map(([name, value]) => ({ name, value }));
    const oeData = Object.entries(oeCounts).map(([name, value]) => ({ name, value }));
    const szData = Object.entries(szCounts).map(([name, value]) => ({ name, value }));
    const tailData = Object.entries(tailCounts).map(([name, value]) => ({ name: `${name}尾`, "出场次数": value }));

    setStatsData({
      historyCounts,
      recentHeat,
      waveData,
      oeData,
      szData,
      tailData,
      total: history.length
    });
  }, [history]);

  if (!statsData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <BarChart3 className="w-12 h-12 mb-3 text-emerald-500 animate-pulse" />
        <div className="text-sm font-medium">正在生成统计分析图表...</div>
      </div>
    );
  }

  // 颜色定义
  const COLORS_WAVE = { "红": "#ef4444", "蓝": "#3b82f6", "绿": "#22c55e" };
  const COLORS_OE = ["#10b981", "#6366f1"];
  const COLORS_SZ = ["#f59e0b", "#ec4899"];

  return (
    <div className="space-y-6">
      {/* 选项卡导航 */}
      <div className="flex bg-gray-50 border border-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveMetric("history")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer ${
            activeMetric === "history"
              ? "bg-white text-slate-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          历史热度频数榜
        </button>
        <button
          onClick={() => setActiveMetric("recent")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer ${
            activeMetric === "recent"
              ? "bg-white text-slate-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          近期爆发热度对比
        </button>
        <button
          onClick={() => setActiveMetric("properties")}
          className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer ${
            activeMetric === "properties"
              ? "bg-white text-slate-800 shadow-xs"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          衍生属性大数分布
        </button>
      </div>

      {/* 历史总频数统计 */}
      {activeMetric === "history" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-emerald-600 w-5 h-5" />
              <h3 className="text-sm font-bold text-gray-800">12生肖历史累计出场次数（总 {statsData.total} 期）</h3>
            </div>
            
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statsData.historyCounts} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="出场次数" fill="#059669" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="理论平均" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={4} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-sm font-bold text-gray-800 pb-3 border-b border-gray-50">历史最热与最冷生肖</div>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-3 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <div className="text-2xl font-extrabold text-emerald-800 bg-emerald-100 w-12 h-12 rounded-lg flex items-center justify-center">
                    {statsData.historyCounts[0].name}
                  </div>
                  <div>
                    <div className="text-xs text-emerald-800 font-bold">历史热门生肖</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      累计开出 <span className="font-bold font-mono">{statsData.historyCounts[0]["出场次数"]}</span> 次 | 占比 {((statsData.historyCounts[0]["出场次数"] / statsData.total) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-rose-50 p-4 rounded-xl border border-rose-100">
                  <div className="text-2xl font-extrabold text-rose-800 bg-rose-100 w-12 h-12 rounded-lg flex items-center justify-center">
                    {statsData.historyCounts[statsData.historyCounts.length - 1].name}
                  </div>
                  <div>
                    <div className="text-xs text-rose-800 font-bold">历史冷门生肖</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      累计开出 <span className="font-bold font-mono">{statsData.historyCounts[statsData.historyCounts.length - 1]["出场次数"]}</span> 次 | 占比 {((statsData.historyCounts[statsData.historyCounts.length - 1]["出场次数"] / statsData.total) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-500 leading-relaxed border border-slate-100 space-y-1 mt-4">
              <span className="font-bold text-slate-700">📌 大数法则揭示：</span>
              根据统计，开奖期数越长，各个生肖出现的总概率越会收敛于 1/12 (即平均每期出场率 8.33%)。大幅偏离该平均线的生肖，具有强烈的均值修正引力。
            </div>
          </div>
        </div>
      )}

      {/* 近期爆发热度 */}
      {activeMetric === "recent" && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-emerald-600 w-5 h-5" />
              <h3 className="text-sm font-bold text-gray-800">近10、20、50期生肖近期爆发热度雷达分布</h3>
            </div>
            <div className="text-xs text-gray-400 font-mono">按近20期出场频度降序</div>
          </div>

          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statsData.recentHeat} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="近10期" fill="#ec4899" radius={[3, 3, 0, 0]} barSize={12} />
                <Bar dataKey="近20期" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={12} />
                <Bar dataKey="近50期" fill="#14b8a6" radius={[3, 3, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 衍生大数分布 */}
      {activeMetric === "properties" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* 波色 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center">
            <div className="text-xs font-bold text-gray-700 mb-4 self-start flex items-center gap-1">
              <Eye className="w-4 h-4 text-red-500" />波色比例分布
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statsData.waveData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                    {statsData.waveData.map((entry: any) => (
                      <Cell key={entry.name} fill={COLORS_WAVE[entry.name as "红" | "蓝" | "绿"]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs font-bold mt-2">
              <span className="text-red-500">红: {statsData.waveData.find((d: any) => d.name === "红")?.value}</span>
              <span className="text-blue-500">蓝: {statsData.waveData.find((d: any) => d.name === "蓝")?.value}</span>
              <span className="text-emerald-500">绿: {statsData.waveData.find((d: any) => d.name === "绿")?.value}</span>
            </div>
          </div>

          {/* 单双 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center">
            <div className="text-xs font-bold text-gray-700 mb-4 self-start flex items-center gap-1">
              <PieIcon className="w-4 h-4 text-emerald-500" />单双比例分布
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statsData.oeData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                    {statsData.oeData.map((entry: any, index: number) => (
                      <Cell key={entry.name} fill={COLORS_OE[index % COLORS_OE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs font-bold mt-2">
              <span className="text-emerald-600">单: {statsData.oeData.find((d: any) => d.name === "单")?.value}</span>
              <span className="text-indigo-600">双: {statsData.oeData.find((d: any) => d.name === "双")?.value}</span>
            </div>
          </div>

          {/* 大小 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col items-center">
            <div className="text-xs font-bold text-gray-700 mb-4 self-start flex items-center gap-1">
              <PieIcon className="w-4 h-4 text-amber-500" />大小比例分布
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statsData.szData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                    {statsData.szData.map((entry: any, index: number) => (
                      <Cell key={entry.name} fill={COLORS_SZ[index % COLORS_SZ.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs font-bold mt-2">
              <span className="text-amber-500">大: {statsData.szData.find((d: any) => d.name === "大")?.value}</span>
              <span className="text-pink-500">小: {statsData.szData.find((d: any) => d.name === "小")?.value}</span>
            </div>
          </div>

          {/* 尾数 */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex flex-col md:col-span-1">
            <div className="text-xs font-bold text-gray-700 mb-4 flex items-center gap-1">
              <BarChart3 className="w-4 h-4 text-purple-500" />尾数分布频次
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statsData.tailData} margin={{ top: 5, right: 0, left: -30, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="出场次数" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
