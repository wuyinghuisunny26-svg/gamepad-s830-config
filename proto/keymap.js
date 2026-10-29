/**
 * 键码表与修饰键编码
 *
 * 数据来源分两类，字段 provenance 标注：
 *   - "source"：从 com.qx.gamepadspace 反编译源码直接读到（r5.k.M0 / r5.k.J）
 *   - "hid"   ：由 HID Usage Tables（Keyboard/Keypad 页 0x07）标准推导，
 *               与源码中 0x28=回车、0x4F~0x52=方向键 等样本一致
 *
 * 键码写法：十六进制字符串
 *   2 字符  = 键盘页 usage，如 "28" = 0x28 = 回车
 *   8 字符  = 4 字节扩展码，首字节为页面标识，如 "80cd0000" = 消费类页 0xCD = 播放/暂停
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.GSKeymap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 修饰键：E0~E6，下发时折叠成位掩码 ----------
  // 位定义直接来自 r5.k.M0(ArrayList) 的求和表达式
  var MODIFIERS = [
    { code: 'E0', name: '左Ctrl', bit: 1 },
    { code: 'E1', name: '左Shift', bit: 2 },
    { code: 'E2', name: '左Alt', bit: 4 },
    { code: 'E3', name: '左Win', bit: 8 },
    { code: 'E4', name: '右Ctrl', bit: 16 },
    { code: 'E5', name: '右Shift', bit: 32 },
    { code: 'E6', name: '右Alt', bit: 64 }
  ];

  // ---------- 扩展键（4 字节码），来自 r5.k.J(int) ----------
  var SPECIAL_KEYS = [
    { code: '80cd0000', name: '播放/暂停', provenance: 'source' },
    { code: '80e20000', name: '静音', provenance: 'source' },
    { code: '80e90000', name: '音量+', provenance: 'source' },
    { code: '80ea0000', name: '音量-', provenance: 'source' },
    { code: '80b60000', name: '上一曲', provenance: 'source' },
    { code: '80b50000', name: '下一曲', provenance: 'source' },
    { code: '82230000', name: 'Home', provenance: 'source' },
    { code: '82240000', name: '返回', provenance: 'source' },
    { code: 'fe', name: '左键(鼠标)', provenance: 'source' }
  ];

  // ---------- 键盘页标准键（1 字节） ----------
  var KEYBOARD_KEYS = {};

  function hex2(n) {
    var s = n.toString(16).toUpperCase();
    return s.length === 1 ? '0' + s : s;
  }

  function put(code, name) {
    KEYBOARD_KEYS[code] = name;
  }

  // 字母 A-Z = 0x04..0x1D
  for (var i = 0; i < 26; i++) {
    put(hex2(0x04 + i), String.fromCharCode(65 + i));
  }
  // 数字 1-9,0 = 0x1E..0x27
  for (var d = 0; d < 9; d++) {
    put(hex2(0x1e + d), String(d + 1));
  }
  put('27', '0');

  // 常用符号与功能键
  put('28', '回车');
  put('29', 'Esc');
  put('2A', '退格');
  put('2B', 'Tab');
  put('2C', '空格');
  put('2D', '-');
  put('2E', '=');
  put('2F', '[');
  put('30', ']');
  put('31', '\\');
  put('33', ';');
  put('34', "'");
  put('35', '`');
  put('36', ',');
  put('37', '.');
  put('38', '/');
  put('39', 'CapsLock');

  // F1-F12 = 0x3A..0x45
  for (var f = 0; f < 12; f++) {
    put(hex2(0x3a + f), 'F' + (f + 1));
  }

  put('46', 'PrintScreen');
  put('47', 'ScrollLock');
  put('48', '暂停');
  put('49', 'Insert');
  put('4A', 'Home键');
  put('4B', 'PageUp');
  put('4C', 'Delete');
  put('4D', 'End');
  put('4E', 'PageDown');
  // 方向键：与源码 J() 的 4F/50/51/52 完全一致
  put('4F', '方向右');
  put('50', '方向左');
  put('51', '方向下');
  put('52', '方向上');

  // ---------- 辅助函数 ----------

  function normalize(code) {
    return String(code == null ? '' : code).trim().toUpperCase();
  }

  function isModifier(code) {
    var c = normalize(code);
    for (var i = 0; i < MODIFIERS.length; i++) {
      if (MODIFIERS[i].code === c) return true;
    }
    return false;
  }

  /**
   * 把一组键码折叠成修饰位掩码（与 r5.k.M0 的算法一致）。
   * @param {string[]} codes
   * @returns {number} 0..127
   */
  function modifierMask(codes) {
    var mask = 0;
    (codes || []).forEach(function (code) {
      var c = normalize(code);
      for (var i = 0; i < MODIFIERS.length; i++) {
        if (MODIFIERS[i].code === c) {
          mask |= MODIFIERS[i].bit;
          return;
        }
      }
    });
    return mask & 0xff;
  }

  /** 位掩码 → 修饰键名数组 */
  function maskToNames(mask) {
    return MODIFIERS.filter(function (m) {
      return (mask & m.bit) !== 0;
    }).map(function (m) {
      return m.name;
    });
  }

  /**
   * 键码 → 可读名称
   * @returns {{code:string,name:string,kind:string}|null}
   */
  function describe(code) {
    var c = normalize(code);
    if (!c) return null;

    for (var i = 0; i < MODIFIERS.length; i++) {
      if (MODIFIERS[i].code === c) {
        return { code: c, name: MODIFIERS[i].name, kind: 'modifier' };
      }
    }
    for (var j = 0; j < SPECIAL_KEYS.length; j++) {
      if (SPECIAL_KEYS[j].code.toUpperCase() === c) {
        return { code: c, name: SPECIAL_KEYS[j].name, kind: 'special' };
      }
    }
    if (KEYBOARD_KEYS[c]) {
      return { code: c, name: KEYBOARD_KEYS[c], kind: 'keyboard' };
    }
    return { code: c, name: '未知(' + c + ')', kind: 'unknown' };
  }

  /** 键码 → 字节数组（下发时用） */
  function toBytes(code) {
    var c = normalize(code);
    var out = [];
    for (var i = 0; i < c.length; i += 2) {
      out.push(parseInt(c.substr(i, 2), 16));
    }
    return out;
  }

  /** 校验键码格式 */
  function isValidCode(code) {
    var c = normalize(code);
    return /^([0-9A-F]{2}|[0-9A-F]{8})$/.test(c);
  }

  return {
    MODIFIERS: MODIFIERS,
    SPECIAL_KEYS: SPECIAL_KEYS,
    KEYBOARD_KEYS: KEYBOARD_KEYS,
    isModifier: isModifier,
    modifierMask: modifierMask,
    maskToNames: maskToNames,
    describe: describe,
    toBytes: toBytes,
    isValidCode: isValidCode
  };
});
