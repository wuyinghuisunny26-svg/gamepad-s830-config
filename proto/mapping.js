/**
 * 按键重映射（真机验证版）
 *
 * 依据（2026-10-29 真机实测 + 官方 App 显示对照）：
 *   - 写入帧 = 10 | 总长度 | 0x37 | 23 字节映射数组
 *   - 数组下标 = orgId（物理按键编号）
 *   - 数组值   = 目标按键 id
 *   - orgId 0~15 与 id 0~15 同名同序
 *   - 数组固定 23 字节，未用到的位置填 0
 *
 * 本设备（S830 Pro，mapVersion=4）只支持「按键 → 按键」，不支持映射到键盘。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.GSMapping = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CMD_WRITE_MAPPING = 0x37;
  // 未映射的填充值（超出 16 个合法 id），待真机确认
  var UNMAPPED = 0xff;
  var HEADER = 0x10;
  var ARRAY_LEN = 23;

  /**
   * id 目录：下标即 id，顺序与官方 App 改键弹窗一致。
   * 0~15 实测确认（写入 bArr[i]=i 后，App 显示全部自映射，无箭头）。
   */
  var ID_TO_BUTTON = [
    'A', 'B', 'X', 'Y',
    'UP', 'DOWN', 'LEFT', 'RIGHT',
    'LB', 'RB', 'LT', 'RT',
    'L3', 'R3', 'MINUS', 'PLUS'
  ];

  /**
   * 物理按键的 orgId（真机实测）
   *   0~15  : 主按键，与 id 同序
   *   16~17 : 保留（改键页不显示，实测无按键认领）
   *   18~21 : M1~M4
   *   22    : 保留
   * 依据：写入 arr[16..22]=[1,2,3,4,5,6,7] 后，App 显示 M1>Y(3)、M2>▲(4)、M3>▼(5)、M4>◀(6)
   */
  var ORG_INDEX = {};
  ID_TO_BUTTON.forEach(function (name, idx) { ORG_INDEX[name] = idx; });
  ORG_INDEX.M1 = 18;
  ORG_INDEX.M2 = 19;
  ORG_INDEX.M3 = 20;
  ORG_INDEX.M4 = 21;

  /** 按 orgId 升序的物理按键名（含保留位为 null） */
  var ORG_ORDER = (function () {
    var arr = new Array(23).fill(null);
    Object.keys(ORG_INDEX).forEach(function (name) { arr[ORG_INDEX[name]] = name; });
    return arr;
  })();

  var BUTTON_TO_ID = {};
  ID_TO_BUTTON.forEach(function (name, idx) {
    BUTTON_TO_ID[name] = idx;
  });

  /**
   * 默认映射
   * - 16 个主按键：映射到自己
   * - M1~M4 背键：不是可选目标，无法映射到自己，默认给 RB（与官方 App 初始状态一致）
   */
  var DEFAULT_BACK_BUTTON_TARGET = null;   // null = 背键默认留空

  function defaultMapping() {
    var arr = new Array(ARRAY_LEN).fill(0);
    ORG_ORDER.forEach(function (name) {
      var org = ORG_INDEX[name];
      var target = BUTTON_TO_ID[name];
      if (org === undefined) return;
      if (target === undefined) {
        arr[org] = (DEFAULT_BACK_BUTTON_TARGET === null)
          ? UNMAPPED : BUTTON_TO_ID[DEFAULT_BACK_BUTTON_TARGET];
      } else {
        arr[org] = target;
      }
    });
    return arr;
  }

  /** M1~M4 不能作为映射目标 */
  function isSourceOnly(name) {
    return ORG_ORDER.indexOf(name) >= ID_TO_BUTTON.length && ORG_INDEX[name] !== undefined;
  }

  /**
   * 由 { 物理按键: 目标按键 } 生成 23 字节数组
   * @param {Object} map  例如 { M1: 'X', M4: 'RB' }
   */
  function mappingFromPairs(map) {
    var arr = defaultMapping();
    Object.keys(map || {}).forEach(function (orgName) {
      var org = ORG_INDEX[orgName];
      if (org === undefined) throw new Error('未知的物理按键: ' + orgName);
      if (map[orgName] === null) { arr[org] = UNMAPPED; return; }
      var target = BUTTON_TO_ID[map[orgName]];
      if (target === undefined) throw new Error('未知的目标按键: ' + map[orgName]);
      arr[org] = target;
    });
    return arr;
  }

  /** 23 字节数组 → 组帧（10 | len | 37 | payload） */
  function buildWriteFrame(arr) {
    if (!Array.isArray(arr) || arr.length !== ARRAY_LEN) {
      throw new Error('映射数组必须是 ' + ARRAY_LEN + ' 字节');
    }
    arr.forEach(function (v, i) {
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        throw new Error('第 ' + i + ' 位不是合法字节: ' + v);
      }
      if (v >= ID_TO_BUTTON.length && v !== UNMAPPED) {
        throw new Error('第 ' + i + ' 位的目标 id 越界: ' + v);
      }
    });
    return [HEADER, ARRAY_LEN + 3, CMD_WRITE_MAPPING].concat(arr);
  }

  /** 数组 → 可读描述，用于界面回显 */
  function describe(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var orgName = ORG_ORDER[i];
      if (!orgName) continue;
      var target = ID_TO_BUTTON[arr[i]];
      if (target === undefined) continue;   // 未映射或保留位
      if (target !== orgName) out.push(orgName + ' → ' + target);
    }
    return out;
  }

  function idToButton(id) {
    return ID_TO_BUTTON[id] || null;
  }

  function buttonToId(name) {
    var v = BUTTON_TO_ID[name];
    return v === undefined ? null : v;
  }

  return {
    CMD_WRITE_MAPPING: CMD_WRITE_MAPPING,
    UNMAPPED: UNMAPPED,
    ARRAY_LEN: ARRAY_LEN,
    ID_TO_BUTTON: ID_TO_BUTTON,
    ORG_ORDER: ORG_ORDER,
    defaultMapping: defaultMapping,
    isSourceOnly: isSourceOnly,
    DEFAULT_BACK_BUTTON_TARGET: DEFAULT_BACK_BUTTON_TARGET,
    mappingFromPairs: mappingFromPairs,
    buildWriteFrame: buildWriteFrame,
    describe: describe,
    idToButton: idToButton,
    buttonToId: buttonToId
  };
});
