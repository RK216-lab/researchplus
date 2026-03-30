// app.js

const fileInput = document.getElementById('fileInput');
const dropArea = document.getElementById('dropArea');
const datasetsList = document.getElementById('datasetsList');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// Config elements
const xAxisInterval = document.getElementById('xAxisInterval');
const yAxisLabel = document.getElementById('yAxisLabel');
const globalTitle = document.getElementById('globalTitle');
const useNorm = document.getElementById('useNorm');
const useMA = document.getElementById('useMA');
const maWindow = document.getElementById('maWindow');
const maValue = document.getElementById('maValue');
const useLogY = document.getElementById('useLogY');
const showPoints = document.getElementById('showPoints');
const startSecInput = document.getElementById('startSec');
const endSecInput = document.getElementById('endSec');

const analysisStart = document.getElementById('analysisStart');
const analysisEnd = document.getElementById('analysisEnd');
const useShapes = document.getElementById('useShapes');
const shapeInterval = document.getElementById('shapeInterval');
const shapeIntervalValue = document.getElementById('shapeIntervalValue');

const editModal = document.getElementById('editModal');
const closeModal = document.getElementById('closeModal');
const saveModal = document.getElementById('saveModal');
const modalTrimStart = document.getElementById('modalTrimStart');
const modalTrimEnd = document.getElementById('modalTrimEnd');
const modalAlignZero = document.getElementById('modalAlignZero');
const modalTitle = document.getElementById('modalTitle');
const modalCtx = document.getElementById('modalChart').getContext('2d');

const downloadPNG = document.getElementById('downloadPNG');
const exportCSV = document.getElementById('exportCSV');

const analysisTableBody = document.getElementById('analysisTableBody');

let datasetsData = [];
let chartInstance = null;
let modalChartInstance = null;
let currentEditingDatasetId = null;
const ctx = document.getElementById('chart').getContext('2d');
const colorPalette = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];
const pointShapes = ['circle', 'triangle', 'rect', 'rectRot', 'star', 'crossRot', 'rectRounded', 'dash', 'line'];

// Tab Switching Logic
function switchTab(targetId) {
  navItems.forEach(n => n.classList.remove('active'));
  tabPanes.forEach(p => p.classList.remove('active'));

  document.querySelector(`.nav-item[data-target="${targetId}"]`).classList.add('active');
  document.getElementById(targetId).classList.add('active');

  // If switching to chart, render it
  if (targetId === 'tab-chart') {
    drawChart();
  }
}

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab(item.dataset.target);
  });
});

// UI Event Listeners
useMA.addEventListener('change', (e) => document.getElementById('maSettings').classList.toggle('hidden', !e.target.checked));
maWindow.addEventListener('input', (e) => maValue.textContent = e.target.value);
useShapes.addEventListener('change', (e) => document.getElementById('shapeSettings').classList.toggle('hidden', !e.target.checked));
shapeInterval.addEventListener('input', (e) => shapeIntervalValue.textContent = e.target.value);

closeModal.addEventListener('click', () => editModal.close());
saveModal.addEventListener('click', saveModalData);

editModal.addEventListener('click', (e) => {
  if (e.target === editModal) editModal.close();
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('dragover')));
['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('dragover')));

dropArea.addEventListener('drop', e => processFiles(e.dataTransfer.files));
fileInput.addEventListener('change', e => { processFiles(e.target.files); e.target.value = ''; });

const addPastedData = document.getElementById('addPastedData');
const pasteInput = document.getElementById('pasteInput');

// File Processing
function processFiles(files) {
  if (!files.length) return;
  const fileArray = Array.from(files).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ext === 'csv' || ext === 'txt';
  });

  let processedCount = 0;
  fileArray.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      parseAndAddDataset(file.name, content);
      processedCount++;
      if (processedCount === fileArray.length) {
        finishProcessing();
      }
    };
    reader.readAsText(file);
  });
}

// Paste Processing
addPastedData.addEventListener('click', () => {
  const content = pasteInput.value.trim();
  if (!content) return;

  parseAndAddDataset("Pasted Data", content);
  pasteInput.value = '';
  finishProcessing();
});

