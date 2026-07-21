/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 2026年标准号码与生肖对应关系 (马年) - 声明为可变内容以支持动态岁次更新
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

/**
 * 动态更新生肖与号码对应关系（支持岁次更替或手动自定义映射）
 * 在香港六合彩中，自动模式下生肖伴随农历新年（立春）自动向前轮转：
 * 新生肖年的“本命生肖”将占据号码 1, 13, 25, 37, 49，并按逆时针序列依次排列其他生肖。
 * @param yearOrZodiac 农历年份（如 2026, 2027）、本命年生肖，或完整的自定义 Record<string, number[]>
 */
export function updateZodiacMapping(yearOrZodiac: number | string | Record<string, number[]>) {
  const ZODIAC_ORDER = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
  
  // 清除旧的属性（保留原有对象引用，以便 ES Module 导入无需重绑定）
  for (const k in ZODIAC_MAPPING) {
    delete ZODIAC_MAPPING[k];
  }
  for (const k in NUM_TO_ZODIAC) {
    delete NUM_TO_ZODIAC[k];
  }

  if (yearOrZodiac && typeof yearOrZodiac === "object") {
    // 1. 手动自定义映射模式
    const customMapping = yearOrZodiac as Record<string, number[]>;
    
    // 按标准 ZODIAC_ORDER（或默认顺序）将生肖填充至 ZODIAC_MAPPING 
    // 为了不破坏并列分数的排序机制，我们可以默认从猴/羊/马等本命年份顺推
    ZODIAC_ORDER.forEach(z => {
      ZODIAC_MAPPING[z] = customMapping[z] ? [...customMapping[z]].sort((a, b) => a - b) : [];
    });
    
    // 反向映射：号码 -> 生肖
    for (const [zodiac, nums] of Object.entries(ZODIAC_MAPPING)) {
      nums.forEach(num => {
        NUM_TO_ZODIAC[num] = zodiac;
      });
    }
    return;
  }

  // 2. 自动岁次计算公式模式
  let activeZodiac = "马"; // 默认 2026 丙午马年

  if (typeof yearOrZodiac === "number") {
    const baseYear = 2026;
    const baseIdx = 6; // 2026 为马年 ("马" 的 index 是 6)
    const diff = yearOrZodiac - baseYear;
    let activeIdx = (baseIdx + diff) % 12;
    if (activeIdx < 0) activeIdx += 12;
    activeZodiac = ZODIAC_ORDER[activeIdx];
  } else if (typeof yearOrZodiac === "string" && ZODIAC_ORDER.includes(yearOrZodiac)) {
    activeZodiac = yearOrZodiac;
  }

  const activeIdx = ZODIAC_ORDER.indexOf(activeZodiac);

  // 按逆时针顺序插入生肖键，以保证 Object.keys() 遍历顺序与原版完全一致（本命年排首位，然后是上一年、上上年...）
  // 这种排序规则对于分数并列（同分）时的默认推荐排序（Tie-breaker）起着决定性作用。
  for (let i = 0; i < 12; i++) {
    const zIdx = (activeIdx - i + 12) % 12;
    const zodiac = ZODIAC_ORDER[zIdx];
    ZODIAC_MAPPING[zodiac] = [];
  }

  // 1 到 49 号码按岁次逆时针公式分配
  for (let num = 1; num <= 49; num++) {
    const offset = num - 1;
    const zIdx = (activeIdx - (offset % 12) + 12) % 12;
    const zodiac = ZODIAC_ORDER[zIdx];
    ZODIAC_MAPPING[zodiac].push(num);
    NUM_TO_ZODIAC[num] = zodiac;
  }
}

// 默认初始化为 2026 马年
updateZodiacMapping(2026);

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
