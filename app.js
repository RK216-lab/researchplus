// app.js

const fileInput = document.getElementById('fileInput');
const dropArea = document.getElementById('dropArea');
const datasetsList = document.getElementById('datasetsList');

// Wizard elements
const btnNext = document.getElementById('btnNext');
const btnBack = document.getElementById('btnBack');
const steps = document.querySelectorAll('.step');
const stepContents = document.querySelectorAll('.step-content');
let currentStep = 1;

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

const downloadPNG = document.getElementById('downloadPNG');
const exportCSV = document.getElementById('exportCSV');

let datasetsData = [];
let chartInstance = null;
const ctx = document.getElementById('chart').getContext('2d');
const colorPalette = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

// Wizard Navigation
function updateWizard() {
  steps.forEach((s, i) => {
    s.classList.remove('active', 'completed');
    if(i + 1 < currentStep) s.classList.add('completed');
    else if(i + 1 === currentStep) s.classList.add('active');
  });

  stepContents.forEach((c, i) => {
    c.classList.toggle('active', i + 1 === currentStep);
  });

  btnBack.classList.toggle('hidden', currentStep === 1);
  
  if (currentStep === 1) {
    btnNext.innerHTML = 'グラフ設定へ <span style="font-size:18px;">&rarr;</span>';
    btnNext.disabled = datasetsData.length === 0;
  } else if (currentStep === 2) {
    btnNext.innerHTML = 'グラフ描画 <span style="font-size:18px;">&rarr;</span>';
    btnNext.disabled = false;
  } else if (currentStep === 3) {
    btnNext.classList.add('hidden');
    drawChart();
  } else {
    btnNext.classList.remove('hidden');
  }
}

btnNext.addEventListener('click', () => {
  if (currentStep < 3) { currentStep++; updateWizard(); }
});
btnBack.addEventListener('click', () => {
  if (currentStep > 1) { currentStep--; btnNext.classList.remove('hidden'); updateWizard(); }
});

// UI Event Listeners
useMA.addEventListener('change', (e) => document.getElementById('maSettings').classList.toggle('hidden', !e.target.checked));
maWindow.addEventListener('input', (e) => maValue.textContent = e.target.value);

['dragenter','dragover','dragleave','drop'].forEach(ev => dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
['dragenter','dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('dragover')));
['dragleave','drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('dragover')));

dropArea.addEventListener('drop', e => processFiles(e.dataTransfer.files));
fileInput.addEventListener('change', e => { processFiles(e.target.files); e.target.value = ''; });

// File Processing
function processFiles(files) {
  if (!files.length) return;
  const fileArray = Array.from(files).filter(f => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ext === 'csv' || ext === 'txt';
  });
  
  let processedCount = 0;
  fileArray.forEach(file => {
    Papa.parse(file, {
      header: false, skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        if(rows.length < 2) { processedCount++; return; }

        let headerIdx = 0;
        const keywords = ['time','index','秒','temp','温度','value','val'];
        for (let i=0; i<Math.min(10, rows.length); i++){
          if (rows[i].some(c => keywords.some(k => (''+c).toLowerCase().includes(k)))) {
            headerIdx = i; break;
          }
        }
        const header = rows[headerIdx].map(c => (''+c).trim() || 'Col');
        const data = rows.slice(headerIdx + 1).map(r => {
          const o = {}; header.forEach((h, i) => o[h] = r[i]); return o;
        });

        const low = header.map(f => f.toLowerCase());
        const xIdx = Math.max(0, low.findIndex(f => /time|秒|sec/.test(f)));
        let yIdx = Math.max(0, low.findIndex(f => /temp|温度|℃|val|ch/.test(f)));
        if(xIdx === yIdx && header.length > 1) yIdx = xIdx === 0 ? 1 : 0;

        const dsId = 'ds_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        datasetsData.push({
          id: dsId, filename: file.name, legend: file.name.replace(/\.(csv|txt)$/i,''),
          color: colorPalette[datasetsData.length % colorPalette.length],
          header: header, data: data, xCol: header[xIdx], yCol: header[yIdx]
        });
        
        if(datasetsData.length === 1 && !globalTitle.value) {
          globalTitle.value = "Experiment Analysis " + new Date().toISOString().split('T')[0];
        }
        
        processedCount++;
        if(processedCount === fileArray.length) {
          autoSetTimeRange();
          renderDatasetsList();
          btnNext.disabled = false; // Enable next button
        }
      }
    });
  });
}

