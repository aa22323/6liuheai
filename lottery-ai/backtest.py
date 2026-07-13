# -*- coding: utf-8 -*-
"""
Lottery AI - 历史回测与量化策略调优
实现基于 Walk-Forward（滚动前向验证）的回测引擎，采用 Z-Score + MinMax 统一标准化计算 20 个复杂的量化因子。
支持多指标综合评价（Top1/Top3/Top5、稳定性、p值）、超参数搜索、贪心权重优化、特征重要性筛选、模型竞技赛、以及 10000 次蒙特卡洛置信区间检验。
"""

import os
import json
import random
import logging
import time
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
from scipy.stats import binom

# 引入配置与数据分析组件
import config
from analysis import HistoryAnalyzer, is_prime_number

# 日志配置
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


class LotteryScorer:
    """
    量化评分器。根据历史数据（截止到特定期数 T），计算12生肖在下一期（T+1）的 20 个标准化特征，并进行加权综合评分。
    确保无任何未来函数。
    """
    def __init__(self, df_history_up_to_t: pd.DataFrame, settings: Optional[dict] = None):
        self.df = df_history_up_to_t
        self.total_periods = len(self.df)
        self.all_zodiacs = list(config.ZODIAC_MAPPING.keys())
        
        # 获取配置与开关
        if settings is None:
            config.load_config()
            self.settings = config.get_current_settings()
        else:
            self.settings = settings
            
        self.indicators = self.settings.get("indicators", {})
        self.weights = self.settings.get("weights", {})
        self.hyperparams = self.settings.get("hyperparameters", {
            "EWMA_ALPHA": config.EWMA_ALPHA,
            "SIMULATION_RUNS": config.SIMULATION_RUNS,
            "BAYES_WINDOW_SIZE": config.BAYES_WINDOW_SIZE
        })

        # 预计算缓存
        self.stats = self._precompute_stats()

    def _precompute_stats(self) -> dict:
        """预计算各维度的历史和即期数据，降低循环计算开销"""
        if self.df.empty:
            return {}
            
        z_counts = self.df['zodiac'].value_counts()
        
        # 遗漏与出场间隔
        missing_stats = {}
        for z in self.all_zodiacs:
            idx_list = self.df[self.df['zodiac'] == z].index.tolist()
            if not idx_list:
                current_missing = self.total_periods
                intervals = [self.total_periods]
            else:
                current_missing = (self.total_periods - 1) - idx_list[-1]
                intervals = [idx_list[0] + 1]
                for i in range(1, len(idx_list)):
                    intervals.append(idx_list[i] - idx_list[i-1])
                    
            missing_stats[z] = {
                "current_missing": current_missing,
                "avg_interval": float(np.mean(intervals)) if intervals else 12.0,
                "max_missing": int(np.max(intervals)) if intervals else 24,
                "min_missing": int(np.min(intervals)) if intervals else 1,
                "intervals": intervals
            }
            
        # 衍生属性生成
        df_rich = self.df.copy()
        df_rich['wave_color'] = df_rich['number'].map(config.NUM_TO_WAVE)
        df_rich['odd_even'] = df_rich['number'].apply(lambda x: "单" if x % 2 != 0 else "双")
        df_rich['size'] = df_rich['number'].apply(lambda x: "大" if x >= 25 else "小")
        df_rich['tail'] = df_rich['number'].apply(lambda x: x % 10)
        df_rich['is_prime'] = df_rich['number'].apply(is_prime_number)
        df_rich['road_012'] = df_rich['number'].apply(lambda x: x % 3)
        
        return {
            "z_counts": z_counts,
            "missing_stats": missing_stats,
            "df_rich": df_rich
        }

    def compute_scores(self) -> Dict[str, float]:
        """
        计算 12 生肖的量化分数。
        对 20 个特征分别计算所有生肖的原始值，进行 Z-Score 标准化和 MinMax 标准化，而后加权累加。
        """
        if self.total_periods < 15:
            # 数据量不足以计算复杂量化因子，退化为均等机会
            return {z: 50.0 for z in self.all_zodiacs}
            
        z_counts = self.stats["z_counts"]
        missing_stats = self.stats["missing_stats"]
        df_rich = self.stats["df_rich"]
        
        raw_features = {feat: {z: 0.0 for z in self.all_zodiacs} for feat in self.indicators.keys()}
        
        # 1. 历史总热度
        for z in self.all_zodiacs:
            raw_features["ENABLE_HISTORICAL_HEAT"][z] = z_counts.get(z, 0) / self.total_periods
            
        # 2~6. 不同窗口的热度
        windows = [10, 20, 30, 50, 100]
        for w in windows:
            feat_name = f"ENABLE_RECENT_HEAT_{w}" if w in [10, 20, 30, 50] else "ENABLE_LONG_HEAT_100"
            span = min(w, self.total_periods)
            recent_counts = df_rich.tail(span)['zodiac'].value_counts()
            for z in self.all_zodiacs:
                raw_features[feat_name][z] = recent_counts.get(z, 0) / span
                
        # 7. 遗漏比率 (当前遗漏 / 平均间隔)
        for z in self.all_zodiacs:
            m_data = missing_stats[z]
            raw_features["ENABLE_MISSING_VALUE"][z] = m_data["current_missing"] / m_data["avg_interval"]
            
        # 8. 平均间隔倒数 (天然热度)
        for z in self.all_zodiacs:
            raw_features["ENABLE_AVERAGE_INTERVAL"][z] = 12.0 / missing_stats[z]["avg_interval"]
            
        # 9. 冷热转换动量 (近期15期热度 - 历史热度)
        span_15 = min(15, self.total_periods)
        recent_15_counts = df_rich.tail(span_15)['zodiac'].value_counts()
        for z in self.all_zodiacs:
            r_freq = recent_15_counts.get(z, 0) / span_15
            h_freq = z_counts.get(z, 0) / self.total_periods
            raw_features["ENABLE_HEAT_MOMENTUM"][z] = r_freq - h_freq
            
        # 10. Markov一阶转移概率
        last_z = df_rich.iloc[-1]['zodiac']
        transitions = {z1: {z2: 0 for z2 in self.all_zodiacs} for z1 in self.all_zodiacs}
        z_series = df_rich['zodiac'].tolist()
        for i in range(len(z_series) - 1):
            transitions[z_series[i]][z_series[i+1]] += 1
        last_trans_dict = transitions.get(last_z, {})
        total_trans = sum(last_trans_dict.values())
        for z in self.all_zodiacs:
            raw_features["ENABLE_MARKOV"][z] = last_trans_dict.get(z, 0) / total_trans if total_trans > 0 else 1/12
            
        # 11. 波色偏差纠偏 (近15期波色偏离均值的负偏差，期望回归)
        recent_wave = df_rich.tail(15)['wave_color'].value_counts(normalize=True)
        wave_expected = {"红": 17/49, "蓝": 16/49, "绿": 16/49}
        wave_bias = {c: max(0.0, wave_expected[c] - recent_wave.get(c, 0.0)) for c in ["红", "蓝", "绿"]}
        for z in self.all_zodiacs:
            nums = config.ZODIAC_MAPPING[z]
            z_colors = [config.NUM_TO_WAVE.get(n) for n in nums]
            raw_features["ENABLE_WAVE_REVERSION"][z] = sum(wave_bias.get(c, 0.0) for c in z_colors) / len(nums)
            
        # 12. 单双偏差纠偏 (近12期)
        recent_oe = df_rich.tail(12)['odd_even'].value_counts(normalize=True)
        oe_expected = {"单": 25/49, "双": 24/49}
        oe_bias = {oe: max(0.0, oe_expected[oe] - recent_oe.get(oe, 0.0)) for oe in ["单", "双"]}
        for z in self.all_zodiacs:
            nums = config.ZODIAC_MAPPING[z]
            odds = sum(1 for n in nums if n % 2 != 0) / len(nums)
            evens = 1.0 - odds
            raw_features["ENABLE_ODD_EVEN_REVERSION"][z] = odds * oe_bias.get("单", 0.0) + evens * oe_bias.get("双", 0.0)
            
        # 13. 大小偏差纠偏 (近12期)
        recent_size = df_rich.tail(12)['size'].value_counts(normalize=True)
        sz_expected = {"大": 25/49, "小": 24/49}
        sz_bias = {sz: max(0.0, sz_expected[sz] - recent_size.get(sz, 0.0)) for sz in ["大", "小"]}
        for z in self.all_zodiacs:
            nums = config.ZODIAC_MAPPING[z]
            bigs = sum(1 for n in nums if n >= 25) / len(nums)
            smalls = 1.0 - bigs
            raw_features["ENABLE_SIZE_REVERSION"][z] = bigs * sz_bias.get("大", 0.0) + smalls * sz_bias.get("小", 0.0)
            
        # 14. 尾数偏差纠偏 (近20期)
        recent_tails = df_rich.tail(20)['tail'].value_counts(normalize=True)
        tail_bias = {}
        for t in range(10):
            exp = 4/49 if t == 0 else 5/49
            tail_bias[t] = max(0.0, exp - recent_tails.get(t, 0.0))
        for z in self.all_zodiacs:
            nums = config.ZODIAC_MAPPING[z]
            raw_features["ENABLE_TAIL_REVERSION"][z] = sum(tail_bias[n % 10] for n in nums) / len(nums)
            
        # 15. 连续出现惩罚 (本期开出 = 1.0，连续两期开出 = 2.0，其余 0)
        last_z_1 = df_rich.iloc[-1]['zodiac']
        last_z_2 = df_rich.iloc[-2]['zodiac'] if self.total_periods >= 2 else None
        for z in self.all_zodiacs:
            penalty = 0.0
            if z == last_z_1:
                penalty = 1.0
                if last_z_2 and last_z_1 == last_z_2:
                    penalty = 2.0
            raw_features["ENABLE_CONSECUTIVE_PENALTY"][z] = penalty  # 惩罚项后续结合负权重

        # 16. 极限遗漏回补 (达到最大遗漏的80%以上开始加成)
        for z in self.all_zodiacs:
            m_data = missing_stats[z]
            if m_data["current_missing"] >= m_data["max_missing"] * 0.8:
                raw_features["ENABLE_MAX_MISSING_RECOVERY"][z] = (m_data["current_missing"] / m_data["max_missing"]) ** 2
            else:
                raw_features["ENABLE_MAX_MISSING_RECOVERY"][z] = 0.0
                
        # 17. 周期分析 (寻找最大自相关滞后项 matching)
        for z in self.all_zodiacs:
            series = (df_rich['zodiac'] == z).astype(int).tolist()
            mean_val = np.mean(series)
            var_val = np.var(series)
            best_lag = 0
            max_corr = -1.0
            if var_val > 0:
                for lag in range(1, 16):
                    s_t = series[:-lag]
                    s_lag = series[lag:]
                    corr = np.mean([(x - mean_val) * (y - mean_val) for x, y in zip(s_t, s_lag)]) / var_val
                    if corr > max_corr:
                        max_corr = corr
                        best_lag = lag
            curr_missing = missing_stats[z]["current_missing"]
            if best_lag > 0 and curr_missing == best_lag and max_corr > 0.05:
                raw_features["ENABLE_CYCLE_ANALYSIS"][z] = max_corr
            else:
                raw_features["ENABLE_CYCLE_ANALYSIS"][z] = 0.0
                
        # 18. 相似历史窗口 (2期模式或1期模式)
        pattern_len = 2
        target_pattern = z_series[-pattern_len:]
        successor_counts = {z: 0 for z in self.all_zodiacs}
        matches = 0
        for i in range(len(z_series) - pattern_len - 1):
            if z_series[i: i + pattern_len] == target_pattern:
                successor_counts[z_series[i + pattern_len]] += 1
                matches += 1
        if matches == 0:  # 退化为 1 期
            pattern_len = 1
            target_pattern = z_series[-pattern_len:]
            for i in range(len(z_series) - pattern_len - 1):
                if z_series[i: i + pattern_len] == target_pattern:
                    successor_counts[z_series[i + pattern_len]] += 1
                    matches += 1
        for z in self.all_zodiacs:
            raw_features["ENABLE_SIMILAR_WINDOW"][z] = successor_counts[z] / matches if matches > 0 else 1/12
            
        # 19. 贝叶斯联合概率 (利用近 Bayes 窗口最缺失的特征组合来反推生肖概率)
        bayes_win = min(int(self.hyperparams.get("BAYES_WINDOW_SIZE", 25)), self.total_periods)
        recent_sub = df_rich.tail(bayes_win)
        
        # 提取极度缺失特征状态
        overdue_wave = wave_bias  # 已在上面算得近15期缺失，这里复用
        overdue_size = sz_bias
        overdue_oe = oe_bias
        
        target_wave = max(overdue_wave.keys(), key=lambda k: overdue_wave[k])
        target_size = max(overdue_size.keys(), key=lambda k: overdue_size[k])
        target_oe = max(overdue_oe.keys(), key=lambda k: overdue_oe[k])
        
        # P(Z) = 历史总概率
        # P(Feature | Zodiac)
        for z in self.all_zodiacs:
            nums = config.ZODIAC_MAPPING[z]
            # 满足波色的比例
            p_wave_z = sum(1 for n in nums if config.NUM_TO_WAVE.get(n) == target_wave) / len(nums)
            p_size_z = sum(1 for n in nums if ("大" if n >= 25 else "小") == target_size) / len(nums)
            p_oe_z = sum(1 for n in nums if ("单" if n % 2 != 0 else "双") == target_oe) / len(nums)
            
            p_z = z_counts.get(z, 0) / self.total_periods
            
            # 联合贝叶斯期望共鸣得分
            raw_features["ENABLE_BAYESIAN_PROB"][z] = (p_wave_z + p_size_z + p_oe_z) * p_z
            
        # 20. EWMA (指数加权移动平均胜率)
        alpha = self.hyperparams.get("EWMA_ALPHA", 0.15)
        for z in self.all_zodiacs:
            # 递推：S_t = alpha * y_t + (1 - alpha) * S_t-1
            ewma_val = 1.0 / 12  # 初始状态
            for i in range(len(z_series)):
                y = 1.0 if z_series[i] == z else 0.0
                ewma_val = alpha * y + (1.0 - alpha) * ewma_val
            raw_features["ENABLE_EWMA"][z] = ewma_val

        # ----------------------------------------------------
        # 标准化矩阵与加权累加 (Z-Score + MinMax 统一量纲)
        # ----------------------------------------------------
        weighted_sums = {z: 0.0 for z in self.all_zodiacs}
        
        for feat, is_enabled in self.indicators.items():
            if not is_enabled:
                continue
                
            w = self.weights.get(f"{feat.replace('ENABLE_', '')}_WEIGHT", 1.0)
            feat_vals = raw_features[feat]
            
            # 转为一维 list 准备计算
            vals = [feat_vals[z] for z in self.all_zodiacs]
            mean_f = np.mean(vals)
            std_f = np.std(vals)
            
            # 1. Z-Score
            z_scores = {}
            for z in self.all_zodiacs:
                z_scores[z] = (feat_vals[z] - mean_f) / std_f if std_f > 0 else 0.0
                
            # 2. MinMax [0, 1]
            zs = list(z_scores.values())
            min_z, max_z = min(zs), max(zs)
            
            scaled_feat = {}
            for z in self.all_zodiacs:
                if max_z > min_z:
                    scaled_feat[z] = (z_scores[z] - min_z) / (max_z - min_z)
                else:
                    scaled_feat[z] = 0.5
                    
            # 3. 加权计入总得分
            for z in self.all_zodiacs:
                weighted_sums[z] += scaled_feat[z] * w

        # 最终评分归一化到 10 ~ 95 的美观区间
        all_raw_scores = list(weighted_sums.values())
        min_raw, max_raw = min(all_raw_scores), max(all_raw_scores)
        
        final_scores = {}
        for z in self.all_zodiacs:
            if max_raw > min_raw:
                final_scores[z] = round(10.0 + (weighted_sums[z] - min_raw) / (max_raw - min_raw) * 85.0, 2)
            else:
                final_scores[z] = 50.0
                
        return final_scores


