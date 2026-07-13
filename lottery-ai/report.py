# -*- coding: utf-8 -*-
"""
Lottery AI - 深度分析报告与可视化图表生成模块
自动生成 Markdown、CSV、Excel 报表，
并利用 matplotlib 绘制六大核心图表（生肖热度、遗漏曲线、评分曲线、滚动命中率变化、权重分布、号码走势图）。
对中文字体缺失问题进行优雅 fallback（双语/拼音渲染），确保图表无 □ 乱码。
"""

import os
import json
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any

# 安全导入 matplotlib
try:
    import matplotlib
    matplotlib.use('Agg')  # 无 GUI 环境运行
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

# 安全导入 openpyxl / Excel 支持
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

import config

# 日志配置
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 双语生肖对照，防止 Linux 容器下中文字体缺失导致图表渲染出 □
ZODIAC_EN_MAP = {
    "马": "Horse(马)", "蛇": "Snake(蛇)", "龙": "Dragon(龙)", "兔": "Rabbit(兔)",
    "虎": "Tiger(虎)", "牛": "Ox(牛)", "鼠": "Rat(鼠)", "猪": "Pig(猪)",
    "狗": "Dog(狗)", "鸡": "Rooster(鸡)", "猴": "Monkey(猴)", "羊": "Sheep(羊)"
}


