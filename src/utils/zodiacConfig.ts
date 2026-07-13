/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 2026年标准号码与生肖对应关系 (马年)
export const ZODIAC_MAPPING: Record<string, number[]> = {
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
};

// 反向映射：号码 -> 生肖
export const NUM_TO_ZODIAC: Record<number, string> = {};
for (const [zodiac, nums] of Object.entries(ZODIAC_MAPPING)) {
  nums.forEach(num => {
    NUM_TO_ZODIAC[num] = zodiac;
  });
}

// 波色定义 (红蓝绿)
export const WAVE_COLORS: Record<string, number[]> = {
  "红": [1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46],
  "蓝": [3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48],
  "绿": [5, 6, 11, 16, 17, 21, 22, 27, 28, 32, 33, 38, 39, 43, 44, 49]
};

// 反向映射：号码 -> 波色
export const NUM_TO_WAVE: Record<number, string> = {};
for (const [color, nums] of Object.entries(WAVE_COLORS)) {
  nums.forEach(num => {
    NUM_TO_WAVE[num] = color;
  });
}
