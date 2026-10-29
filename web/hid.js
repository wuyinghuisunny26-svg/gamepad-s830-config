/**
 * WebHID 封装
 *
 * 为什么用 WebHID 而不是 WebUSB：
 *   WebUSB 对 HID 类设备直接拒绝（防键盘记录），
 *   而 WebHID 专门开放「厂商自定义集合」（usagePage >= 0xFF00），
 *   正好是 2.4G 接收器放配置通道的地方。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.GSHID = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var current = null;
  var inputHandler = null;

  function supported() {
    return !!(navigator && navigator.hid);
  }

  /** 弹窗选择设备（空 filters = 显示所有 HID 设备） */
  async function pick() {
    if (!supported()) throw new Error('浏览器不支持 WebHID，请用 Edge/Chrome 并通过 https 或 127.0.0.1 打开');
    return navigator.hid.requestDevice({ filters: [] });
  }

  /** 已授权的设备列表 */
  async function list() {
    if (!supported()) return [];
    return navigator.hid.getDevices();
  }

  /** 打开设备并监听输入报告 */
  async function open(device) {
    if (!device.opened) await device.open();
    current = device;
    device.removeEventListener('inputreport', onReport);
    device.addEventListener('inputreport', onReport);
    return device;
  }

  function onReport(ev) {
    if (typeof inputHandler === 'function') {
      var data = new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength);
      inputHandler(data, ev.reportId);
    }
  }

  function onInput(fn) {
    inputHandler = fn;
  }

  /** 发 Output Report */
  async function send(reportId, data) {
    if (!current) throw new Error('没有已打开的设备');
    if (!current.opened) await current.open();
    return current.sendReport(reportId, data);
  }

  /** 发 Feature Report */
  async function sendFeature(reportId, data) {
    if (!current) throw new Error('没有已打开的设备');
    return current.sendFeatureReport(reportId, data);
  }

  /** 读 Feature Report */
  async function readFeature(reportId) {
    if (!current) throw new Error('没有已打开的设备');
    var dv = await current.receiveFeatureReport(reportId);
    return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  }

  async function close() {
    if (current && current.opened) await current.close();
    current = null;
  }

  /** 判断某个 usagePage 是否是厂商自定义 */
  function isVendor(usagePage) {
    return usagePage >= 0xFF00;
  }

  /** 汇总设备里的厂商集合 */
  function vendorCollections(device) {
    var out = [];
    (device.collections || []).forEach(function (c) {
      if (isVendor(c.usagePage)) out.push(c);
    });
    return out;
  }

  return {
    supported: supported,
    pick: pick,
    list: list,
    open: open,
    onInput: onInput,
    send: send,
    sendFeature: sendFeature,
    readFeature: readFeature,
    close: close,
    isVendor: isVendor,
    vendorCollections: vendorCollections
  };
});