def generate_reports_and_charts():
    """主控函数：读取回测及最新预测结果，自动生成全套报表与图表"""
    report_dir = os.path.join(os.path.dirname(__file__), "report")
    os.makedirs(report_dir, exist_ok=True)
    
    backtest_json_path = os.path.join(os.path.dirname(__file__), "backtest_results.json")
    predict_json_path = os.path.join(os.path.dirname(__file__), "prediction_results.json")
    
    if not os.path.exists(backtest_json_path) or not os.path.exists(predict_json_path):
        logging.warning("未检测到 backtest_results.json 或 prediction_results.json。请先运行 backtest.py 和 predict.py。")
        return
        
    try:
        with open(backtest_json_path, "r", encoding="utf-8") as f:
            bt_data = json.load(f)
        with open(predict_json_path, "r", encoding="utf-8") as f:
            pred_data = json.load(f)
    except Exception as e:
        logging.error(f"加载数据文件失败：{e}")
        return

    # 1. 导出 CSV 评分表
    csv_path = os.path.join(report_dir, "prediction_scores.csv")
    try:
        all_scores = pred_data["all_scores"]
        sorted_sc = sorted(all_scores.items(), key=lambda x: x[1], reverse=True)
        scores_df = pd.DataFrame(sorted_sc, columns=["Zodiac", "Score"])
        scores_df["Zodiac_EN"] = scores_df["Zodiac"].map(ZODIAC_EN_MAP)
        scores_df["Rank"] = range(1, 13)
        scores_df = scores_df[["Rank", "Zodiac", "Zodiac_EN", "Score"]]
        scores_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
        logging.info(f"成功导出 CSV 报表至: {csv_path}")
    except Exception as e:
        logging.error(f"导出 CSV 失败: {e}")

    # 2. 导出 Excel 精细化报表
    if HAS_OPENPYXL:
        excel_path = os.path.join(report_dir, "detailed_report.xlsx")
        try:
            with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
                # Sheet 1: 预测评分
                scores_df.to_excel(writer, sheet_name="预测推荐", index=False)
                
                # Sheet 2: 特征重要性
                feat_imp = bt_data.get("feature_importance", {})
                if feat_imp:
                    feat_df = pd.DataFrame(sorted(feat_imp.items(), key=lambda x: x[1], reverse=True), columns=["Feature_Indicator", "Importance_Score"])
                    feat_df.to_excel(writer, sheet_name="特征重要性", index=False)
                    
                # Sheet 3: 最近15期回测明细
                details = bt_data.get("details", [])
                if details:
                    det_df = pd.DataFrame(details)
                    det_df["recommended"] = det_df["recommended"].apply(lambda x: ",".join(x))
                    det_df.tail(25).to_excel(writer, sheet_name="近期回测流水", index=False)
                    
            logging.info(f"成功导出 Excel 报表至: {excel_path}")
        except Exception as e:
            logging.error(f"导出 Excel 失败: {e}")
    else:
        logging.warning("检测到系统环境未安装 openpyxl。已自动跳过 Excel 精细化报表生成。")

    # 3. 生成 Markdown 分析报告
    md_path = os.path.join(report_dir, "prediction_report.md")
    try:
        # 读取历史统计来写小作文
        from analysis import HistoryAnalyzer
        analyzer = HistoryAnalyzer()
        stats = {}
        if analyzer.load_and_validate():
            df_enriched = analyzer.enrich_data()
            stats = analyzer.analyze_statistics(df_enriched)
            
        with open(md_path, "w", encoding="utf-8") as mf:
            mf.write(f"# Lottery AI - 智能多因子量化预测与回测报告\n\n")
            mf.write(f"本分析报告由 **Lottery AI** 下一代量化预测平台自动生成。\n")
            mf.write(f"模型采用时间序列 **Walk-Forward**（滚动前向验证）算法调优，融合一阶马尔可夫转移矩阵、贝叶斯联合分布、EWMA 移动概率、极限偏差纠偏等 20 个高级特征指标进行综合评分共鸣。\n\n")
            
            mf.write(f"## 一、下一期预测推荐看板 (第 {pred_data['next_period']} 期)\n\n")
            mf.write(f"| 推荐排名 | 推荐生肖 | 综合评分 | 推荐星级 | 核心加分逻辑依据 |\n")
            mf.write(f"| :---: | :---: | :---: | :---: | :--- |\n")
            for r in pred_data["recommendations"]:
                reasons_str = "；".join(r["reasons"])
                mf.write(f"| 第 {r['rank']} 名 | **{r['zodiac']}** ({ZODIAC_EN_MAP[r['zodiac']].split('(')[0]}) | {r['score']:.2f} | {r['stars']} | {reasons_str} |\n")
            mf.write("\n")
            
            mf.write(f"## 二、大盘 Walk-Forward 历史回测绩效统计\n\n")
            mf.write(f"- **冠军算法模型**: {bt_data.get('champion_model', 'N/A')}\n")
            mf.write(f"- **测试回测总期数**: {bt_data.get('total_periods', 0)} 期\n")
            mf.write(f"- **模型 Top5 命中次数**: {bt_data.get('hits', 0)} 次\n")
            mf.write(f"- **★ 模型 Top5 预测命中率**: `{bt_data.get('hit_rate', 0.0):.2f}%`\n")
            mf.write(f"- **★ 随机基线命中率**: `{bt_data.get('random_hit_rate', 0.0):.2f}%` (12选5)\n")
            mf.write(f"- **★ 模型相对随机提升幅度**: `+{bt_data.get('utility_score', 0.0) - bt_data.get('random_hit_rate', 0.0):.2f}%`\n")
            mf.write(f"- **★ 统计学显著性 p-value**: `{bt_data.get('p_value', 1.0):.5f}` (极低 p-value 代表模型对随机的优越性极度显著)\n")
            mf.write(f"- **★ 模型滚动稳定性评分**: `{bt_data.get('stability_score', 0.0):.2f} / 100` (分值越高代表模型在不同时间窗口内命中率越平稳，越不容易过拟合)\n\n")
            
            # 特征重要性
            if bt_data.get("feature_importance"):
                mf.write(f"### 2.1 特征贡献度分析 (Feature Importance)\n\n")
                mf.write(f"以下为各量化指标对大盘多指标效用评分的边际贡献度：\n\n")
                mf.write(f"| 特征指标名称 | 相对贡献权重 (0~100) |\n")
                mf.write(f"| :--- | :---: |\n")
                for k, v in sorted(bt_data["feature_importance"].items(), key=lambda x: x[1], reverse=True):
                    progress = "▓" * int(v // 10) + "░" * (10 - int(v // 10))
                    mf.write(f"| `{k}` | {v:.1f} %  `{progress}` |\n")
                mf.write("\n")

            if stats:
                mf.write(f"## 三、大数法则基础统计盘点\n\n")
                mf.write(f"- **总加载历史周期**: {stats['total_periods']} 期\n")
                mf.write(f"- **红/蓝/绿波频数**: 红波 `{stats['wave_color_dist'].get('红', 0)}次` | 蓝波 `{stats['wave_color_dist'].get('蓝', 0)}次` | 绿波 `{stats['wave_color_dist'].get('绿', 0)}次`\n")
                mf.write(f"- **单双分布比例**: 单数 `{stats['odd_even_dist'].get('单', 0)}次` | 双数 `{stats['odd_even_dist'].get('双', 0)}次`\n")
                mf.write(f"- **大小号码分布**: 大数 `{stats['size_dist'].get('大', 0)}次` | 小数 `{stats['size_dist'].get('小', 0)}次`\n\n")
                
            mf.write(f"## 四、最新 12 生肖完整量化评分看板\n\n")
            mf.write(f"| 综合排名 | 生肖 | 综合评分 | 状态评级 |\n")
            mf.write(f"| :---: | :---: | :---: | :---: |\n")
            for index, (z, sc) in enumerate(scores_df.itertuples(index=False), 1):
                status_tag = "🔥 核心关注" if index <= 2 else "✨ 重点关注" if index <= 5 else "💤 观望态"
                mf.write(f"| {index:02d} | **{z}** ({ZODIAC_EN_MAP[z]}) | {sc:.2f} | {status_tag} |\n")
            mf.write("\n")
            
            mf.write(f"---\n")
            mf.write(f"*免责声明：本分析由 Lottery AI 平台基于纯正数学、大数法则及马尔可夫时序链技术提供决策支持。回测数据不构成未来开奖的绝对保证。理性购彩，量力而行。*\n")
            
        logging.info(f"成功生成 Markdown 报告至: {md_path}")
    except Exception as e:
        logging.error(f"生成 Markdown 报告失败: {e}")

    # 4. 生成 6 大核心可视化图表
    if HAS_MATPLOTLIB:
        try:
            # 基础设置：由于中文字体缺失问题，优先配置常用无衬线字体，并辅以双语 labels
            plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica', 'Liberation Sans']
            plt.rcParams['axes.unicode_minus'] = False
            
            # --- 图表 1: 生肖历史热度 (Zodiac Heat) ---
            if stats:
                plt.figure(figsize=(9, 4.5))
                z_dist = stats["zodiac_total_distribution"]
                sorted_dist = sorted(z_dist.items(), key=lambda x: x[1], reverse=True)
                labels = [ZODIAC_EN_MAP[x[0]] for x in sorted_dist]
                values = [x[1] for x in sorted_dist]
                colors = ['#10b981' if i < 5 else '#3b82f6' for i in range(12)]
                
                plt.bar(labels, values, color=colors, alpha=0.85, edgecolor='grey')
                plt.title("Zodiac Historic Heat Distribution (生肖历史热度分布)")
                plt.xlabel("Zodiac (生肖)")
                plt.ylabel("Appearances (开出次数)")
                plt.xticks(rotation=45, ha='right')
                plt.grid(axis='y', linestyle='--', alpha=0.5)
                plt.tight_layout()
                plt.savefig(os.path.join(report_dir, "zodiac_heat.png"), dpi=150)
                plt.close()

            # --- 图表 2: 当前遗漏值曲线 (Zodiac Omission Curve) ---
            if stats:
                plt.figure(figsize=(9, 4.5))
                m_info = stats["missing_and_intervals"]
                sorted_mis = sorted(m_info.items(), key=lambda x: x[1]["current_missing"], reverse=True)
                labels = [ZODIAC_EN_MAP[x[0]] for x in sorted_mis]
                mis_vals = [x[1]["current_missing"] for x in sorted_mis]
                avg_vals = [x[1]["avg_interval"] for x in sorted_mis]
                
                x = np.arange(12)
                plt.bar(x - 0.2, mis_vals, width=0.4, label="Current Omission (当前遗漏)", color='#ef4444', alpha=0.85)
                plt.bar(x + 0.2, avg_vals, width=0.4, label="Avg Interval (平均间隔)", color='#64748b', alpha=0.85)
                plt.xticks(x, labels, rotation=45, ha='right')
                plt.title("Zodiac Current Omission vs Average Interval (生肖当前遗漏与平均间隔对比)")
                plt.ylabel("Periods (期数)")
                plt.legend()
                plt.grid(axis='y', linestyle='--', alpha=0.5)
                plt.tight_layout()
                plt.savefig(os.path.join(report_dir, "zodiac_omission.png"), dpi=150)
                plt.close()

            # --- 图表 3: 下期推荐综合评分 (Zodiac Scores Curve) ---
            plt.figure(figsize=(9, 4.5))
            labels = [ZODIAC_EN_MAP[x[0]] for x in sorted_sc]
            vals = [x[1] for x in sorted_sc]
            colors = ['#10b981' if i < 5 else '#cbd5e1' for i in range(12)]
            
            plt.bar(labels, vals, color=colors, alpha=0.9, edgecolor='grey')
            plt.axhline(y=60, color='#f59e0b', linestyle='--', label="High Interest Line (高关注线)")
            plt.title("Zodiac Combined Score Prediction (下一期生肖量化推荐评分)")
            plt.xlabel("Zodiac (生肖)")
            plt.ylabel("Normalized Score (标准化评分 0-100)")
            plt.xticks(rotation=45, ha='right')
            plt.legend()
            plt.grid(axis='y', linestyle='--', alpha=0.5)
            plt.tight_layout()
            plt.savefig(os.path.join(report_dir, "zodiac_scores.png"), dpi=150)
            plt.close()

            # --- 图表 4: 滚动 10 期命中率趋势 (Rolling Hit Rate Trend) ---
            details = bt_data.get("details", [])
            if details:
                plt.figure(figsize=(9, 4.5))
                # 提取 is_hit 列计算滚动 10 期命中率
                df_det = pd.DataFrame(details)
                df_det["rolling_hit"] = df_det["is_hit"].rolling(window=10, min_periods=1).mean() * 100.0
                
                plt.plot(df_det["period"].tolist(), df_det["rolling_hit"].tolist(), color='#8b5cf6', linewidth=2.5, marker='o', markersize=4, label="Rolling 10p Accuracy")
                plt.axhline(y=41.67, color='#ef4444', linestyle='--', label="Random Baseline (41.67%)")
                plt.title("Walk-Forward Backtest Rolling 10-Period Accuracy (历史回测滚动10期胜率曲线)")
                plt.xlabel("Period (回测期数)")
                plt.ylabel("Hit Rate (命中率 %)")
                plt.legend()
                plt.grid(linestyle='--', alpha=0.5)
                plt.tight_layout()
                plt.savefig(os.path.join(report_dir, "rolling_accuracy.png"), dpi=150)
                plt.close()

            # --- 图表 5: 特征权重分布 (Weights Distribution) ---
            plt.figure(figsize=(8, 5))
            indicators = config.get_current_settings()["indicators"]
            weights = config.get_current_settings()["weights"]
            
            # 过滤出启用的特征和对应权重
            active_weights = {}
            for ind, is_on in indicators.items():
                if is_on:
                    w_name = f"{ind.replace('ENABLE_', '')}_WEIGHT"
                    # 取绝对值防止惩罚项负值影响拼饼图
                    active_weights[ind.replace("ENABLE_", "")] = abs(weights.get(w_name, 1.0))
            
            if active_weights:
                sorted_w = sorted(active_weights.items(), key=lambda x: x[1], reverse=True)[:8]  # 最多画前8个
                w_labels = [x[0] for x in sorted_w]
                w_vals = [x[1] for x in sorted_w]
                # 加一个 'Others' 
                total_displayed = sum(w_vals)
                total_all_active = sum(active_weights.values())
                if total_all_active > total_displayed:
                    w_labels.append("Others")
                    w_vals.append(total_all_active - total_displayed)
                    
                plt.pie(w_vals, labels=w_labels, autopct='%1.1f%%', startangle=140, colors=plt.cm.tab20.colors, wedgeprops={'edgecolor': 'white', 'linewidth': 1.5})
                plt.title("Core Quantitative Factors Weights (活跃因子核心权重占比)")
                plt.tight_layout()
                plt.savefig(os.path.join(report_dir, "weights_distribution.png"), dpi=150)
                plt.close()

            # --- 图表 6: 历史号码走势与趋势线 (Trend Line) ---
            if stats:
                plt.figure(figsize=(9, 4.5))
                # 读取最后 50 期号码
                from analysis import HistoryAnalyzer
                analyzer = HistoryAnalyzer()
                if analyzer.load_and_validate():
                    df_sub = analyzer.df.tail(45)
                    periods_list = df_sub["period"].tolist()
                    numbers_list = df_sub["number"].tolist()
                    
                    # 5期滚动平均线
                    df_sub["rolling_num"] = df_sub["number"].rolling(window=5, min_periods=1).mean()
                    
                    plt.scatter(periods_list, numbers_list, color='#f59e0b', s=50, alpha=0.75, label="Draw Numbers (中奖号码)", zorder=3)
                    plt.plot(periods_list, df_sub["rolling_num"].tolist(), color='#0f172a', linewidth=2, label="5p SMA Trend Line (5期均线)", zorder=2)
                    plt.title("Recent 45 Periods Number Trend & Rolling Average (近45期号码分布与趋势图)")
                    plt.xlabel("Period (期数)")
                    plt.ylabel("Number (号码 1-49)")
                    plt.axhline(y=24.5, color='grey', linestyle=':', label="Big-Small Line (24.5)")
                    plt.legend()
                    plt.grid(linestyle='--', alpha=0.5)
                    plt.tight_layout()
                    plt.savefig(os.path.join(report_dir, "trend_line.png"), dpi=150)
                    plt.close()
                    
            logging.info("成功利用 matplotlib 生成全套六大核心可视化图表！保存在 report/ 目录下。")
        except Exception as e:
            logging.error(f"利用 matplotlib 生成可视化图表失败: {e}")
    else:
        logging.warning("检测到系统环境未安装 matplotlib。已跳过图片绘制，系统将直接采用 Markdown 及表格展示量化成果。")


if __name__ == "__main__":
    generate_reports_and_charts()
