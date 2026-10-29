/**
 * 界面逻辑（v0.1：假数据版）
 *
 * 设计约束（源自耳机项目的教训）：
 *   - 界面显示的状态必须是"设备回报过的事实"，不能是"我刚点了什么"
 *   - 任何下发都要能回显真实结果，失败不得标记成功
 *   - 未确认的值必须显式标注，不许装作已确认
 */
'use strict';

(function () {
  const F = window.GSFrame;
  const K = window.GSKeymap;
  const CMD = window.GSCommands;
  const MAP = window.GSMapping;
  const TB = window.GSTurbo;
  const BLE = window.GSBLE;

  // ---------- 手柄按键（顺序与官方映射表一致） ----------
  const BUTTONS = [
    { id: 'Y', name: 'Y', g: '面键' },
    { id: 'X', name: 'X', g: '面键' },
    { id: 'B', name: 'B', g: '面键' },
    { id: 'A', name: 'A', g: '面键' },

    { id: 'UP', name: '▲', g: '方向键' },
    { id: 'DOWN', name: '▼', g: '方向键' },
    { id: 'LEFT', name: '◀', g: '方向键' },
    { id: 'RIGHT', name: '▶', g: '方向键' },

    { id: 'LB', name: 'LB', g: '肩键与摇杆' },
    { id: 'RB', name: 'RB', g: '肩键与摇杆' },
    { id: 'LT', name: 'LT', g: '肩键与摇杆' },
    { id: 'RT', name: 'RT', g: '肩键与摇杆' },
    { id: 'L3', name: 'L3', g: '肩键与摇杆' },
    { id: 'R3', name: 'R3', g: '肩键与摇杆' },

    { id: 'MINUS', name: '−', g: '功能与背键' },
    { id: 'PLUS', name: '+', g: '功能与背键' },

    { id: 'M1', name: 'M1', g: '功能与背键' },
    { id: 'M2', name: 'M2', g: '功能与背键' },
    { id: 'M3', name: 'M3', g: '功能与背键' },
    { id: 'M4', name: 'M4', g: '功能与背键' }
  ];

  // 默认草稿：模仿官方默认布局
  const DEFAULT_DRAFT = {
    A: { type: 'button', btn: 'A' },
    B: { type: 'button', btn: 'B' },
    X: { type: 'button', btn: 'X' },
    Y: { type: 'button', btn: 'Y' },
    UP: { type: 'button', btn: 'UP' },
    DOWN: { type: 'button', btn: 'DOWN' },
    LEFT: { type: 'button', btn: 'LEFT' },
    RIGHT: { type: 'button', btn: 'RIGHT' },
    LB: { type: 'button', btn: 'LB' },
    LT: { type: 'button', btn: 'LT' },
    L3: { type: 'button', btn: 'L3' },
    RB: { type: 'button', btn: 'RB' },
    RT: { type: 'button', btn: 'RT' },
    R3: { type: 'button', btn: 'R3' },
    MINUS: { type: 'button', btn: 'MINUS' },
    PLUS: { type: 'button', btn: 'PLUS' },
    M1: { type: 'none' },
    M2: { type: 'none' },
    M3: { type: 'none' },
    M4: { type: 'none' }
  };

  // 映射目标有两种：键盘/功能键（type=key）或手柄自身按键（type=button）
  function normTarget(m) {
    if (!m) return null;
    if (m.type === 'button') return { type: 'button', btn: m.btn };
    return { type: 'key', key: m.key, mods: m.mods || [] };
  }
  Object.keys(DEFAULT_DRAFT).forEach(function (k) { DEFAULT_DRAFT[k] = normTarget(DEFAULT_DRAFT[k]); });

  // 可作为映射目标的手柄按键（不含 M1–M4 自身，避免自指）
  const TARGET_BUTTONS = [
    { id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'X', name: 'X' }, { id: 'Y', name: 'Y' },
    { id: 'UP', name: '▲' }, { id: 'DOWN', name: '▼' },
    { id: 'LEFT', name: '◀' }, { id: 'RIGHT', name: '▶' },
    { id: 'LB', name: 'LB' }, { id: 'LT', name: 'LT' }, { id: 'L3', name: 'L3' },
    { id: 'RB', name: 'RB' }, { id: 'RT', name: 'RT' }, { id: 'R3', name: 'R3' },
    { id: 'MINUS', name: '−' }, { id: 'PLUS', name: '+' }
  ];

  // 把 23 字节映射数组还原成界面草稿格式
  function draftFromMappingArray(arr) {
    const out = {};
    ORG_BUTTONS.forEach((id) => {
      const org = MAP.ORG_ORDER.indexOf(id);
      const targetId = (org >= 0 && arr) ? arr[org] : 0;
      if (targetId === MAP.UNMAPPED) { out[id] = { type: 'none' }; return; }
      const target = MAP.idToButton(targetId) || id;
      out[id] = { type: 'button', btn: target };
    });
    return out;
  }

  function describeTarget(m) {
    if (!m || m.type === 'none') return '空';
    if (m.type === 'button') {
      const b = TARGET_BUTTONS.find(function (x) { return x.id === m.btn; });
      return b ? b.name : m.btn;
    }
    const d = K.describe(m.key);
    const mods = K.maskToNames(K.modifierMask(m.mods || []));
    return (d ? d.name : '—') + (mods.length ? ' +' + mods.join('+') : '');
  }

  const ORG_BUTTONS = BUTTONS.map(function (b) { return b.id; });

  const state = {
    connected: false,
    busy: false,
    draft: JSON.parse(JSON.stringify(DEFAULT_DRAFT)),
    turbo: {},          // { 按键id: {mode, cycle} }
    baseline: JSON.parse(JSON.stringify(DEFAULT_DRAFT)),
    selected: null,          // 选中的手柄按键 id
    editing: null,           // 编辑中的 {key, mods}
    device: null
  };

  const $ = (id) => document.getElementById(id);

  // ---------- 日志 ----------
  function log(msg, cls) {
    const el = $('log');
    const t = new Date().toTimeString().slice(0, 8);
    const span = document.createElement('div');
    span.className = cls || '';
    span.innerHTML = `<span class="t">${t}</span> ${msg}`;
    el.appendChild(span);
    el.scrollTop = el.scrollHeight;
  }

  function logFrame(dir, bytes) {
    const cls = dir === 'TX' ? 'tx' : 'rx';
    log(`<span class="${cls}">${dir}</span> ${F.toHex(bytes)}`);
  }

  // ---------- 连接（假数据） ----------
  function setConn(ok, text, dotClass) {
    state.connected = ok;
    $('connText').textContent = text;
    const dot = $('connDot');
    dot.className = 'dot' + (dotClass ? ' ' + dotClass : '');
    $('btnConnect').disabled = ok;
    $('btnDisconnect').disabled = !ok;
    $('btnSave').disabled = !ok || !hasChanges();
  }

  async function connect() {
    setConn(false, '连接中…', 'busy');
    try {
      const info = await BLE.connect({ onFrame: handleFrame, onState: onBleState });
      state.connected = true;
      setConn(true, '已连接 · ' + (info.name || ''));
      log('已连接 ' + (info.name || ''));
      loadDefaultMapping(true);
      log('已载入默认映射，改完点「保存到设备」写入');

      // 连上先读设备信息与能力包（真机验证过的两条查询）
      await BLE.send([0x10, 0x03, 0x03]);
      await BLE.send([0x10, 0x03, 0x02]);
    } catch (e) {
      setConn(false, '连接失败');
      log('连接失败：' + (e.message || e), 'er');
    }
  }

  function onBleState(s, msg) {
    if (s === 'disconnected') {
      state.connected = false;
      setConn(false, '未连接');
      log(msg || '设备已断开', 'er');
    } else if (msg) {
      log(msg);
    }
  }

  function disconnect() {
    BLE.disconnect();
    state.device = null;
    setConn(false, '未连接');
    renderDevice();
    log('已断开');
  }

  function handleFrame(bytes) {
    const f = F.parse(bytes);
    logFrame('RX', bytes);
    if (f.warnings.length) log('　⚠ ' + f.warnings.join('；'), 'er');

    if (f.cmd === 0x03) {
      const p = f.payload;
      if (p.length < 12) return;
      const vid = p[0] | (p[1] << 8);
      const pid = p[2] | (p[3] << 8);
      const name = String.fromCharCode.apply(null, p.slice(4, 8));
      const fwRaw = String.fromCharCode.apply(null, p.slice(8, 11));
      const fw = fwRaw ? fwRaw[0] + '.' + fwRaw.slice(1) : '—';
      state.device = Object.assign(state.device || {}, {
        model: name, project: name, vid: vid, pid: pid,
        fw: fw, modelCode: p[11], makeup: p[12]
      });
      renderDevice();
      return;
    }

    if (f.cmd === 0x02) {
      const p = f.payload;
      state.device = Object.assign(state.device || {}, {
        type: p[0], mapVersion: p[1], grip: p[2]
      });
      renderDevice();
      log('能力包：deviceType=' + p[0] + '　mapVersion=' + p[1]);
      return;
    }

    if (f.cmd === 0x37) {
      log('映射写入已确认（设备 ACK）', 'rx');
      return;
    }
  }

  function showToastDone() {
    // 真实模式下这里要等设备回帧再更新，目前仅提示
  }

  function loadDefaultMapping(silent) {
    const arr = MAP.defaultMapping();
    state.draft = draftFromMappingArray(arr);
    state.turbo = {};
    state.baseline = JSON.parse(JSON.stringify(state.draft));
    state.selected = null;
    renderList();
    renderEditor();
    updateSaveBtn();
    if (!silent) log('已载入默认映射（20 个按键）');
  }

  // ---------- 渲染：设备信息 ----------
  function renderDevice() {
    const d = state.device;
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    if (!d) {
      ['dvModel', 'dvProject', 'dvVidPid', 'dvFw', 'dvType', 'dvBatt'].forEach((id) => set(id, '—'));
      set('devName', '未连接设备');
      return;
    }
    set('dvModel', d.model || '—');
    set('dvProject', d.project || '—');
    set('dvVidPid', (d.vid != null && d.pid != null)
      ? `${d.vid.toString(16).toUpperCase()} / ${d.pid.toString(16).toUpperCase()}` : '—');
    set('dvFw', d.fw || '—');
    set('dvType', d.mapVersion != null ? `${d.type} · v${d.mapVersion}` : (d.type != null ? d.type : '—'));
    set('dvBatt', d.batt != null ? d.batt + '%' : '—');
    set('devName', d.name || '已连接');
  }

  // ---------- 渲染：按键 ----------
  function renderList() {
    const box = $('btnList');
    box.innerHTML = '';

    const groups = [];
    BUTTONS.forEach((b) => {
      const g = b.g || '其他';
      if (!groups.includes(g)) groups.push(g);
    });

    groups.forEach((g) => {
      const sec = document.createElement('div');
      sec.className = 'group';

      const title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = g;
      sec.appendChild(title);

      const items = BUTTONS.filter((b) => (b.g || '其他') === g);
      const grid = document.createElement('div');
      grid.className = 'chips';

      items.forEach((b) => {
        const m = state.draft[b.id];
        const target = describeTarget(m);
        const diff = !!(m && m.type === 'button' && m.btn !== b.id);   // 空与自映射都不算改动
        const el = document.createElement('button');
        const isEmpty = !!(m && m.type === 'none');
        el.className = 'chip' + (state.selected === b.id ? ' sel' : '') + (diff ? ' diff' : '') + (isEmpty ? ' empty' : '');
        const tm = state.turbo[b.id];
        const badge = (tm && tm.mode) ? '<span class="ct">连</span>' : '';
        el.innerHTML =
          `<span class="cn">${b.name}${badge}</span>` +
          `<span class="ck">${target}</span>`;
        el.onclick = () => select(b.id);
        grid.appendChild(el);
      });

      sec.appendChild(grid);
      box.appendChild(sec);
    });

    $('mapCount').textContent = BUTTONS.length + ' 个按键';
    syncPad();
  }

  function syncPad() {
    document.querySelectorAll('.hot[data-btn]').forEach((z) => {
      const id = z.getAttribute('data-btn');
      z.classList.toggle('sel', id === state.selected);
    });
  }

  function select(id) {
    state.selected = id;
    state.editing = JSON.parse(JSON.stringify(state.draft[id]));
    renderList();
    renderEditor();
  }

  // ---------- 渲染：编辑面板 ----------
  function fillKeyOptions(sel) {
    sel.innerHTML = '';
    const g = document.createElement('optgroup');
    g.label = '手柄按键（本机唯一支持的映射目标）';
    TARGET_BUTTONS.forEach((b) => {
      const o = document.createElement('option');
      o.value = 'btn:' + b.id;
      o.textContent = b.name;
      g.appendChild(o);
    });
    const o = document.createElement('option');
    o.value = 'none';
    o.textContent = '空（不映射）';
    g.appendChild(o);

    sel.appendChild(g);
  }

  function renderEditor() {
    if (!state.selected) {
      $('editEmpty').style.display = '';
      $('editBody').style.display = 'none';
      return;
    }
    $('editEmpty').style.display = 'none';
    $('editBody').style.display = '';

    const b = BUTTONS.find((x) => x.id === state.selected);
    $('edBtn').textContent = b ? b.name : state.selected;
    renderTurbo();
    renderPreview();

    const sel = $('edKey');
    if (!sel.options.length) fillKeyOptions(sel);
    sel.value = (state.editing.type === 'none')
      ? 'none'
      : (state.editing.type === 'button' ? 'btn:' + state.editing.btn : 'key:' + state.editing.key);

    const modField = $('modField');
    if (modField) modField.style.display = 'none';

    renderTurbo();
    renderPreview();
  }

  function renderPreview() {
    const el = $('edTarget');
    if (el) el.textContent = describeTarget(state.editing);
  }

  function renderTurbo() {
    if (!state.selected) return;
    const t = state.turbo[state.selected] || { mode: 0, cycle: 5 };
    document.querySelectorAll('#turboSeg button').forEach((btn) => {
      btn.classList.toggle('on', Number(btn.dataset.mode) === t.mode);
    });
    $('tbModeName').textContent = TB.modeName(t.mode);
    $('turboFreqField').style.display = t.mode ? '' : 'none';
    $('tbCycleVal').textContent = t.cycle;
    $('turboFreq').value = t.cycle;
  }

  function setTurboMode(mode) {
    if (!state.selected) return;
    const cur = state.turbo[state.selected] || { mode: 0, cycle: 5 };
    cur.mode = mode;
    state.turbo[state.selected] = cur;
    renderTurbo();
    renderList();
    updateSaveBtn();
  }

  function setTurboCycle(v) {
    if (!state.selected) return;
    const cur = state.turbo[state.selected] || { mode: 0, cycle: 5 };
    cur.cycle = Number(v);
    state.turbo[state.selected] = cur;
    $('tbCycleVal').textContent = cur.cycle;
    updateSaveBtn();
  }

  // ---------- 操作 ----------
  function applyDraft() {
    if (!state.selected) return;
    state.draft[state.selected] = JSON.parse(JSON.stringify(state.editing));
    log(`草稿更新：${state.selected} → ${describeTarget(state.editing)}`);
    renderList();
    renderEditor();
    updateSaveBtn();
  }

  function resetEdit() {
    if (!state.selected) return;
    state.editing = JSON.parse(JSON.stringify(state.baseline[state.selected]));
    renderEditor();
  }

  function hasChanges() {
    return JSON.stringify(state.draft) !== JSON.stringify(state.baseline);
  }

  function updateSaveBtn() {
    $('btnSave').disabled = !state.connected || !hasChanges();
  }

  async function saveToDevice() {
    if (!BLE.isConnected()) { log('未连接，无法写入', 'er'); return; }

    const pairs = {};
    BUTTONS.forEach((b) => {
      const m = state.draft[b.id];
      if (!m) return;
      if (m.type === 'none') pairs[b.id] = null;
      else if (m.type === 'button' && m.btn !== b.id) pairs[b.id] = m.btn;
    });

    let frame;
    try {
      frame = MAP.buildWriteFrame(MAP.mappingFromPairs(pairs));
    } catch (e) {
      log('组帧失败：' + e.message, 'er');
      return;
    }

    log('写入映射：' + (MAP.describe(MAP.mappingFromPairs(pairs)).join('，') || '默认'));
    logFrame('TX', frame);
    try {
      await BLE.send(frame);

      // 连击：按 orgId 组 46 字节数组
      const turboMap = {};
      Object.keys(state.turbo).forEach((id) => {
        const org = MAP.ORG_ORDER.indexOf(id);
        if (org >= 0) turboMap[org] = state.turbo[id];
      });
      const turboFrame = TB.buildFrame(TB.fromMap(turboMap));
      logFrame('TX', turboFrame);
      await BLE.send(turboFrame);

      state.baseline = JSON.parse(JSON.stringify(state.draft));
      updateSaveBtn();
      log('已下发。设备不回读，请到官方 App 里核对结果。', 'rx');
    } catch (e) {
      log('写入失败：' + (e.message || e), 'er');
    }
  }

  // ---------- 预设导入导出 ----------
  function exportJson() {
    const data = {
      schema: 'gamepad-space-preset/v1',
      createdAt: new Date().toISOString(),
      device: state.device ? { model: state.device.model, project: state.device.project } : null,
      mapping: state.draft
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `手柄预设-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    log('已导出预设 JSON', '');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.schema !== 'gamepad-space-preset/v1') throw new Error('schema 不匹配');
        const missing = BUTTONS.filter((b) => !data.mapping || !data.mapping[b.id]);
        if (missing.length) throw new Error('缺少按键：' + missing.map((b) => b.name).join(','));
        const imported = {};
        BUTTONS.forEach((b) => { imported[b.id] = normTarget(data.mapping[b.id]); });
        state.draft = imported;
        renderList();
        if (state.selected) select(state.selected);
        updateSaveBtn();
        log('预设导入成功，请确认后保存到设备', 'rx');
      } catch (e) {
        log('导入失败：' + e.message, 'er');
      }
    };
    reader.readAsText(file);
  }

  // ---------- 滑块 ----------
  function syncSliderLabels() { /* 参数区暂未接入协议，等死区写入验证后再启用 */ }

  // ---------- 绑定 ----------
  function bind() {
    $('btnConnect').onclick = connect;
    $('btnDisconnect').onclick = disconnect;
    $('btnApply').onclick = applyDraft;
    document.querySelectorAll('#turboSeg button').forEach((btn) => {
      btn.onclick = () => setTurboMode(Number(btn.dataset.mode));
    });
    $('turboFreq').oninput = (e) => setTurboCycle(e.target.value);

    $('btnResetAll').onclick = () => { loadDefaultMapping(); log('已重置为默认映射'); };
    $('btnReset').onclick = resetEdit;
    $('btnSave').onclick = saveToDevice;
    $('btnExport').onclick = exportJson;
    $('btnImport').onclick = () => $('fileInput').click();
    $('fileInput').onchange = (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    };
    $('btnClearLog').onclick = () => { $('log').innerHTML = ''; };
    $('edKey').onchange = (e) => {
      const v = e.target.value;
      if (v === 'none') state.editing = { type: 'none' };
      else if (v.startsWith('btn:')) state.editing = { type: 'button', btn: v.slice(4) };
      else state.editing = { type: 'key', key: v.slice(4), mods: state.editing.mods || [] };
      renderEditor();
    };

    document.querySelectorAll('.hot[data-btn]').forEach((z) => {
      z.addEventListener('click', () => select(z.getAttribute('data-btn')));
    });
  }

  // ---------- 启动 ----------
  function init() {
    bind();
    syncSliderLabels();
    loadDefaultMapping(true);
    renderDevice();
    renderEditor();
    // 调试用：?sel=M1 可直接选中某个按键，方便验证渲染
    const qp = new URLSearchParams(location.search);
    if (qp.get('sel')) select(qp.get('sel').toUpperCase());

    log('界面就绪（假数据模式）');
    log(`协议模块加载：帧 ${CMD.COMMANDS.length} 条命令 · 键码 ${Object.keys(K.KEYBOARD_KEYS).length} 个 · 扩展键 ${K.SPECIAL_KEYS.length} 个`);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