function autoSetTimeRange() {
  if(!datasetsData.length) return;
  let minT = Infinity, maxT = -Infinity;
  datasetsData.forEach(ds => {
    ds.data.forEach(row => {
      const val = parseFloat(row[ds.xCol]);
      if(!isNaN(val)) {
        if(val < minT) minT = val;
        if(val > maxT) maxT = val;
      }
    });
  });
  if(minT !== Infinity && startSecInput.value === '') startSecInput.value = minT;
  if(maxT !== -Infinity && endSecInput.value === '') endSecInput.value = maxT;
}

function calculateStats(dataArr) {
  if(!dataArr.length) return { min: 0, max: 0, avg: 0 };
  let min = Infinity, max = -Infinity, sum = 0;
  dataArr.forEach(v => {
    if(v < min) min = v;
    if(v > max) max = v;
    sum += v;
  });
  return { min, max, avg: sum / dataArr.length };
}

function renderDatasetsList() {
  if(!datasetsData.length) {
    datasetsList.innerHTML = '';
    btnNext.disabled = true;
    return;
  }
  
  datasetsList.innerHTML = '';
  datasetsData.forEach(ds => {
    const card = document.createElement('div');
    card.className = 'dataset-card';
    card.style.setProperty('--ds-color', ds.color);
    
    let yVals = ds.data.map(r => parseFloat(r[ds.yCol])).filter(n => !isNaN(n));
    let stats = calculateStats(yVals);

    let xOpts = ds.header.map(h => `<option value="${h}" ${h===ds.xCol?'selected':''}>${h}</option>`).join('');
    let yOpts = ds.header.map(h => `<option value="${h}" ${h===ds.yCol?'selected':''}>${h}</option>`).join('');

    card.innerHTML = `
      <div class="dataset-header">
        <h4 class="dataset-title">${ds.filename}</h4>
        <button class="btn-remove" data-id="${ds.id}">&times;</button>
      </div>
      <div class="stats-grid">
        <div class="stat-item">Avg <span>${stats.avg.toFixed(2)}</span></div>
        <div class="stat-item">Range <span>${(stats.max - stats.min).toFixed(2)}</span></div>
      </div>
      <div class="ds-settings">
        <div class="input-group" style="margin:0;">
          <label style="font-size:11px;">凡例名</label>
          <input type="text" value="${ds.legend}" class="inp-legend" data-id="${ds.id}" style="padding:6px; font-size:12px;">
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="input-group" style="margin:0;">
            <label style="font-size:11px;">色</label>
            <input type="color" value="${ds.color}" class="inp-color" data-id="${ds.id}" style="padding:0; height:32px;">
          </div>
          <div class="input-group" style="margin:0;">
            <label style="font-size:11px;">Y列</label>
            <select class="inp-ycol" data-id="${ds.id}" style="padding:6px; font-size:12px;">${yOpts}</select>
          </div>
        </div>
      </div>
    `;
    datasetsList.appendChild(card);
  });

  document.querySelectorAll('.btn-remove').forEach(btn => btn.addEventListener('click', e => {
    datasetsData = datasetsData.filter(d => d.id !== e.target.dataset.id);
    renderDatasetsList();
  }));
  document.querySelectorAll('.inp-legend').forEach(el => el.addEventListener('input', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).legend = e.target.value;
  }));
  document.querySelectorAll('.inp-color').forEach(el => el.addEventListener('input', e => {
    const ds = datasetsData.find(d => d.id === e.target.dataset.id);
    ds.color = e.target.value;
    e.target.closest('.dataset-card').style.setProperty('--ds-color', e.target.value);
  }));
  document.querySelectorAll('.inp-ycol').forEach(el => el.addEventListener('change', e => {
    datasetsData.find(d => d.id === e.target.dataset.id).yCol = e.target.value;
    renderDatasetsList(); // recalc stats
  }));
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
  data.forEach(d => { if(d.y < min) min=d.y; if(d.y > max) max=d.y; });
  const range = max - min;
  if(range === 0) return data.map(d => ({x: d.x, y: 0.5}));
  return data.map(d => ({x: d.x, y: (d.y - min) / range}));
}

