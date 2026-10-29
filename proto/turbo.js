/**
 * 连击（Turbo）配置
 *
 * 依据源码 r5.k.d0(ArrayList<TurboKeys>) 与 j1(byte[])：
 *   数组长度 46 = 23 个按键 × 2 字节
 *   [orgId * 2]     = 模式（0 关闭 / 1 连击 / 2 自动连击）
 *   [orgId * 2 + 1] = 连击频率
 *   写入帧 = 10 | (46+3=49=0x31) | 0x38 | 46 字节
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.GSTurbo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CMD = 0x38;
  var HEADER = 0x10;
  var ARRAY_LEN = 46;

  var MODE = { OFF: 0, TURBO: 1, AUTO: 2 };
  var CYCLE_MIN = 1;
  var CYCLE_MAX = 7;      // 官方 App 滑条范围 1~7（用户确认）
  var MODE_NAME = { 0: '关闭', 1: '连击', 2: '自动连击' };

  /** 全关的默认数组 */
  function defaultArray() {
    return new Array(ARRAY_LEN).fill(0);
  }

  /**
   * 由 { 物理按键orgId: {mode, cycle} } 生成 46 字节数组
   * @param {Object} map  例如 { 16: {mode:1, cycle:5} }
   */
  function fromMap(map) {
    var arr = defaultArray();
    Object.keys(map || {}).forEach(function (k) {
      var org = Number(k);
      var v = map[k] || {};
      var mode = Number(v.mode || 0);
      var cycle = Number(v.cycle == null ? 5 : v.cycle);
      if (org < 0 || org >= ARRAY_LEN / 2) throw new Error('orgId 越界: ' + org);
      if (mode < 0 || mode > 2) throw new Error('连击模式非法: ' + mode);
      if (cycle < CYCLE_MIN || cycle > CYCLE_MAX) {
        throw new Error('连击频率必须是 ' + CYCLE_MIN + '~' + CYCLE_MAX + '：' + cycle);
      }
      arr[org * 2] = mode;
      arr[org * 2 + 1] = cycle;
    });
    return arr;
  }

  /** 组帧 */
  function buildFrame(arr) {
    if (!Array.isArray(arr) || arr.length !== ARRAY_LEN) {
      throw new Error('连击数组必须是 ' + ARRAY_LEN + ' 字节');
    }
    return [HEADER, ARRAY_LEN + 3, CMD].concat(arr);
  }

  /** 从数组还原 { orgId: {mode, cycle} } */
  function toMap(arr) {
    var out = {};
    for (var i = 0; i < ARRAY_LEN / 2; i++) {
      var mode = arr[i * 2];
      if (mode) out[i] = { mode: mode, cycle: arr[i * 2 + 1] };
    }
    return out;
  }

  function modeName(m) {
    return MODE_NAME[m] || ('未知' + m);
  }

  return {
    CMD: CMD,
    ARRAY_LEN: ARRAY_LEN,
    MODE: MODE,
    CYCLE_MIN: CYCLE_MIN,
    CYCLE_MAX: CYCLE_MAX,
    MODE_NAME: MODE_NAME,
    defaultArray: defaultArray,
    fromMap: fromMap,
    buildFrame: buildFrame,
    toMap: toMap,
    modeName: modeName
  };
});
