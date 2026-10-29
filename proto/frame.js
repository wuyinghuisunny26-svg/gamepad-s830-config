/**
 * 手柄命令帧编解码
 *
 * 帧格式（从 com.qx.gamepadspace 逆向得出，实证依据见 docs/命令表-初版.md）：
 *   [0] 帧头   常见 0x10（主控）、0x01/0x02（副控）、0xBA（特殊）
 *   [1] 长度   总字节数（含帧头、长度自身与命令码）
 *   [2] 命令码
 *   [3..] 载荷
 *
 * 无校验和：t1() 直接交给 MyBluetoothService.i(ComBean) 发出。
 *
 * 该文件同时可用于浏览器（挂到 window.GSFrame）与 Node（module.exports）。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.GSFrame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HEADER_MAIN = 0x10;
  var KNOWN_HEADERS = [0x10, 0x01, 0x02, 0xba];

  function toArray(x) {
    if (x == null) return [];
    if (Array.isArray(x)) return x.slice();
    if (x instanceof Uint8Array) return Array.prototype.slice.call(x);
    throw new TypeError('不支持的字节序列类型: ' + Object.prototype.toString.call(x));
  }

  function u8(v) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) {
      throw new TypeError('字节必须是整数: ' + v);
    }
    return n & 0xff;
  }

  /**
   * 组装一帧。
   * @param {number} cmd      命令码 0..255
   * @param {Array}  payload  载荷字节数组（可省略）
   * @param {number} header   帧头，默认 0x10
   * @returns {number[]} 完整帧字节
   */
  function build(cmd, payload, header) {
    var h = header == null ? HEADER_MAIN : u8(header);
    var body = toArray(payload).map(u8);
    var frame = [h, body.length + 3, u8(cmd)].concat(body);
    if (frame[1] > 0xff) {
      throw new RangeError('帧过长，长度字段会溢出: ' + frame[1]);
    }
    return frame;
  }

  /**
   * 通知包固定 20 字节，真实帧长度由 [1] 给出，帧外补 0xFF。
   * 返回按长度字段截断后的真实帧。
   */
  function trimPadding(bytes) {
    var b = toArray(bytes).map(u8);
    if (b.length < 3) return b;
    var len = b[1];
    // 真机通知包固定 20 字节，超出长度字段的部分是残留数据（可能是 0xFF，也可能是上一包的尾巴）
    if (len >= 3 && len < b.length) return b.slice(0, len);
    return b;
  }

  /**
   * 解析一帧并给出告警（不抛异常，方便对真实抓包做宽松处理）。
   * @param {Array|Uint8Array} bytes
   * @returns {{header:number,len:number,cmd:number,payload:number[],warnings:string[]}}
   */
  function parse(bytes, opts) {
    var noTrim = opts && opts.trim === false;
    var b = (noTrim ? toArray(bytes).map(u8) : trimPadding(bytes).map(u8));
    var warnings = [];

    if (b.length < 3) {
      return { header: b[0], len: b[1], cmd: b[2], payload: [], warnings: ['帧长度不足 3 字节'] };
    }

    var header = b[0];
    var declared = b[1];
    var cmd = b[2];
    var payload = b.slice(3);

    if (KNOWN_HEADERS.indexOf(header) === -1) {
      warnings.push('未知帧头 0x' + header.toString(16));
    }
    if (declared !== b.length) {
      warnings.push(
        '长度字段不符：声明 ' + declared + '，实际 ' + b.length +
        '（差 ' + (b.length - declared) + '）'
      );
    }
    if (declared !== b.length && declared === b.length - 1) {
      warnings.push('符合已知的“源码少算 1 字节”现象，建议以实际字节为准');
    }

    return { header: header, len: declared, cmd: cmd, payload: payload, warnings: warnings };
  }

  /** 只给出载荷长度足够时的“期望长度字段” */
  function expectedLen(payload) {
    return toArray(payload).length + 3;
  }

  function toHex(bytes) {
    return toArray(bytes)
      .map(function (x) {
        var s = (x & 0xff).toString(16);
        return s.length === 1 ? '0' + s : s;
      })
      .join(' ');
  }

  function fromHex(str) {
    var parts = String(str).trim().split(/[\s,]+/).filter(Boolean);
    return parts.map(function (p) {
      var n = parseInt(p, 16);
      if (isNaN(n)) throw new Error('非法十六进制片段: ' + p);
      return n & 0xff;
    });
  }

  return {
    HEADER_MAIN: HEADER_MAIN,
    KNOWN_HEADERS: KNOWN_HEADERS,
    build: build,
    parse: parse,
    trimPadding: trimPadding,
    expectedLen: expectedLen,
    toHex: toHex,
    fromHex: fromHex
  };
});