function drawChart() {
  if (!datasetsData.length) return;

  const startTime = parseFloat(startSecInput.value) || 0;
  const endTime = parseFloat(endSecInput.value) || Infinity;
  const doMA = useMA.checked;
  const maWin = parseInt(maWindow.value, 10);
  const doNorm = useNorm.checked;

  const chartDatasets = datasetsData.map(ds => {
    let pts = ds.data
      .map(r => ({ x: parseFloat(r[ds.xCol]), y: parseFloat(r[ds.yCol]) }))
      .filter(d => !isNaN(d.x) && !isNaN(d.y) && d.x >= startTime && d.x <= endTime)
      .sort((a,b) => a.x - b.x);

    if (doMA) pts = movingAverage(pts, maWin);
    if (doNorm) pts = normalize(pts);
    
    // seconds to minutes
    pts = pts.map(d => ({ x: d.x / 60, y: d.y }));

    return {
      label: ds.legend,
      data: pts,
      borderColor: ds.color,
      backgroundColor: ds.color,
      borderWidth: 2,
      pointRadius: showPoints.checked ? 3 : 0,
      pointHoverRadius: 6,
      tension: 0.1
    };
  });

  if (chartInstance) chartInstance.destroy();
  
  let xTickConfig = {};
  if(xAxisInterval.value !== 'auto') {
    xTickConfig = { stepSize: parseFloat(xAxisInterval.value) };
  }

  // Set the localized Y title from input, or norm text.
  const yTitle = doNorm ? '正規化値 (0-1)' : yAxisLabel.value;

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        title: { display: !!globalTitle.value, text: globalTitle.value, font: { size: 18, weight: '700', family: 'Outfit' } },
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Outfit', size: 13 } } },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.9)',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'Outfit', size: 13 },
          padding: 12, cornerRadius: 8,
          callbacks: { title: (ctx) => `時間: ${ctx[0].parsed.x.toFixed(2)} 分` }
        },
        zoom: { pan: { enabled: true, mode: 'xy' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' } }
      },
      scales: {
        x: { 
          type: 'linear', 
          title: { display: true, text: '時間（分）', font: { size: 14, weight: '600', family: 'Outfit' } },
          ticks: xTickConfig, grid: { color: 'rgba(226, 232, 240, 0.6)' }
        },
        y: { 
          type: (useLogY.checked && !doNorm) ? 'logarithmic' : 'linear',
          title: { display: true, text: yTitle, font: { size: 14, weight: '600', family: 'Outfit' } },
          grid: { color: 'rgba(226, 232, 240, 0.6)' }
        }
      }
    }
  });

  downloadPNG.disabled = false;
  exportCSV.disabled = false;
}

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
      if(!timeMap.has(tStr)) timeMap.set(tStr, {});
      timeMap.get(tStr)[ds.label] = pt.y;
    });
  });

  const times = Array.from(timeMap.keys()).sort((a,b) => parseFloat(a) - parseFloat(b));
  let csvStr = headers.join(',') + '\n';
  times.forEach(t => {
    let row = [t];
    for(let i=1; i<headers.length; i++) {
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

// Init
updateWizard();
