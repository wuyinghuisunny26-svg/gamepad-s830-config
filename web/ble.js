/**
 * Web Bluetooth 传输层（真机版）
 *
 * 依据真机实测：
 *   服务 95990001-1111-6666-8888-0123456789ab
 *     写   95990002-...
 *     通知 95990003-...
 *   MTU 196，通知包固定 20 字节
 *
 * 注意：页面必须运行在 https 或 http://127.0.0.1 / localhost 下，
 *      直接双击 html（file://）拿不到 navigator.bluetooth。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.GSBLE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SVC = '95990001-1111-6666-8888-0123456789ab';
  var CH_WRITE = '95990002-1111-6666-8888-0123456789ab';
  var CH_NOTIFY = '95990003-1111-6666-8888-0123456789ab';

  var device = null;
  var chWrite = null;
  var chNotify = null;
  var onFrame = null;
  var onState = null;
  var buffer = [];

  function supported() {
    return !!(navigator && navigator.bluetooth);
  }

  function state(s, msg) {
    if (typeof onState === 'function') onState(s, msg || '');
  }

  function handleNotify(event) {
    var dv = event.target.value;
    var bytes = [];
    for (var i = 0; i < dv.byteLength; i++) bytes.push(dv.getUint8(i));
    buffer.push(bytes.slice());
    if (typeof onFrame === 'function') onFrame(bytes);
  }

  async function connect(opts) {
    opts = opts || {};
    onFrame = opts.onFrame || null;
    onState = opts.onState || null;

    if (!supported()) {
      throw new Error('当前浏览器不支持 Web Bluetooth（请用 Edge/Chrome，并通过 http://127.0.0.1 打开本页）');
    }

    state('choosing', '请在弹出的窗口里选择手柄');
    var req = {
      optionalServices: [SVC, '0000ffff-0000-1000-8000-00805f9b34fb',
                         '91680001-1111-6666-8888-0123456789ab']
    };
    if (opts.wide) {
      // 通用入口：列出附近所有 BLE 设备，连上后再校验是否受支持
      req.acceptAllDevices = true;
    } else {
      // 默认入口：只显示 mingpin 系列，避免列表里一堆无关设备
      req.filters = [{ namePrefix: 'mingpin' }, { namePrefix: 'MINGPIN' }];
    }
    device = await navigator.bluetooth.requestDevice(req);

    device.addEventListener('gattserverdisconnected', function () {
      chWrite = null; chNotify = null;
      state('disconnected', '设备已断开');
    });

    state('connecting', '正在连接 ' + (device.name || ''));
    var server = await device.gatt.connect();

    var service;
    try {
      service = await server.getPrimaryService(SVC);
    } catch (e) {
      try { server.disconnect(); } catch (e2) { /* ignore */ }
      throw new Error('这个设备没有手柄配置服务（95990001），不是受支持的手柄');
    }
    chWrite = await service.getCharacteristic(CH_WRITE);
    chNotify = await service.getCharacteristic(CH_NOTIFY);

    await chNotify.startNotifications();
    chNotify.addEventListener('characteristicvaluechanged', handleNotify);

    state('connected', device.name || '已连接');
    return { name: device.name, id: device.id };
  }

  async function send(bytes) {
    if (!chWrite) throw new Error('未连接');
    var payload = new Uint8Array(bytes);
    if (chWrite.writeValueWithResponse) {
      await chWrite.writeValueWithResponse(payload);
    } else {
      await chWrite.writeValue(payload);
    }
  }

  function disconnect() {
    try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) { /* ignore */ }
    chWrite = null; chNotify = null;
    state('disconnected', '已断开');
  }

  function isConnected() {
    return !!(device && device.gatt && device.gatt.connected && chWrite);
  }

  return {
    SVC: SVC, CH_WRITE: CH_WRITE, CH_NOTIFY: CH_NOTIFY,
    supported: supported,
    connect: connect,
    send: send,
    disconnect: disconnect,
    isConnected: isConnected
  };
});