function parseAndAddDataset(defaultName, rawData) {
  let lines = rawData.split(/\r?\n/).filter(l => l.trim() !== '');
  let legend = defaultName.replace(/\.(csv|txt)$/i, '');
  let csvContent = rawData;

  // For pasted text, Check if first line is a title
  if (defaultName === "Pasted Data" && lines.length > 1) {
    const firstLine = lines[0];
    const hasDelimiter = /[,\t;|]/.test(firstLine);
    const hasNumbers = /\d/.test(firstLine);
    const hasLetters = /[a-zA-Z\u3040-\u30ff\u4e00-\u9faf]/.test(firstLine);

    if (!hasDelimiter && (hasLetters || !hasNumbers)) {
      legend = firstLine.trim();
      csvContent = lines.slice(1).join('\n');
    }
  }

  Papa.parse(csvContent, {
    header: false, skipEmptyLines: true,
    complete: (results) => {
      const rows = results.data;
      if (rows.length < 2) return;

      let headerIdx = 0;
      const keywords = ['time', 'index', '秒', 'temp', '温度', 'value', 'val'];
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        if (rows[i].some(c => keywords.some(k => ('' + c).toLowerCase().includes(k)))) {
          headerIdx = i; break;
        }
      }
      const header = rows[headerIdx].map(c => ('' + c).trim() || 'Col');
      const data = rows.slice(headerIdx + 1).map(r => {
        const o = {}; header.forEach((h, i) => o[h] = r[i]); return o;
      });

      const low = header.map(f => f.toLowerCase());
      let xIdx = low.findIndex(f => /index|ｲﾝﾃﾞｯｸｽ/.test(f));
      if (xIdx === -1) xIdx = Math.max(0, low.findIndex(f => /time|秒|sec/.test(f)));
      let yIdx = Math.max(0, low.findIndex(f => /temp|温度|℃|val|ch/.test(f)));
      if (xIdx === yIdx && header.length > 1) yIdx = xIdx === 0 ? 1 : 0;

      const dsId = 'ds_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      datasetsData.push({
        id: dsId, filename: defaultName, legend: legend,
        color: colorPalette[datasetsData.length % colorPalette.length],
        pointShape: pointShapes[datasetsData.length % pointShapes.length],
        trimStart: null, trimEnd: null, alignZero: true,
        theoreticalValue: '', enthalpyStart: '', enthalpyEnd: '',
        header: header, data: data, xCol: header[xIdx], yCol: header[yIdx]
      });

      if (datasetsData.length === 1 && !globalTitle.value) {
        globalTitle.value = "Experiment Analysis " + new Date().toISOString().split('T')[0];
      }
    }
  });
}

function finishProcessing() {
  autoSetTimeRange();
  renderDatasetsList();
  renderAnalysisTable();
}

function autoSetTimeRange() {
  if (!datasetsData.length) return;
  let minT = Infinity, maxT = -Infinity;
  datasetsData.forEach(ds => {
    ds.data.forEach(row => {
      const val = parseFloat(row[ds.xCol]);
      if (!isNaN(val)) {
        if (val < minT) minT = val;
        if (val > maxT) maxT = val;
      }
    });
  });
  if (minT !== Infinity && startSecInput.value === '') startSecInput.value = minT;
  if (maxT !== -Infinity && endSecInput.value === '') endSecInput.value = maxT;
}

function getDatasetPoints(ds) {
  let pts = [];
  let baseTrimStart = ds.trimStart !== null ? ds.trimStart : -Infinity;
  let baseTrimEnd = ds.trimEnd !== null ? ds.trimEnd : Infinity;
  
  let validData = [];
  ds.data.forEach(r => {
    let t = parseFloat(r[ds.xCol]);
    let v = parseFloat(r[ds.yCol]);
    if (!isNaN(t) && !isNaN(v)) {
      if (t >= baseTrimStart && t <= baseTrimEnd) {
        validData.push({ t, v });
      }
    }
  });

  validData.sort((a,b) => a.t - b.t);

  let t0 = 0;
  if (ds.alignZero && validData.length > 0) {
    t0 = baseTrimStart !== -Infinity ? baseTrimStart : validData[0].t;
  }
  
  validData.forEach(d => {
    pts.push({ x: d.t - t0, y: d.v }); 
  });

  return pts;
}

