# -*- coding: utf-8 -*-
"""
Lottery AI - 数据分析与校验模块
负责读取历史 CSV 数据、对数据完整性进行严格校验（查重、查缺漏期、号码生肖验证），
并提供全自动特征生成（波色、单双、大小、尾数、合数、质数、012路、尾数跨度等）和深度多时间窗口（10,20,30,50,100期）统计排行。
"""

import os
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 引入配置
import config

def is_prime_number(n: int) -> int:
    """判断一个数是否是质数 (1 不是质数)"""
    if n <= 1:
        return 0
    for i in range(2, int(np.sqrt(n)) + 1):
        if n % i == 0:
            return 0
    return 1

class HistoryAnalyzer:
    def __init__(self, csv_path: str = None):
        if csv_path is None:
            csv_path = os.path.join(os.path.dirname(__file__), "data", "history.csv")
        self.csv_path = csv_path
        self.df: pd.DataFrame = pd.DataFrame()
        
    def load_and_validate(self) -> bool:
        """
        读取 CSV 并进行数据严格校验和自动修正。
        检查：重复期数、缺失期数、号码合法性 (1~49)、生肖合法性、自动修复生肖与号码不匹配、检测乱码并修正。
        """
        if not os.path.exists(self.csv_path):
            logging.error(f"历史数据文件不存在：{self.csv_path}")
            return False
        
        # 自动探测与修复编码问题
        encodings = ['utf-8', 'gbk', 'gb2312', 'utf-8-sig', 'latin1']
        loaded = False
        for encoding in encodings:
            try:
                self.df = pd.read_csv(self.csv_path, encoding=encoding)
                logging.info(f"成功使用 {encoding} 编码加载 CSV 数据。")
                loaded = True
                break
            except Exception:
                continue
                
        if not loaded:
            logging.error("所有常见编码（utf-8, gbk, gb2312）均无法解析 CSV 文件。")
            return False
            
        # 强制转换列名去除空格
        self.df.columns = [c.strip() for c in self.df.columns]
        
        # 必需字段检查
        required_cols = ["period", "number", "zodiac"]
        for col in required_cols:
            if col not in self.df.columns:
                logging.error(f"CSV 格式错误：缺少必需的列 '{col}'")
                return False
                
        # 自动清洗数据：去除数值和字符串中的空格
        self.df['period'] = pd.to_numeric(self.df['period'], errors='coerce')
        self.df['number'] = pd.to_numeric(self.df['number'], errors='coerce')
        self.df['zodiac'] = self.df['zodiac'].astype(str).str.strip()
        
        # 删除空值行
        self.df = self.df.dropna(subset=['period', 'number']).reset_index(drop=True)
        self.df['period'] = self.df['period'].astype(int)
        self.df['number'] = self.df['number'].astype(int)
        
        # 排序确保期数单调递增
        self.df = self.df.sort_values(by="period").reset_index(drop=True)

        # 1. 校验并报告缺失期数
        all_periods = self.df['period'].tolist()
        if len(all_periods) > 1:
            gaps = []
            for i in range(1, len(all_periods)):
                diff = all_periods[i] - all_periods[i-1]
                if diff > 1:
                    gaps.extend(range(all_periods[i-1] + 1, all_periods[i]))
            if gaps:
                logging.warning(f"[数据缺失提示] 检测到历史数据中存在缺失的期数：{gaps}")

        # 2. 校验重复期数
        duplicate_periods = self.df[self.df.duplicated(subset=['period'], keep=False)]
        if not duplicate_periods.empty:
            logging.error(f"发现重复的期数数据！请核对以下重复期数：\n{duplicate_periods['period'].unique().tolist()}")
            # 自动去重，保留最后一期记录
            self.df = self.df.drop_duplicates(subset=['period'], keep='last').reset_index(drop=True)
            logging.warning("系统已自动保留最新一条记录并去重。")
            
        # 3. 校验号码是否在 1~49 之间
        invalid_numbers = self.df[(self.df['number'] < 1) | (self.df['number'] > 49)]
        if not invalid_numbers.empty:
            logging.error(f"发现非法的开奖号码（非 1~49）：\n{invalid_numbers[['period', 'number']].to_string(index=False)}")
            return False
            
        # 4. 校验生肖是否合法
        valid_zodiacs = set(config.ZODIAC_MAPPING.keys())
        invalid_rows = self.df[~self.df['zodiac'].isin(valid_zodiacs)]
        if not invalid_rows.empty:
            logging.warning(f"发现非法的开奖生肖：\n{invalid_rows[['period', 'zodiac']].to_string(index=False)}")
            # 尝试根据号码映射重新修正生肖
            for idx in invalid_rows.index:
                num = self.df.at[idx, 'number']
                corrected_zodiac = config.NUM_TO_ZODIAC.get(num)
                if corrected_zodiac:
                    self.df.at[idx, 'zodiac'] = corrected_zodiac
                    logging.info(f"期数 {self.df.at[idx, 'period']} 号码 {num}: 生肖自动修正为 '{corrected_zodiac}'")
                else:
                    logging.error(f"期数 {self.df.at[idx, 'period']}: 号码 {num} 无法匹配有效生肖。")
                    return False
            
        # 5. 生肖与号码交叉一致性校准 (按2026年马年标准映射)
        mismatches = 0
        for idx, row in self.df.iterrows():
            expected_zodiac = config.NUM_TO_ZODIAC.get(row['number'])
            if expected_zodiac != row['zodiac']:
                mismatches += 1
                self.df.at[idx, 'zodiac'] = expected_zodiac
        
        if mismatches > 0:
            logging.warning(f"检测到 {mismatches} 处开奖号码与生肖不匹配。系统已自动按2026年岁星流转生肖关系纠偏。")

        logging.info(f"历史开奖数据加载并校验完成。共包含 {len(self.df)} 期正常开奖结果。")
        return True

    def enrich_data(self) -> pd.DataFrame:
        """
        自动生成衍生属性特征：
        波色, 单双, 大小, 尾数, 合数, 质数, 012路, 尾数跨度, 生肖号码集。
        完全自动化完成，无任何人工输入依赖。
        """
        if self.df.empty:
            raise ValueError("无可 enrichment 的数据，请先成功调用 load_and_validate()")
            
        df = self.df.copy()
        
        # 1. 波色
        df['wave_color'] = df['number'].map(config.NUM_TO_WAVE)
        
        # 2. 单双
        df['odd_even'] = df['number'].apply(lambda x: "单" if x % 2 != 0 else "双")
        
        # 3. 大小 (25~49为大，1~24为小)
        df['size'] = df['number'].apply(lambda x: "大" if x >= 25 else "小")
        
        # 4. 尾数 (0~9)
        df['tail'] = df['number'].apply(lambda x: x % 10)
        
        # 5. 合数 (十位 + 个位)
        df['sum_digits'] = df['number'].apply(lambda x: (x // 10) + (x % 10))
        
        # 6. 质数 (1表示质数，0表示合数)
        df['is_prime'] = df['number'].apply(is_prime_number)
        
        # 7. 012路
        df['road_012'] = df['number'].apply(lambda x: x % 3)
        
        # 8. 尾数跨度 (当前期尾数与上一期尾数差值的绝对值)
        df['tail_span'] = 0
        tails = df['tail'].values
        spans = [0] * len(df)
        for i in range(1, len(df)):
            spans[i] = abs(tails[i] - tails[i-1])
        df['tail_span'] = spans
        
        return df

    def analyze_statistics(self, df_enriched: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
        """
        多窗口、全景基础统计。
        计算 10, 20, 30, 50, 100期热度，以及各种生肖的遗漏排行，最大、最小遗漏，平均间隔，连庄次数等。
        """
        if df_enriched is None:
            df_enriched = self.enrich_data()
            
        total_periods = len(df_enriched)
        if total_periods == 0:
            return {}
            
        all_zodiacs = list(config.ZODIAC_MAPPING.keys())
        
        # 频数统计
        zodiac_counts = df_enriched['zodiac'].value_counts()
        number_counts = df_enriched['number'].value_counts()
        
        # 多窗口热度统计 (最近 10, 20, 30, 50, 100期)
        heat_10 = df_enriched.tail(min(10, total_periods))['zodiac'].value_counts()
        heat_20 = df_enriched.tail(min(20, total_periods))['zodiac'].value_counts()
        heat_30 = df_enriched.tail(min(30, total_periods))['zodiac'].value_counts()
        heat_50 = df_enriched.tail(min(50, total_periods))['zodiac'].value_counts()
        heat_100 = df_enriched.tail(min(100, total_periods))['zodiac'].value_counts()
        
        # 遗漏与连庄统计
        missing_stats = {}
        zodiac_series = df_enriched['zodiac'].tolist()
        
        for z in all_zodiacs:
            # 获取该生肖出现的所有索引
            indices = df_enriched[df_enriched['zodiac'] == z].index.tolist()
            
            if not indices:
                current_missing = total_periods
                intervals = [total_periods]
            else:
                current_missing = (total_periods - 1) - indices[-1]
                intervals = [indices[0] + 1]
                for i in range(1, len(indices)):
                    intervals.append(indices[i] - indices[i-1])
            
            avg_interval = float(np.mean(intervals)) if intervals else 12.0
            max_missing = int(np.max(intervals)) if intervals else 24
            min_missing = int(np.min(intervals)) if intervals else 1
            
            # 连续出现次数 (连庄)
            max_consecutive = 0
            temp_consec = 0
            for val in zodiac_series:
                if val == z:
                    temp_consec += 1
                else:
                    max_consecutive = max(max_consecutive, temp_consec)
                    temp_consec = 0
            max_consecutive = max(max_consecutive, temp_consec)
            
            missing_stats[z] = {
                "current_missing": current_missing,
                "avg_interval": avg_interval,
                "max_missing": max_missing,
                "min_missing": min_missing,
                "max_consecutive": max_consecutive
            }
            
        stats = {
            "total_periods": total_periods,
            "zodiac_total_distribution": {z: int(zodiac_counts.get(z, 0)) for z in all_zodiacs},
            "zodiac_heat_10": {z: int(heat_10.get(z, 0)) for z in all_zodiacs},
            "zodiac_heat_20": {z: int(heat_20.get(z, 0)) for z in all_zodiacs},
            "zodiac_heat_30": {z: int(heat_30.get(z, 0)) for z in all_zodiacs},
            "zodiac_heat_50": {z: int(heat_50.get(z, 0)) for z in all_zodiacs},
            "zodiac_heat_100": {z: int(heat_100.get(z, 0)) for z in all_zodiacs},
            "missing_and_intervals": missing_stats,
            "number_counts": {int(num): int(cnt) for num, cnt in number_counts.items()},
            "wave_color_dist": df_enriched['wave_color'].value_counts().to_dict(),
            "odd_even_dist": df_enriched['odd_even'].value_counts().to_dict(),
            "size_dist": df_enriched['size'].value_counts().to_dict(),
            "tail_dist": df_enriched['tail'].value_counts().to_dict(),
            "is_prime_dist": df_enriched['is_prime'].value_counts().to_dict(),
            "road_012_dist": df_enriched['road_012'].value_counts().to_dict()
        }
        return stats

    def print_leaderboards(self, stats: Dict[str, Any]):
        """输出可视化排行榜报表"""
        print("\n" + "="*60)
        print("          LOTTERY AI - 历史开奖深度统计排行榜")
        print("="*60)
        print(f"总统计期数: {stats['total_periods']} 期\n")
        
        # 1. 历史热度生肖排行榜
        total_dist = stats["zodiac_total_distribution"]
        sorted_total = sorted(total_dist.items(), key=lambda x: x[1], reverse=True)
        print("--- [ 历史最热生肖排行榜 (总出场次数) ] ---")
        for rank, (z, count) in enumerate(sorted_total, 1):
            pct = (count / stats['total_periods']) * 100
            print(f"第 {rank:02d} 名: {z} | 出现 {count:3d} 次 | 占比 {pct:5.2f}%")
            
        # 2. 最近热度排行
        print("\n--- [ 近期爆发排行榜 (多时间窗口频数看板) ] ---")
        sorted_h20 = sorted(stats["zodiac_heat_20"].items(), key=lambda x: x[1], reverse=True)
        print("生肖 | 近10期 | 近20期 | 近30期 | 近50期 | 近100期")
        print("-" * 52)
        for z, h20_cnt in sorted_h20:
            h10_cnt = stats["zodiac_heat_10"].get(z, 0)
            h30_cnt = stats["zodiac_heat_30"].get(z, 0)
            h50_cnt = stats["zodiac_heat_50"].get(z, 0)
            h100_cnt = stats["zodiac_heat_100"].get(z, 0)
            print(f" {z}  |  {h10_cnt:2d}次  |  {h20_cnt:2d}次  |  {h30_cnt:2d}次  |  {h50_cnt:2d}次  |  {h100_cnt:3d}次")
            
        # 3. 遗漏与间隔排行
        print("\n--- [ 遗漏值与历史跨度排行 (当前冷态排行) ] ---")
        missing_info = stats["missing_and_intervals"]
        sorted_missing = sorted(missing_info.items(), key=lambda x: x[1]["current_missing"], reverse=True)
        print("生肖 | 当前遗漏期 | 平均出现间隔 | 历史最大遗漏 | 历史最小遗漏 | 历史最长连庄")
        print("-" * 75)
        for z, m_data in sorted_missing:
            print(f" {z}  |   {m_data['current_missing']:3d}期   |   {m_data['avg_interval']:5.1f}期   |   {m_data['max_missing']:3d}期   |   {m_data['min_missing']:3d}期   |   {m_data['max_consecutive']:2d}期")
            
        # 4. 波色/单双/大小/尾数分布
        print("\n--- [ 衍生属性整体大数法则分布 ] ---")
        print(f"波色：红波 {stats['wave_color_dist'].get('红',0)}次 | 蓝波 {stats['wave_color_dist'].get('蓝',0)}次 | 绿波 {stats['wave_color_dist'].get('绿',0)}次")
        print(f"单双：单数 {stats['odd_even_dist'].get('单',0)}次 | 双数 {stats['odd_even_dist'].get('双',0)}次")
        print(f"大小：大号 {stats['size_dist'].get('大',0)}次 | 小号 {stats['size_dist'].get('小',0)}次")
        print(f"质合：质数(Prime) {stats['is_prime_dist'].get(1,0)}次 | 合数(Composite) {stats['is_prime_dist'].get(0,0)}次")
        print(f"余数：0路 {stats['road_012_dist'].get(0,0)}次 | 1路 {stats['road_012_dist'].get(1,0)}次 | 2路 {stats['road_012_dist'].get(2,0)}次")
        print("="*60 + "\n")

if __name__ == "__main__":
    analyzer = HistoryAnalyzer()
    if analyzer.load_and_validate():
        df_enriched = analyzer.enrich_data()
        stats = analyzer.analyze_statistics(df_enriched)
        analyzer.print_leaderboards(stats)