class WalkForwardBacktester:
    """
    滚动前向验证回测引擎。
    按时间序列步进，绝无未来函数，输出全景多指标绩效评价。
    """
    def __init__(self, df_enriched: pd.DataFrame, start_period: int = 120, end_period: int = 191):
        self.df = df_enriched
        self.start_period = start_period
        self.end_period = end_period

    def run_backtest(self, settings: Optional[dict] = None, verbose: bool = False) -> Tuple[float, int, List[Dict[str, Any]], Dict[str, Any]]:
        """
        执行 Walk-Forward 回测
        返回：(主指标Top5命中率, 命中次数, 详细期数历史列表, 多维度统计评价报告)
        """
        periods = self.df['period'].tolist()
        min_p, max_p = min(periods), max(periods)
        
        # 确保热身数据充足，回测起点合法
        test_start = max(self.start_period, min_p + 25)
        test_end = min(self.end_period, max_p)
        
        hits_5 = 0
        hits_3 = 0
        hits_1 = 0
        total_tests = 0
        details = []
        
        for p in range(test_start, test_end + 1):
            # 获取当前测试期数 p 以前的切片 (绝不包含未来期 p 自身)
            df_slice = self.df[self.df['period'] < p].copy()
            if df_slice.empty:
                continue
                
            scorer = LotteryScorer(df_slice, settings=settings)
            scores = scorer.compute_scores()
            
            # 排序推荐生肖
            sorted_recs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
            top_5 = [z for z, _ in sorted_recs[:5]]
            top_3 = [z for z, _ in sorted_recs[:3]]
            top_1 = [sorted_recs[0][0]]
            
            # 调取真实结果
            actual_row = self.df[self.df['period'] == p]
            if actual_row.empty:
                continue
                
            actual_zodiac = actual_row.iloc[0]['zodiac']
            actual_number = actual_row.iloc[0]['number']
            
            is_hit_5 = actual_zodiac in top_5
            is_hit_3 = actual_zodiac in top_3
            is_hit_1 = actual_zodiac in top_1
            
            if is_hit_5:
                hits_5 += 1
            if is_hit_3:
                hits_3 += 1
            if is_hit_1:
                hits_1 += 1
                
            total_tests += 1
            
            details.append({
                "period": p,
                "number": int(actual_number),
                "actual": actual_zodiac,
                "recommended": top_5,
                "is_hit": is_hit_5,
                "is_hit_3": is_hit_3,
                "is_hit_1": is_hit_1,
                "scores": scores
            })
            
            if verbose:
                flag = "✔" if is_hit_5 else "×"
                print(f"[Walk-Forward] 期数: {p:03d} | 实际: {actual_zodiac} ({actual_number:02d}) | 推荐: {', '.join(top_5)} | 评分: {scores[actual_zodiac]:.1f} | 结果: {flag}")

        if total_tests == 0:
            return 0.0, 0, [], {}
            
        hr_5 = (hits_5 / total_tests) * 100
        hr_3 = (hits_3 / total_tests) * 100
        hr_1 = (hits_1 / total_tests) * 100
        
        # 1. 计算不同子时间段的稳定性 (防止局部过度拟合)
        # 将回测历史均分为 3 等分
        chunk_size = max(1, total_tests // 3)
        sub_hrs = []
        for idx in range(0, total_tests, chunk_size):
            sub_chunk = details[idx: idx + chunk_size]
            sub_hits = sum(1 for d in sub_chunk if d["is_hit"])
            sub_hrs.append((sub_hits / len(sub_chunk)) * 100 if len(sub_chunk) > 0 else 0.0)
            
        std_dev = float(np.std(sub_hrs)) if len(sub_hrs) > 1 else 0.0
        stability_score = max(0.0, 100.0 - std_dev * 1.5)
        
        # 2. 计算统计显著性 p-value (二项检验：检验 Top5 是否显著超过 5/12 随机期望)
        # scipy.stats.binom.sf(k-1, n, p) 算的是得 k 次或以上成功的概率
        p_val = float(binom.sf(hits_5 - 1, total_tests, 5/12)) if hits_5 > 0 else 1.0
        
        # 3. 相对随机概率提升率
        random_hr = (5 / 12) * 100
        improvement = ((hr_5 - random_hr) / random_hr) * 100 if random_hr > 0 else 0.0
        
        # 4. 综合效用分数 Utility
        w_top5 = config.OPT_TOP5_HIT_WEIGHT
        w_top3 = config.OPT_TOP3_HIT_WEIGHT
        w_top1 = config.OPT_TOP1_HIT_WEIGHT
        w_stab = config.OPT_STABILITY_WEIGHT
        w_pval = config.OPT_PVALUE_WEIGHT
        
        utility = (
            w_top5 * hr_5 +
            w_top3 * hr_3 +
            w_top1 * hr_1 +
            w_stab * stability_score +
            w_pval * (1.0 - p_val) * 100
        )
        
        report = {
            "top5_hit_rate": round(hr_5, 2),
            "top3_hit_rate": round(hr_3, 2),
            "top1_hit_rate": round(hr_1, 2),
            "hits_count": hits_5,
            "total_count": total_tests,
            "stability_score": round(stability_score, 2),
            "p_value": round(p_val, 5),
            "improvement": round(improvement, 2),
            "utility_score": round(utility, 2),
            "sub_windows_rates": [round(x, 2) for x in sub_hrs]
        }
        
        return hr_5, hits_5, details, report


# ==========================================================
# 自动寻找最佳权重 (随机山丘攀爬/梯度寻优)
# ==========================================================
def optimize_weights_and_params(df_enriched: pd.DataFrame, max_iters: int = 150) -> Tuple[dict, float]:
    """
    通过高效的爬山算法，自动在全部参数和权重空间寻找最佳组合。
    优化目标是多指标 Utility Score (不单看命中率，兼顾 Top1, Top3 命中、稳定性和 p-value 显著性，防止过拟合)。
    """
    print("\n" + "="*60)
    print("      LOTTERY AI - 开始多目标量化寻优 (Randomized Hill Climbing)")
    print("="*60)
    
    backtester = WalkForwardBacktester(df_enriched)
    
    # 初始设置：加载默认配置
    current_settings = config.get_current_settings()
    _, _, _, initial_report = backtester.run_backtest(current_settings)
    best_utility = initial_report["utility_score"]
    best_settings = json.loads(json.dumps(current_settings))
    
    print(f"初始效用总评分 (Utility): {best_utility:.2f} | Top5命中率: {initial_report['top5_hit_rate']:.2f}% | 稳定性: {initial_report['stability_score']:.2f}")
    
    weight_keys = list(best_settings["weights"].keys())
    hyper_keys = list(best_settings["hyperparameters"].keys())
    
    # 局部梯度爬坡 & 随机游走
    improved = 0
    for i in range(max_iters):
        trial_settings = json.loads(json.dumps(best_settings))
        
        # 随机决定是改变权重还是超参数
        if random.random() < 0.75:
            # 随机挑选 1~3 个权重进行微调
            keys_to_mutate = random.sample(weight_keys, k=random.randint(1, 3))
            for key in keys_to_mutate:
                original_w = trial_settings["weights"][key]
                if "PENALTY" in key:
                    # 惩罚项一般是负数
                    trial_settings["weights"][key] = np.clip(original_w + random.uniform(-1.0, 1.0), -6.0, -1.0)
                else:
                    trial_settings["weights"][key] = np.clip(original_w + random.uniform(-0.8, 0.8), 0.1, 5.0)
        else:
            # 调整超参数
            hp_key = random.choice(hyper_keys)
            if hp_key == "EWMA_ALPHA":
                trial_settings["hyperparameters"]["EWMA_ALPHA"] = np.clip(trial_settings["hyperparameters"]["EWMA_ALPHA"] + random.uniform(-0.05, 0.05), 0.05, 0.4)
            elif hp_key == "BAYES_WINDOW_SIZE":
                trial_settings["hyperparameters"]["BAYES_WINDOW_SIZE"] = int(np.clip(trial_settings["hyperparameters"]["BAYES_WINDOW_SIZE"] + random.choice([-5, -2, 2, 5]), 10, 50))

        # 运行回测获取 trial 报告
        _, _, _, trial_report = backtester.run_backtest(trial_settings)
        trial_utility = trial_report["utility_score"]
        
        if trial_utility > best_utility:
            best_utility = trial_utility
            best_settings = trial_settings
            improved += 1
            if improved % 3 == 0 or i == max_iters - 1:
                print(f"迭代 {i+1:03d} | 效用提升至: {best_utility:.2f} | Top5命中率: {trial_report['top5_hit_rate']:.2f}% | 稳定性: {trial_report['stability_score']:.2f}")

    # 将最佳配置保存回文件中
    config.save_config(best_settings["indicators"], best_settings["weights"], best_settings["hyperparameters"])
    print(f"\n寻优调优完成！共取得提升次数: {improved} 次，最终最优 Utility Score: {best_utility:.2f}")
    print("="*60 + "\n")
    
    return best_settings, best_utility


# ==========================================================
# 自动特征筛选 (Feature Selection & Importance)
# ==========================================================
def perform_feature_selection(df_enriched: pd.DataFrame) -> Dict[str, float]:
    """
    通过 Backward Elimination（反向剔除法）进行自动特征重要性筛选。
    若关闭某特征能提升/不降综合效用评分，则该特征被置为无效。
    若关闭某特征导致综合效用评分骤降，其减少的差值就是该特征的 Feature Importance。
    """
    print("\n" + "="*60)
    print("      LOTTERY AI - 自动特征重要性筛选 (Feature Selection)")
    print("="*60)
    
    backtester = WalkForwardBacktester(df_enriched)
    config.load_config()
    baseline_settings = config.get_current_settings()
    
    # 首先全特征开启得到基准效用
    full_settings = json.loads(json.dumps(baseline_settings))
    for ind in full_settings["indicators"]:
        full_settings["indicators"][ind] = True
        
    _, _, _, base_report = backtester.run_backtest(full_settings)
    base_utility = base_report["utility_score"]
    print(f"全特征开启基准多指标效用评分 (Baseline Utility): {base_utility:.2f}")
    
    feature_importance = {}
    active_indicators = {}
    
    # 逐个尝试关闭每个特征，测度其边际贡献
    for ind in list(baseline_settings["indicators"].keys()):
        trial_settings = json.loads(json.dumps(full_settings))
        trial_settings["indicators"][ind] = False  # 关闭
        
        _, _, _, trial_report = backtester.run_backtest(trial_settings)
        trial_utility = trial_report["utility_score"]
        
        # 变动值越小/越负，表示该特征不可或缺（即重要性越高）
        importance = base_utility - trial_utility
        feature_importance[ind] = round(importance, 4)
        
        if importance < -0.5:
            # 说明关闭它导致性能变差，说明特征很重要，应予以保留
            active_indicators[ind] = True
            print(f"特征 {ind:<30} | 贡献值: {importance:+6.2f} | [保留]")
        else:
            # 性能几乎无变化或反而提升，说明冗余/噪声，予以关闭
            active_indicators[ind] = False
            print(f"特征 {ind:<30} | 贡献值: {importance:+6.2f} | [自动剔除]")

    # 对特征重要性进行排序与正向归一化
    min_imp = min(feature_importance.values())
    max_imp = max(feature_importance.values())
    
    normalized_importance = {}
    for k, v in feature_importance.items():
        # 如果都在变化范围
        if max_imp > min_imp:
            normalized_importance[k] = round((v - min_imp) / (max_imp - min_imp) * 100.0, 1)
        else:
            normalized_importance[k] = 50.0

    # 保存特征开关优化配置
    best_weights = baseline_settings["weights"]
    best_hypers = baseline_settings["hyperparameters"]
    config.save_config(active_indicators, best_weights, best_hypers)
    
    return normalized_importance


# ==========================================================
# 模型竞技赛 (Model Competition Arena)
# ==========================================================
def run_model_arena_match(df_enriched: pd.DataFrame) -> Tuple[str, dict]:
    """
    自动建立并回测 5 个量化模型：
    Model A (趋势/热度), Model B (均值回归), Model C (时序Markov与窗口), Model D (贝叶斯与波色纠偏), Model E (全特征 Ensemble)
    输出各模型多指标排行榜，并自动挑选冠军模型作为预测基底。
    """
    print("\n" + "="*60)
    print("          LOTTERY AI - 核心模型竞技大赛 (Arena)")
    print("="*60)
    
    backtester = WalkForwardBacktester(df_enriched)
    config.load_config()
    base_settings = config.get_current_settings()
    
    # 1. 组装五大模型开关阵营
    model_templates = {
        "Model A (Trend/Momentum Follower)": [
            "ENABLE_HISTORICAL_HEAT", "ENABLE_RECENT_HEAT_10", "ENABLE_RECENT_HEAT_20", 
            "ENABLE_RECENT_HEAT_30", "ENABLE_RECENT_HEAT_50", "ENABLE_LONG_HEAT_100", 
            "ENABLE_HEAT_MOMENTUM", "ENABLE_EWMA"
        ],
        "Model B (Mean Reversion / Value)": [
            "ENABLE_MISSING_VALUE", "ENABLE_AVERAGE_INTERVAL", "ENABLE_WAVE_REVERSION", 
            "ENABLE_ODD_EVEN_REVERSION", "ENABLE_SIZE_REVERSION", "ENABLE_TAIL_REVERSION", 
            "ENABLE_CONSECUTIVE_PENALTY", "ENABLE_MAX_MISSING_RECOVERY"
        ],
        "Model C (Time-Series Markov & Patterns)": [
            "ENABLE_MARKOV", "ENABLE_SIMILAR_WINDOW", "ENABLE_CYCLE_ANALYSIS"
        ],
        "Model D (Bayesian & Feature Resonance)": [
            "ENABLE_WAVE_REVERSION", "ENABLE_ODD_EVEN_REVERSION", "ENABLE_SIZE_REVERSION", 
            "ENABLE_TAIL_REVERSION", "ENABLE_BAYESIAN_PROB"
        ],
        "Model E (Full-Feature Ensemble)": list(base_settings["indicators"].keys())
    }
    
    arena_results = []
    
    for model_name, active_list in model_templates.items():
        m_settings = json.loads(json.dumps(base_settings))
        # 只开启专属特征
        for ind in m_settings["indicators"]:
            m_settings["indicators"][ind] = (ind in active_list)
            
        _, _, _, report = backtester.run_backtest(m_settings)
        arena_results.append({
            "model_name": model_name,
            "report": report,
            "settings": m_settings
        })
        
    # 根据多维指标 Utility Score 降序排列
    arena_results.sort(key=lambda x: x["report"]["utility_score"], reverse=True)
    
    print("\n🏆 --- 模型竞技赛全维绩效排行榜 --- 🏆")
    print("-" * 80)
    print(f"{'模型名称':<38} | {'Utility':<7} | {'Top5 HR':<7} | {'Top3 HR':<7} | {'Stability':<9} | {'p-Value':<7}")
    print("-" * 80)
    for res in arena_results:
        rep = res["report"]
        print(f"{res['model_name']:<38} | {rep['utility_score']:7.2f} | {rep['top5_hit_rate']:6.2f}% | {rep['top3_hit_rate']:6.2f}% | {rep['stability_score']:9.2f} | {rep['p_value']:7.5f}")
    print("-" * 80)
    
    champion_name = arena_results[0]["model_name"]
    champion_settings = arena_results[0]["settings"]
    print(f"🥇 恭喜 [ {champion_name} ] 荣登模型竞技赛冠军！自动采纳其为推荐预测模型。\n")
    
    # 写入冠军的配置
    config.save_config(champion_settings["indicators"], champion_settings["weights"], champion_settings["hyperparameters"])
    
    return champion_name, arena_results[0]["report"]


# ==========================================================
# 蒙特卡洛随机模拟基线与显著性检验 (Monte Carlo Simulation)
# ==========================================================
def run_monte_carlo_baseline(test_periods_count: int, model_hits: int) -> dict:
    """
    运行 10000 次蒙特卡洛随机模拟。
    每次随机在 12 生肖中盲选 5 个生肖，得出 10000 次下的命中次数分布，
    计算出平均命中率、95% 双侧置信区间，并判定模型是否显著超越随机。
    """
    print("正在运行 10000 次蒙特卡洛随机模拟以校准基线...")
    sim_runs = 10000
    random_hits_record = []
    
    # 每次模拟是一轮完整的回测期数试验
    for _ in range(sim_runs):
        trial_hits = 0
        for _ in range(test_periods_count):
            # 12选5，真实开奖是1个生肖
            chosen = random.sample(range(12), k=5)
            actual = random.randint(0, 11)
            if actual in chosen:
                trial_hits += 1
        random_hits_record.append(trial_hits)
        
    random_rates = [x / test_periods_count * 100 for x in random_hits_record]
    mean_rate = float(np.mean(random_rates))
    std_rate = float(np.std(random_rates))
    
    # 95% 置信区间 (双侧，2.5% 和 97.5% 分位数)
    sorted_rates = sorted(random_rates)
    ci_lower = sorted_rates[int(sim_runs * 0.025)]
    ci_upper = sorted_rates[int(sim_runs * 0.975)]
    
    model_rate = (model_hits / test_periods_count) * 100
    is_significant = model_rate > ci_upper
    
    return {
        "sim_mean_hit_rate": round(mean_rate, 2),
        "sim_std_hit_rate": round(std_rate, 2),
        "ci_lower_rate": round(ci_lower, 2),
        "ci_upper_rate": round(ci_upper, 2),
        "model_hit_rate": round(model_rate, 2),
        "is_significant": is_significant
    }


# ==========================================================
# 主运行回测大盘与报表导出
# ==========================================================
def run_main_workflow():
    """整合全部回测功能模块，完成回测和结果文件生成"""
    analyzer = HistoryAnalyzer()
    if not analyzer.load_and_validate():
        print("[错误] 历史数据加载错误，无法开始回测。")
        return
        
    df_enriched = analyzer.enrich_data()
    
    # 1. 第一阶段：特征筛选剔除多余/噪音指标
    feat_importance = perform_feature_selection(df_enriched)
    
    # 2. 第二阶段：通过爬山算法精细微调权重和超参数
    optimize_weights_and_params(df_enriched, max_iters=100)
    
    # 3. 第三阶段：模型大赛，筛选综合表现力最佳的冠军策略
    champion_name, champ_report = run_model_arena_match(df_enriched)
    
    # 4. 第四阶段：大盘回测性能解析与显著性计算
    config.load_config()
    current_settings = config.get_current_settings()
    backtester = WalkForwardBacktester(df_enriched)
    hit_rate, hits, details, report = backtester.run_backtest(settings=current_settings, verbose=False)
    
    # 蒙特卡洛统计显著性检验
    mc_results = run_monte_carlo_baseline(report["total_count"], hits)
    
    # 输出大盘总章
    print("\n" + "="*60)
    print("         LOTTERY AI - 历史 Walk Forward 全维回测总览")
    print("="*60)
    print(f"回测冠军模型: {champion_name}")
    print(f"滚动测试周期: 120期 ~ {df_enriched['period'].iloc[-1]}期 (共 {report['total_count']} 期)")
    print(f"模型总命中数: {hits} 次")
    print(f"★ 模型 Top5 预测命中率: {hit_rate:.2f}%")
    print(f"★ 蒙特卡洛随机模拟均值: {mc_results['sim_mean_hit_rate']:.2f}%")
    print(f"★ 蒙特卡洛 95% 置信上限: {mc_results['ci_upper_rate']:.2f}%")
    
    sig_verdict = "【显著超越随机！★ 具有显著统计优越性】" if mc_results["is_significant"] else "【未显著超越置信上限，需累积更多周期数据检验】"
    print(f"★ 统计学显著性结论: {sig_verdict}")
    print(f"★ 统计学显著性 p-value : {report['p_value']}")
    print(f"★ 阶段稳定性评分 (Stability): {report['stability_score']:.1f} / 100")
    print("="*60 + "\n")
    
    # 5. 导出回测大盘底层数据，用于 Web 渲染
    results_path = os.path.join(os.path.dirname(__file__), "backtest_results.json")
    try:
        export_data = {
            "champion_model": champion_name,
            "hit_rate": round(hit_rate, 2),
            "hits": hits,
            "total_periods": report["total_count"],
            "random_hit_rate": mc_results["sim_mean_hit_rate"],
            "ci_upper_rate": mc_results["ci_upper_rate"],
            "is_significant": mc_results["is_significant"],
            "p_value": report["p_value"],
            "stability_score": report["stability_score"],
            "utility_score": report["utility_score"],
            "top1_hit_rate": report["top1_hit_rate"],
            "top3_hit_rate": report["top3_hit_rate"],
            "feature_importance": feat_importance,
            "details": details
        }
        with open(results_path, "w", encoding="utf-8") as rf:
            json.dump(export_data, rf, indent=4, ensure_ascii=False)
        print(f"[成功] 结构化回测数据已保存至: {results_path}")
    except Exception as je:
        print(f"[错误] 保存回测结果 json 失败: {je}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        # 快速模式只运行基础回测，不重新调优，防止页面卡顿
        analyzer = HistoryAnalyzer()
        if analyzer.load_and_validate():
            df_enriched = analyzer.enrich_data()
            config.load_config()
            backtester = WalkForwardBacktester(df_enriched)
            hr, h, d, rep = backtester.run_backtest(settings=config.get_current_settings(), verbose=False)
            print(f"[快速回测模式] Top5命中率: {hr:.2f}% | 命中数: {h}次")
    else:
        run_main_workflow()
