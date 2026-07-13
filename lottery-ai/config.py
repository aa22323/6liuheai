# -*- coding: utf-8 -*-
"""
Lottery AI - 配置文件
包含生肖与号码映射、波色映射，以及所有 20 个量化算法指标的开关和评分权重。
支持多维度优化目标配置和动态调优保存/加载。
"""

import os
import json

# 2026年标准号码与生肖对应关系 (马年)
ZODIAC_MAPPING = {
    "马": [1, 13, 25, 37, 49],
    "蛇": [2, 14, 26, 38],
    "龙": [3, 15, 27, 39],
    "兔": [4, 16, 28, 40],
    "虎": [5, 17, 29, 41],
    "牛": [6, 18, 30, 42],
    "鼠": [7, 19, 31, 43],
    "猪": [8, 20, 32, 44],
    "狗": [9, 21, 33, 45],
    "鸡": [10, 22, 34, 46],
    "猴": [11, 23, 35, 47],
    "羊": [12, 24, 36, 48]
}

# 反向映射：号码 -> 生肖
NUM_TO_ZODIAC = {}
for zodiac, nums in ZODIAC_MAPPING.items():
    for num in nums:
        NUM_TO_ZODIAC[num] = zodiac

# 波色定义 (香港六合彩红蓝绿波分布)
WAVE_COLORS = {
    "红": [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
    "蓝": [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
    "绿": [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
}

NUM_TO_WAVE = {}
for color, nums in WAVE_COLORS.items():
    for num in nums:
        NUM_TO_WAVE[num] = color

# ==========================================================
# 20 个核心量化评分指标控制开关 (True: 开启, False: 关闭)
# ==========================================================
ENABLE_HISTORICAL_HEAT = True       # 1. 历史总热度
ENABLE_RECENT_HEAT_10 = True        # 2. 最近10期热度
ENABLE_RECENT_HEAT_20 = True        # 3. 最近20期热度
ENABLE_RECENT_HEAT_30 = True        # 4. 最近30期热度 (新增)
ENABLE_RECENT_HEAT_50 = True        # 5. 最近50期热度
ENABLE_LONG_HEAT_100 = True         # 6. 长期100期热度 (新增)
ENABLE_MISSING_VALUE = True         # 7. 遗漏值比例 (当前遗漏/平均间隔)
ENABLE_AVERAGE_INTERVAL = True      # 8. 平均间隔倒数 (天然热度)
ENABLE_HEAT_MOMENTUM = True         # 9. 冷热转换动量 (近15期频率 - 历史频率) (新增)
ENABLE_MARKOV = True                # 10. 生肖转移概率 (一阶 Markov 链)
ENABLE_WAVE_REVERSION = True        # 11. 波色负偏差纠偏
ENABLE_ODD_EVEN_REVERSION = True    # 12. 单双负偏差纠偏
ENABLE_SIZE_REVERSION = True        # 13. 大小负偏差纠偏
ENABLE_TAIL_REVERSION = True        # 14. 尾数负偏差纠偏
ENABLE_CONSECUTIVE_PENALTY = True   # 15. 连续出现惩罚 (重力阻尼)
ENABLE_MAX_MISSING_RECOVERY = True  # 16. 极限遗漏倍率回补
ENABLE_CYCLE_ANALYSIS = True        # 17. 周期自相关分析 (Autocorrelation)
ENABLE_SIMILAR_WINDOW = True        # 18. 相似历史窗口指纹匹配 (2期/1期模式)
ENABLE_BAYESIAN_PROB = True         # 19. 贝叶斯联合概率 (新增)
ENABLE_EWMA = True                  # 20. 指数加权移动平均概率 (新增)

# ==========================================================
# 20 个核心量化评分指标权重
# ==========================================================
HISTORICAL_HEAT_WEIGHT = 1.0
RECENT_HEAT_10_WEIGHT = 2.0
RECENT_HEAT_20_WEIGHT = 2.5
RECENT_HEAT_30_WEIGHT = 1.8         # 新增
RECENT_HEAT_50_WEIGHT = 1.5
LONG_HEAT_100_WEIGHT = 1.2          # 新增
MISSING_VALUE_WEIGHT = 2.0
AVERAGE_INTERVAL_WEIGHT = 1.0
HEAT_MOMENTUM_WEIGHT = 1.6          # 新增
MARKOV_WEIGHT = 2.0
WAVE_REVERSION_WEIGHT = 1.2
ODD_EVEN_REVERSION_WEIGHT = 1.0
SIZE_REVERSION_WEIGHT = 1.0
TAIL_REVERSION_WEIGHT = 1.5
CONSECUTIVE_PENALTY_WEIGHT = -3.0   # 惩罚项
MAX_MISSING_RECOVERY_WEIGHT = 2.5
CYCLE_ANALYSIS_WEIGHT = 1.5
SIMILAR_WINDOW_WEIGHT = 2.0
BAYESIAN_PROB_WEIGHT = 2.2          # 新增
EWMA_WEIGHT = 2.4                  # 新增

# ==========================================================
# 量化超参数与全局模型设置
# ==========================================================
EWMA_ALPHA = 0.15                   # EWMA 衰减因子
SIMULATION_RUNS = 10000             # 蒙特卡洛随机模拟次数
MAX_MARKOV_ORDER = 1                # 转移矩阵阶数
BAYES_WINDOW_SIZE = 25              # 贝叶斯统计的近期窗口大小

# 优化目标权重配置 (避免单一指标过拟合)
OPT_TOP5_HIT_WEIGHT = 0.50          # Top5 命中率权重 (主要目标)
OPT_TOP3_HIT_WEIGHT = 0.20          # Top3 命中率权重
OPT_TOP1_HIT_WEIGHT = 0.10          # Top1 命中率权重
OPT_STABILITY_WEIGHT = 0.15         # 稳定性评分权重 (不同时间段方差惩罚)
OPT_PVALUE_WEIGHT = 0.05            # 统计显著性(p-value)加成 (1 - p_value)

# 动态配置保存文件
CONFIG_PATCH_FILE = os.path.join(os.path.dirname(__file__), "optimized_config.json")

def load_config():
    """从优化后的 JSON 文件中加载配置（若存在），否则使用上述默认值"""
    global ENABLE_HISTORICAL_HEAT, ENABLE_RECENT_HEAT_10, ENABLE_RECENT_HEAT_20, ENABLE_RECENT_HEAT_30, ENABLE_RECENT_HEAT_50, ENABLE_LONG_HEAT_100
    global ENABLE_MISSING_VALUE, ENABLE_AVERAGE_INTERVAL, ENABLE_HEAT_MOMENTUM, ENABLE_MARKOV
    global ENABLE_WAVE_REVERSION, ENABLE_ODD_EVEN_REVERSION, ENABLE_SIZE_REVERSION, ENABLE_TAIL_REVERSION
    global ENABLE_CONSECUTIVE_PENALTY, ENABLE_MAX_MISSING_RECOVERY, ENABLE_CYCLE_ANALYSIS, ENABLE_SIMILAR_WINDOW
    global ENABLE_BAYESIAN_PROB, ENABLE_EWMA
    
    global HISTORICAL_HEAT_WEIGHT, RECENT_HEAT_10_WEIGHT, RECENT_HEAT_20_WEIGHT, RECENT_HEAT_30_WEIGHT, RECENT_HEAT_50_WEIGHT, LONG_HEAT_100_WEIGHT
    global MISSING_VALUE_WEIGHT, AVERAGE_INTERVAL_WEIGHT, HEAT_MOMENTUM_WEIGHT, MARKOV_WEIGHT
    global WAVE_REVERSION_WEIGHT, ODD_EVEN_REVERSION_WEIGHT, SIZE_REVERSION_WEIGHT, TAIL_REVERSION_WEIGHT
    global CONSECUTIVE_PENALTY_WEIGHT, MAX_MISSING_RECOVERY_WEIGHT, CYCLE_ANALYSIS_WEIGHT, SIMILAR_WINDOW_WEIGHT
    global BAYESIAN_PROB_WEIGHT, EWMA_WEIGHT
    
    global EWMA_ALPHA, SIMULATION_RUNS, BAYES_WINDOW_SIZE

    if os.path.exists(CONFIG_PATCH_FILE):
        try:
            with open(CONFIG_PATCH_FILE, "r", encoding="utf-8") as f:
                patch = json.load(f)
                
            # 加载开关
            indicators = patch.get("indicators", {})
            ENABLE_HISTORICAL_HEAT = indicators.get("ENABLE_HISTORICAL_HEAT", ENABLE_HISTORICAL_HEAT)
            ENABLE_RECENT_HEAT_10 = indicators.get("ENABLE_RECENT_HEAT_10", ENABLE_RECENT_HEAT_10)
            ENABLE_RECENT_HEAT_20 = indicators.get("ENABLE_RECENT_HEAT_20", ENABLE_RECENT_HEAT_20)
            ENABLE_RECENT_HEAT_30 = indicators.get("ENABLE_RECENT_HEAT_30", ENABLE_RECENT_HEAT_30)
            ENABLE_RECENT_HEAT_50 = indicators.get("ENABLE_RECENT_HEAT_50", ENABLE_RECENT_HEAT_50)
            ENABLE_LONG_HEAT_100 = indicators.get("ENABLE_LONG_HEAT_100", ENABLE_LONG_HEAT_100)
            ENABLE_MISSING_VALUE = indicators.get("ENABLE_MISSING_VALUE", ENABLE_MISSING_VALUE)
            ENABLE_AVERAGE_INTERVAL = indicators.get("ENABLE_AVERAGE_INTERVAL", ENABLE_AVERAGE_INTERVAL)
            ENABLE_HEAT_MOMENTUM = indicators.get("ENABLE_HEAT_MOMENTUM", ENABLE_HEAT_MOMENTUM)
            ENABLE_MARKOV = indicators.get("ENABLE_MARKOV", ENABLE_MARKOV)
            ENABLE_WAVE_REVERSION = indicators.get("ENABLE_WAVE_REVERSION", ENABLE_WAVE_REVERSION)
            ENABLE_ODD_EVEN_REVERSION = indicators.get("ENABLE_ODD_EVEN_REVERSION", ENABLE_ODD_EVEN_REVERSION)
            ENABLE_SIZE_REVERSION = indicators.get("ENABLE_SIZE_REVERSION", ENABLE_SIZE_REVERSION)
            ENABLE_TAIL_REVERSION = indicators.get("ENABLE_TAIL_REVERSION", ENABLE_TAIL_REVERSION)
            ENABLE_CONSECUTIVE_PENALTY = indicators.get("ENABLE_CONSECUTIVE_PENALTY", ENABLE_CONSECUTIVE_PENALTY)
            ENABLE_MAX_MISSING_RECOVERY = indicators.get("ENABLE_MAX_MISSING_RECOVERY", ENABLE_MAX_MISSING_RECOVERY)
            ENABLE_CYCLE_ANALYSIS = indicators.get("ENABLE_CYCLE_ANALYSIS", ENABLE_CYCLE_ANALYSIS)
            ENABLE_SIMILAR_WINDOW = indicators.get("ENABLE_SIMILAR_WINDOW", ENABLE_SIMILAR_WINDOW)
            ENABLE_BAYESIAN_PROB = indicators.get("ENABLE_BAYESIAN_PROB", ENABLE_BAYESIAN_PROB)
            ENABLE_EWMA = indicators.get("ENABLE_EWMA", ENABLE_EWMA)

            # 加载权重
            weights = patch.get("weights", {})
            HISTORICAL_HEAT_WEIGHT = weights.get("HISTORICAL_HEAT_WEIGHT", HISTORICAL_HEAT_WEIGHT)
            RECENT_HEAT_10_WEIGHT = weights.get("RECENT_HEAT_10_WEIGHT", RECENT_HEAT_10_WEIGHT)
            RECENT_HEAT_20_WEIGHT = weights.get("RECENT_HEAT_20_WEIGHT", RECENT_HEAT_20_WEIGHT)
            RECENT_HEAT_30_WEIGHT = weights.get("RECENT_HEAT_30_WEIGHT", RECENT_HEAT_30_WEIGHT)
            RECENT_HEAT_50_WEIGHT = weights.get("RECENT_HEAT_50_WEIGHT", RECENT_HEAT_50_WEIGHT)
            LONG_HEAT_100_WEIGHT = weights.get("LONG_HEAT_100_WEIGHT", LONG_HEAT_100_WEIGHT)
            MISSING_VALUE_WEIGHT = weights.get("MISSING_VALUE_WEIGHT", MISSING_VALUE_WEIGHT)
            AVERAGE_INTERVAL_WEIGHT = weights.get("AVERAGE_INTERVAL_WEIGHT", AVERAGE_INTERVAL_WEIGHT)
            HEAT_MOMENTUM_WEIGHT = weights.get("HEAT_MOMENTUM_WEIGHT", HEAT_MOMENTUM_WEIGHT)
            MARKOV_WEIGHT = weights.get("MARKOV_WEIGHT", MARKOV_WEIGHT)
            WAVE_REVERSION_WEIGHT = weights.get("WAVE_REVERSION_WEIGHT", WAVE_REVERSION_WEIGHT)
            ODD_EVEN_REVERSION_WEIGHT = weights.get("ODD_EVEN_REVERSION_WEIGHT", ODD_EVEN_REVERSION_WEIGHT)
            SIZE_REVERSION_WEIGHT = weights.get("SIZE_REVERSION_WEIGHT", SIZE_REVERSION_WEIGHT)
            TAIL_REVERSION_WEIGHT = weights.get("TAIL_REVERSION_WEIGHT", TAIL_REVERSION_WEIGHT)
            CONSECUTIVE_PENALTY_WEIGHT = weights.get("CONSECUTIVE_PENALTY_WEIGHT", CONSECUTIVE_PENALTY_WEIGHT)
            MAX_MISSING_RECOVERY_WEIGHT = weights.get("MAX_MISSING_RECOVERY_WEIGHT", MAX_MISSING_RECOVERY_WEIGHT)
            CYCLE_ANALYSIS_WEIGHT = weights.get("CYCLE_ANALYSIS_WEIGHT", CYCLE_ANALYSIS_WEIGHT)
            SIMILAR_WINDOW_WEIGHT = weights.get("SIMILAR_WINDOW_WEIGHT", SIMILAR_WINDOW_WEIGHT)
            BAYESIAN_PROB_WEIGHT = weights.get("BAYESIAN_PROB_WEIGHT", BAYESIAN_PROB_WEIGHT)
            EWMA_WEIGHT = weights.get("EWMA_WEIGHT", EWMA_WEIGHT)
            
            # 加载超参数
            hyperparams = patch.get("hyperparameters", {})
            EWMA_ALPHA = hyperparams.get("EWMA_ALPHA", EWMA_ALPHA)
            SIMULATION_RUNS = hyperparams.get("SIMULATION_RUNS", SIMULATION_RUNS)
            BAYES_WINDOW_SIZE = hyperparams.get("BAYES_WINDOW_SIZE", BAYES_WINDOW_SIZE)
            
        except Exception as e:
            print(f"[警告] 加载优化配置文件失败，使用代码预设值。原因: {e}")

def save_config(indicators: dict, weights: dict, hyperparameters: dict = None):
    """保存优化后的配置、权重和超参数到 JSON 文件中"""
    try:
        if hyperparameters is None:
            hyperparameters = {
                "EWMA_ALPHA": EWMA_ALPHA,
                "SIMULATION_RUNS": SIMULATION_RUNS,
                "BAYES_WINDOW_SIZE": BAYES_WINDOW_SIZE
            }
        patch = {
            "indicators": indicators,
            "weights": weights,
            "hyperparameters": hyperparameters
        }
        with open(CONFIG_PATCH_FILE, "w", encoding="utf-8") as f:
            json.dump(patch, f, indent=4, ensure_ascii=False)
        print(f"[成功] 优化后的配置已保存至: {CONFIG_PATCH_FILE}")
    except Exception as e:
        print(f"[错误] 保存优化配置文件失败。原因: {e}")

def get_current_settings():
    """获取当前的指标开关与权重"""
    return {
        "indicators": {
            "ENABLE_HISTORICAL_HEAT": ENABLE_HISTORICAL_HEAT,
            "ENABLE_RECENT_HEAT_10": ENABLE_RECENT_HEAT_10,
            "ENABLE_RECENT_HEAT_20": ENABLE_RECENT_HEAT_20,
            "ENABLE_RECENT_HEAT_30": ENABLE_RECENT_HEAT_30,
            "ENABLE_RECENT_HEAT_50": ENABLE_RECENT_HEAT_50,
            "ENABLE_LONG_HEAT_100": ENABLE_LONG_HEAT_100,
            "ENABLE_MISSING_VALUE": ENABLE_MISSING_VALUE,
            "ENABLE_AVERAGE_INTERVAL": ENABLE_AVERAGE_INTERVAL,
            "ENABLE_HEAT_MOMENTUM": ENABLE_HEAT_MOMENTUM,
            "ENABLE_MARKOV": ENABLE_MARKOV,
            "ENABLE_WAVE_REVERSION": ENABLE_WAVE_REVERSION,
            "ENABLE_ODD_EVEN_REVERSION": ENABLE_ODD_EVEN_REVERSION,
            "ENABLE_SIZE_REVERSION": ENABLE_SIZE_REVERSION,
            "ENABLE_TAIL_REVERSION": ENABLE_TAIL_REVERSION,
            "ENABLE_CONSECUTIVE_PENALTY": ENABLE_CONSECUTIVE_PENALTY,
            "ENABLE_MAX_MISSING_RECOVERY": ENABLE_MAX_MISSING_RECOVERY,
            "ENABLE_CYCLE_ANALYSIS": ENABLE_CYCLE_ANALYSIS,
            "ENABLE_SIMILAR_WINDOW": ENABLE_SIMILAR_WINDOW,
            "ENABLE_BAYESIAN_PROB": ENABLE_BAYESIAN_PROB,
            "ENABLE_EWMA": ENABLE_EWMA,
        },
        "weights": {
            "HISTORICAL_HEAT_WEIGHT": HISTORICAL_HEAT_WEIGHT,
            "RECENT_HEAT_10_WEIGHT": RECENT_HEAT_10_WEIGHT,
            "RECENT_HEAT_20_WEIGHT": RECENT_HEAT_20_WEIGHT,
            "RECENT_HEAT_30_WEIGHT": RECENT_HEAT_30_WEIGHT,
            "RECENT_HEAT_50_WEIGHT": RECENT_HEAT_50_WEIGHT,
            "LONG_HEAT_100_WEIGHT": LONG_HEAT_100_WEIGHT,
            "MISSING_VALUE_WEIGHT": MISSING_VALUE_WEIGHT,
            "AVERAGE_INTERVAL_WEIGHT": AVERAGE_INTERVAL_WEIGHT,
            "HEAT_MOMENTUM_WEIGHT": HEAT_MOMENTUM_WEIGHT,
            "MARKOV_WEIGHT": MARKOV_WEIGHT,
            "WAVE_REVERSION_WEIGHT": WAVE_REVERSION_WEIGHT,
            "ODD_EVEN_REVERSION_WEIGHT": ODD_EVEN_REVERSION_WEIGHT,
            "SIZE_REVERSION_WEIGHT": SIZE_REVERSION_WEIGHT,
            "TAIL_REVERSION_WEIGHT": TAIL_REVERSION_WEIGHT,
            "CONSECUTIVE_PENALTY_WEIGHT": CONSECUTIVE_PENALTY_WEIGHT,
            "MAX_MISSING_RECOVERY_WEIGHT": MAX_MISSING_RECOVERY_WEIGHT,
            "CYCLE_ANALYSIS_WEIGHT": CYCLE_ANALYSIS_WEIGHT,
            "SIMILAR_WINDOW_WEIGHT": SIMILAR_WINDOW_WEIGHT,
            "BAYESIAN_PROB_WEIGHT": BAYESIAN_PROB_WEIGHT,
            "EWMA_WEIGHT": EWMA_WEIGHT,
        },
        "hyperparameters": {
            "EWMA_ALPHA": EWMA_ALPHA,
            "SIMULATION_RUNS": SIMULATION_RUNS,
            "BAYES_WINDOW_SIZE": BAYES_WINDOW_SIZE,
        }
    }

# 初始化加载
load_config()