function renderDatasetsList() {
  if (!datasetsData.length) {
    datasetsList.innerHTML = '<div style="padding: 32px; text-align:center; color:#94a3b8;">データがありません。上のエリアにドロップしてください。</div>';
    exportCSV.disabled = true;
    return;
  }

  exportCSV.disabled = false;
  datasetsList.innerHTML = '';
  datasetsData.forEach((ds, dsIndex) => {
    const card = document.createElement('div');
    card.className = 'dataset-card';
    card.style.setProperty('--ds-color', ds.color);

    const basePts = getDatasetPoints(ds);
    const aStart = parseFloat(analysisStart.value);
    const aEnd = parseFloat(analysisEnd.value);
    
    let statsMin = Infinity, statsMax = -Infinity, sum = 0, count = 0, area = 0;
    
    let ptsInRange = [];
    basePts.forEach(pt => {
      let tMin = pt.x / 60; // Convert to minutes for analysis range
      let inRange = true;
      if (!isNaN(aStart) && tMin < aStart) inRange = false;
      if (!isNaN(aEnd) && tMin > aEnd) inRange = false;
      if (inRange) ptsInRange.push(pt);
    });

    ptsInRange.forEach((pt, i) => {
      if (pt.y < statsMin) statsMin = pt.y;
      if (pt.y > statsMax) statsMax = pt.y;
      sum += pt.y;
      count++;
      
      if (i > 0) {
        let prev = ptsInRange[i-1];
        let dx = pt.x - prev.x; // seconds
        area += ((pt.y + prev.y) / 2) * dx;
      }
    });

    let stats = count > 0 ? { min: statsMin, max: statsMax, avg: sum/count, area: area } : { min: 0, max: 0, avg: 0, area: 0 };

    let xOpts = ds.header.map(h => `<option value="${h}" ${h === ds.xCol ? 'selected' : ''}>${h}</option>`).join('');
    let yOpts = ds.header.map(h => `<option value="${h}" ${h === ds.yCol ? 'selected' : ''}>${h}</option>`).join('');

    card.innerHTML = `
      <div class="dataset-header">
        <h4 class="dataset-title">${ds.filename}</h4>
        <div class="card-actions">
          ${dsIndex > 0 ? `<button class="btn-icon btn-up" data-id="${ds.id}">↑</button>` : `<div style="width:26px"></div>`}
          ${dsIndex < datasetsData.length - 1 ? `<button class="btn-icon btn-down" data-id="${ds.id}">↓</button>` : `<div style="width:26px"></div>`}
          <button class="btn-icon btn-edit" data-id="${ds.id}">✂️ クリップ</button>
          <button class="btn-remove" data-id="${ds.id}">&times;</button>
        </div>
      </div>
      <div class="stats-grid" title="現在の「解析範囲」に基づいて算出">
        <div class="stat-item">ΔT(Max-Min) <span>${(stats.max - stats.min).toFixed(2)}</span></div>
        <div class="stat-item">面積(Area) <span>${stats.area.toFixed(2)}</span></div>
        <div class="stat-item">Min <span>${stats.min.toFixed(2)}</span></div>
        <div class="stat-item">Max <span>${stats.max.toFixed(2)}</span></div>
      </div>
      <div class="ds-settings">
        <div class="input-group" style="margin:0;">
          <label style="font-size:11px;">凡例名</label>
          <input type="text" value="${ds.legend}" class="inp-legend" data-id="${ds.id}" style="padding:8px 10px; font-size:13px;">
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="input-group" style="margin:0;">
            <label style="font-size:11px;">X軸 (時間列)</label>
            <select class="inp-xcol" data-id="${ds.id}" style="padding:8px 10px; font-size:13px;">${xOpts}</select>
          </div>
          <div class="input-group" style="margin:0;">
            <label style="font-size:11px;">Y軸 (データ列)</label>
            <select class="inp-ycol" data-id="${ds.id}" style="padding:8px 10px; font-size:13px;">${yOpts}</select>
          </div>
        </div>
        <div class="input-group" style="margin:0;">
          <label style="font-size:11px;">プロット色</label>
          <input type="color" value="${ds.color}" class="inp-color" data-id="${ds.id}" style="padding:0; height:34px;">
        </div>
      </div>
    `;
    datasetsList.appendChild(card);
  });

  document.querySelectorAll('.btn-up').forEach(btn => btn.addEventListener('click', e => {
    const idx = datasetsData.findIndex(d => d.id === e.target.dataset.id);
    if (idx > 0) {
      [datasetsData[idx - 1], datasetsData[idx]] = [datasetsData[idx], datasetsData[idx - 1]];
      renderDatasetsList();
      if (document.getElementById('tab-chart').classList.contains('active')) drawChart();
    }
  }));
  document.querySelectorAll('.btn-down').forEach(btn => btn.addEventListener('click', e => {
    const idx = datasetsData.findIndex(d => d.id === e.target.dataset.id);
    if (idx < datasetsData.length - 1) {
      [datasetsData[idx], datasetsData[idx + 1]] = [datasetsData[idx + 1], datasetsData[idx]];
      renderDatasetsList();
      if (document.getElementById('tab-chart').classList.contains('active')) drawChart();
    }
  }));
  document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', e => {
    openEditModal(e.target.dataset.id);
  }));
  document.querySelectorAll('.btn-remove').forEach(btn => btn.addEventListener('click', e => {
    datasetsData = datasetsData.filter(d => d.id !== e.target.dataset.id);
    renderDatasetsList();
    if (document.getElementById('tab-chart').classList.contains('active')) drawChart(); // update live
  }));
  document.querySelectorAll('.inp-legend').forEach(el => el.addEventListener('input', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).legend = e.target.value;
    renderAnalysisTable();
  }));
  document.querySelectorAll('.inp-color').forEach(el => el.addEventListener('input', e => {
    const ds = datasetsData.find(d => d.id === e.target.dataset.id);
    ds.color = e.target.value;
    e.target.closest('.dataset-card').style.setProperty('--ds-color', e.target.value);
    renderAnalysisTable();
  }));
  document.querySelectorAll('.inp-xcol').forEach(el => el.addEventListener('change', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).xCol = e.target.value;
  }));
  document.querySelectorAll('.inp-ycol').forEach(el => el.addEventListener('change', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).yCol = e.target.value;
    renderDatasetsList(); // recalc stats
  }));
}

function getPeakDeltaT(basePts, aS, aE) {
  let sMin = Infinity, sMax = -Infinity, count = 0;
  let tStartVal = null;
  basePts.forEach(pt => {
    let tMin = pt.x / 60;
    let inR = true;
    if (!isNaN(aS) && tMin < aS) inR = false;
    if (!isNaN(aE) && tMin > aE) inR = false;
    if (inR) {
      if (tStartVal === null) tStartVal = pt.y;
      if (pt.y < sMin) sMin = pt.y;
      if (pt.y > sMax) sMax = pt.y;
      count++;
    }
  });
  if (count === 0) return 0;
  let maxDiff = Math.abs(sMax - tStartVal);
  let minDiff = Math.abs(sMin - tStartVal);
  let magnitude = sMax - sMin;
  // If min is further from baseline start than max, it's a valley (endothermic) -> negative
  return minDiff > maxDiff ? -magnitude : magnitude;
}

function renderAnalysisTable() {
  if (!analysisTableBody) return;
  if (!datasetsData.length) {
    analysisTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:#94a3b8;">データがありません</td></tr>';
    return;
  }
  
  const gStart = parseFloat(analysisStart.value);
  const gEnd = parseFloat(analysisEnd.value);
  
  analysisTableBody.innerHTML = '';
  datasetsData.forEach(ds => {
    const fromVal = ds.enthalpyStart !== '' ? ds.enthalpyStart : (isNaN(gStart) ? '' : gStart);
    const toVal = ds.enthalpyEnd !== '' ? ds.enthalpyEnd : (isNaN(gEnd) ? '' : gEnd);
    
    // calculate stats for this specific range
    const basePts = getDatasetPoints(ds);
    let aS = fromVal !== '' ? parseFloat(fromVal) : NaN;
    let aE = toVal !== '' ? parseFloat(toVal) : NaN;
    
    let deltaT = getPeakDeltaT(basePts, aS, aE);
    
    let eff = '-';
    let theo = parseFloat(ds.theoreticalValue);
    if (!isNaN(theo) && theo !== 0) {
      eff = ((Math.abs(deltaT) / Math.abs(theo)) * 100).toFixed(1) + '%';
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${ds.color}; flex-shrink:0; margin-top:3px;"></span>
          <span style="font-weight:600; word-break:break-all; line-height:1.4;">${ds.legend}</span>
        </div>
      </td>
      <td class="col-range" style="white-space:nowrap; width:1%;">
        <div class="range-inputs">
          <input type="number" step="any" class="tbl-inp-start" data-id="${ds.id}" value="${ds.enthalpyStart}" placeholder="${isNaN(gStart)?'Auto':gStart}">
          <span>-</span>
          <input type="number" step="any" class="tbl-inp-end" data-id="${ds.id}" value="${ds.enthalpyEnd}" placeholder="${isNaN(gEnd)?'Auto':gEnd}">
        </div>
      </td>
      <td style="font-weight:600; white-space:nowrap; width:1%;">${deltaT.toFixed(2)}</td>
      <td style="white-space:nowrap; width:1%;"><input type="number" step="any" class="tbl-inp-theo" data-id="${ds.id}" value="${ds.theoreticalValue}" placeholder="例: -100.5"></td>
      <td style="font-weight:700; color:var(--primary); white-space:nowrap; width:1%;">${eff}</td>
    `;
    analysisTableBody.appendChild(tr);
  });
  
  document.querySelectorAll('.tbl-inp-start').forEach(el => el.addEventListener('change', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).enthalpyStart = e.target.value;
    renderAnalysisTable();
  }));
  document.querySelectorAll('.tbl-inp-end').forEach(el => el.addEventListener('change', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).enthalpyEnd = e.target.value;
    renderAnalysisTable();
  }));
  document.querySelectorAll('.tbl-inp-theo').forEach(el => el.addEventListener('input', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).theoreticalValue = e.target.value;
    renderAnalysisTable();
  }));
}

function openEditModal(dsId) {
  currentEditingDatasetId = dsId;
  const ds = datasetsData.find(d => d.id === dsId);
  if (!ds) return;
  
  modalTitle.textContent = ds.filename + ' - データクリッピング';
  modalTrimStart.value = ds.trimStart !== null ? ds.trimStart : '';
  modalTrimEnd.value = ds.trimEnd !== null ? ds.trimEnd : '';
  modalAlignZero.checked = ds.alignZero;
  
  editModal.showModal();
  drawModalChart(ds);
}

function saveModalData() {
  const ds = datasetsData.find(d => d.id === currentEditingDatasetId);
  if (ds) {
    ds.trimStart = modalTrimStart.value !== '' ? parseFloat(modalTrimStart.value) : null;
    ds.trimEnd = modalTrimEnd.value !== '' ? parseFloat(modalTrimEnd.value) : null;
    ds.alignZero = modalAlignZero.checked;
    
    renderDatasetsList();
    if (document.getElementById('tab-chart').classList.contains('active')) drawChart();
  }
  editModal.close();
}

function drawModalChart(ds) {
  if (modalChartInstance) modalChartInstance.destroy();
  let pts = [];
  ds.data.forEach(r => {
    let t = parseFloat(r[ds.xCol]);
    let v = parseFloat(r[ds.yCol]);
    if (!isNaN(t) && !isNaN(v)) { pts.push({ x: t, y: v }); }
  });
  pts.sort((a,b) => a.x - b.x);
  
  modalChartInstance = new Chart(modalCtx, {
    type: 'line',
    data: { datasets: [{ label: ds.legend, data: pts, borderColor: ds.color, borderWidth: 2, pointRadius: 0, tension: 0.1 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { type: 'linear', title: { display: true, text: '元の時間 (秒)' } } },
      plugins: { legend: { display: false }, zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } } }
    }
  });
}

function movingAverage(data, windowSize) {
  if (windowSize <= 1) return data;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      sum += data[j].y; count++;
    }
    result.push({ x: data[i].x, y: sum / count });
  }
  return result;
}

function normalize(data) {
  let min = Infinity, max = -Infinity;
  data.forEach(d => { if (d.y < min) min = d.y; if (d.y > max) max = d.y; });
  const range = max - min;
  if (range === 0) return data.map(d => ({ x: d.x, y: 0.5 }));
  return data.map(d => ({ x: d.x, y: (d.y - min) / range }));
}

function drawChart() {
  if (!datasetsData.length) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    downloadPNG.disabled = true;
    exportCSV.disabled = true;
    return;
  }

  const startTime = parseFloat(startSecInput.value) || 0;
  const endTime = parseFloat(endSecInput.value) || Infinity;
  const doMA = useMA.checked;
  const maWin = parseInt(maWindow.value, 10);
  const doNorm = useNorm.checked;

  const doShapes = useShapes.checked;
  const sInterval = parseInt(shapeInterval.value, 10) || 5;

  const chartDatasets = datasetsData.map(ds => {
    let basePts = getDatasetPoints(ds);
    let pts = basePts.filter(d => d.x >= startTime && d.x <= endTime);

    if (doMA) pts = movingAverage(pts, maWin);
    if (doNorm) pts = normalize(pts);

    // seconds to minutes
    pts = pts.map(d => ({ x: d.x / 60, y: d.y }));

    if (doShapes) {
      let intervalTarget = 0;
      pts.forEach(pt => {
        pt.isShape = false;
        if (pt.x >= intervalTarget) {
          pt.isShape = true;
          intervalTarget += sInterval;
        }
      });
    }

    return {
      label: ds.legend,
      data: pts,
      borderColor: ds.color,
      backgroundColor: ds.color,
      borderWidth: 2,
      pointStyle: ds.pointShape,
      pointRadius: (ctx) => {
        if (showPoints.checked) return 3;
        if (doShapes && ctx.raw && ctx.raw.isShape) return 6;
        return 0;
      },
      pointHoverRadius: 6,
      tension: 0.1
    };
  });

  if (chartInstance) chartInstance.destroy();

  let xTickConfig = {};
  if (xAxisInterval.value !== 'auto') {
    xTickConfig = { stepSize: parseFloat(xAxisInterval.value) };
  }

  // Set the localized Y title from input, or norm text.
  const yTitle = doNorm ? '正規化値 (0-1)' : yAxisLabel.value;

  const aStart = parseFloat(analysisStart.value);
  const aEnd = parseFloat(analysisEnd.value);
  const annotations = {};
  if (!isNaN(aStart) || !isNaN(aEnd)) {
    annotations.analysisRange = {
      type: 'box',
      xMin: !isNaN(aStart) ? aStart : undefined,
      xMax: !isNaN(aEnd) ? aEnd : undefined,
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderWidth: 0
    };
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: { display: !!globalTitle.value, text: globalTitle.value, font: { size: 18, weight: '700', family: 'Outfit', color: '#1e293b' } },
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Outfit', size: 13, color: '#475569' } } },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'Outfit', size: 13 },
          padding: 12, cornerRadius: 8,
          callbacks: { title: (ctx) => `時間: ${ctx[0].parsed.x.toFixed(2)} 分` }
        },
        zoom: { pan: { enabled: true, mode: 'xy' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' } },
        annotation: { annotations: annotations }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '時間（分）', font: { size: 14, weight: '600', family: 'Outfit', color: '#334155' } },
          ticks: { ...xTickConfig, color: '#64748b' },
          grid: { color: 'rgba(226, 232, 240, 0.4)' }
        },
        y: {
          type: (useLogY.checked && !doNorm) ? 'logarithmic' : 'linear',
          title: { display: true, text: yTitle, font: { size: 14, weight: '600', family: 'Outfit', color: '#334155' } },
          ticks: { color: '#64748b' },
          grid: { color: 'rgba(226, 232, 240, 0.6)' }
        }
      }
    }
  });

  downloadPNG.disabled = false;
  exportCSV.disabled = false;
  
  renderAnalysisTable();
}

// Global "Draw Chart" listeners
const configInputs = [
  xAxisInterval, yAxisLabel, globalTitle, useNorm, useMA, maWindow, 
  useLogY, showPoints, startSecInput, endSecInput, 
  analysisStart, analysisEnd, useShapes, shapeInterval
];
configInputs.forEach(el => {
  el.addEventListener('change', () => {
    // Only redraw immediately if we are on the chart tab
    if (document.getElementById('tab-chart').classList.contains('active')) {
      drawChart();
    } else {
      renderDatasetsList();
    }
  });
  if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'text')) {
    el.addEventListener('keyup', e => {
      if (document.getElementById('tab-chart').classList.contains('active')) drawChart();
      else renderDatasetsList();
    });
  }
});

// Export PNG
downloadPNG.addEventListener('click', () => {
  if (!chartInstance) return;
  const originalCanvas = document.getElementById('chart');
  const outCanvas = document.createElement('canvas');
  outCanvas.width = originalCanvas.width; outCanvas.height = originalCanvas.height;
  const outCtx = outCanvas.getContext('2d');
  outCtx.fillStyle = '#ffffff'; outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(originalCanvas, 0, 0);
  const a = document.createElement('a');
  a.href = outCanvas.toDataURL('image/png', 1.0);
  a.download = `${globalTitle.value || 'chart'}.png`;
  a.click();
});

// Export CSV
exportCSV.addEventListener('click', () => {
  if (!chartInstance) return;
  const timeMap = new Map();
  let headers = ['時間(分)'];

  chartInstance.data.datasets.forEach(ds => {
    headers.push(ds.label);
    ds.data.forEach(pt => {
      const tStr = pt.x.toFixed(4);
      if (!timeMap.has(tStr)) timeMap.set(tStr, {});
      timeMap.get(tStr)[ds.label] = pt.y;
    });
  });

  const times = Array.from(timeMap.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));
  let csvStr = headers.join(',') + '\n';
  times.forEach(t => {
    let row = [t];
    for (let i = 1; i < headers.length; i++) {
      const val = timeMap.get(t)[headers[i]];
      row.push(val !== undefined ? val : '');
    }
    csvStr += row.join(',') + '\n';
  });

  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${globalTitle.value || 'extracted_data'}.csv`;
  a.click();
});

// Table Toggles & Copy
const toggleRangeBtn = document.getElementById('toggleRangeBtn');
if (toggleRangeBtn) {
  toggleRangeBtn.addEventListener('click', () => {
    document.getElementById('analysisTable').classList.toggle('hide-range-col');
  });
}

const copyTableBtn = document.getElementById('copyTableBtn');
if (copyTableBtn) {
  copyTableBtn.addEventListener('click', () => {
    if (!datasetsData.length) return;
    const isRangeHidden = document.getElementById('analysisTable').classList.contains('hide-range-col');
    
    let tsv = "データ名(凡例)\t";
    if (!isRangeHidden) tsv += "解析範囲(分)\t";
    tsv += "計測ΔT(Max-Min)\t理論値\tエネルギー効率(%)\n";
    
    const gStart = parseFloat(analysisStart.value);
    const gEnd = parseFloat(analysisEnd.value);
    
    datasetsData.forEach(ds => {
      const fromVal = ds.enthalpyStart !== '' ? ds.enthalpyStart : (isNaN(gStart) ? 'Auto' : gStart);
      const toVal = ds.enthalpyEnd !== '' ? ds.enthalpyEnd : (isNaN(gEnd) ? 'Auto' : gEnd);
      
      const basePts = getDatasetPoints(ds);
      let aS = ds.enthalpyStart !== '' ? parseFloat(ds.enthalpyStart) : gStart;
      let aE = ds.enthalpyEnd !== '' ? parseFloat(ds.enthalpyEnd) : gEnd;
      
      let deltaTVal = getPeakDeltaT(basePts, aS, aE);
      let deltaT = deltaTVal !== 0 ? deltaTVal.toFixed(2) : "0.00";
      
      let theo = ds.theoreticalValue || "";
      let eff = "-";
      if (theo !== "" && !isNaN(parseFloat(theo)) && parseFloat(theo) !== 0) {
        eff = ((Math.abs(deltaTVal) / Math.abs(parseFloat(theo))) * 100).toFixed(1) + '%';
      }
      
      let rowVals = [String(ds.legend).replace(/\t/g, ' ')];
      if (!isRangeHidden) rowVals.push(`${fromVal} - ${toVal}`);
      rowVals.push(deltaT, theo, eff);
      
      tsv += rowVals.join('\t') + '\n';
    });
    
    navigator.clipboard.writeText(tsv).then(() => {
      const originalText = copyTableBtn.innerText;
      copyTableBtn.innerText = '✅ コピーしました';
      setTimeout(() => { copyTableBtn.innerText = originalText; }, 2000);
    });
  });
}

// Init
renderDatasetsList();
