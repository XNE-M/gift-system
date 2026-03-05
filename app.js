const STORAGE_KEY = "gift_system_v2_gifts";

/** @type {Gift[]} */
let gifts = loadGifts() || [
  {id: cryptoId(), name:"保温杯", supplier:"供应商A", cost:45, moq:100, category:"办公类", festival:"商务", customizable:true, packageSpec:"单个装", cartonSize:"", volume:"精致小巧", imageDataUrl:""},
  {id: cryptoId(), name:"坚果礼盒", supplier:"供应商B", cost:80, moq:100, category:"食品类", festival:"春节", customizable:false, packageSpec:"礼盒装", cartonSize:"", volume:"体积大", imageDataUrl:""},
  {id: cryptoId(), name:"香薰礼盒", supplier:"供应商C", cost:60, moq:100, category:"生活类", festival:"女神节", customizable:false, packageSpec:"礼盒装", cartonSize:"", volume:"精致小巧", imageDataUrl:""},
  {id: cryptoId(), name:"按摩仪", supplier:"供应商D", cost:120, moq:50, category:"健康类", festival:"通用", customizable:true, packageSpec:"彩盒装", cartonSize:"", volume:"体积大", imageDataUrl:""},
  {id: cryptoId(), name:"健康茶礼盒", supplier:"供应商E", cost:50, moq:100, category:"健康类", festival:"通用", customizable:false, packageSpec:"礼盒装", cartonSize:"", volume:"精致小巧", imageDataUrl:""}
];

/** @type {PlanItem[]} */
let selectedPlan = [];

window.addEventListener("DOMContentLoaded", () => {
  bindNav();
  bindImport();
  bindAddGift();
  bindManage();
  bindQuote();

  updateGiftCount();
  renderGiftTable();
  showPage("page-quote");
  renderPlanResult();
});

function bindNav(){
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.target));
  });
}

function showPage(pageId){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("is-active"));
  const page = document.getElementById(pageId);
  if (page) page.classList.add("is-active");
}

function bindImport(){
  const fileInput = document.getElementById("excelFile");
  fileInput?.addEventListener("change", handleExcelUpload);
}

function bindAddGift(){
  const btn = document.getElementById("btnSaveGift");
  btn?.addEventListener("click", async () => {
    const gift = await readGiftFromForm();
    if (!gift) return;
    gifts.unshift(gift);
    saveGifts();
    updateGiftCount();
    renderGiftTable();
    clearAddForm();
    toast("礼品已保存");
    showPage("page-manage");
  });
}

function bindManage(){
  document.getElementById("giftSearch")?.addEventListener("input", () => renderGiftTable());
  document.getElementById("btnClearAll")?.addEventListener("click", () => {
    const ok = confirm("确定要清空礼品库吗？此操作不可撤销。");
    if (!ok) return;
    gifts = [];
    selectedPlan = [];
    saveGifts();
    updateGiftCount();
    renderGiftTable();
    renderPlanResult();
    renderAdjustPanel();
    renderQuotePreview();
  });
}

function bindQuote(){
  document.getElementById("btnStartSelect")?.addEventListener("click", () => startSelection());

  document.getElementById("btnOpenAdjust")?.addEventListener("click", () => {
    const p = document.getElementById("adjustPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
    renderAdjustPanel();
  });

  document.getElementById("btnOpenQuote")?.addEventListener("click", () => {
    const p = document.getElementById("quotePanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
    renderQuotePreview();
  });

  document.getElementById("btnRecalc")?.addEventListener("click", () => {
    const profitPercent = Number(document.getElementById("adjustProfit")?.value || 0);
    document.getElementById("profit").value = String(profitPercent);
    applyProfitToPlan(profitPercent / 100);
    renderPlanResult();
    renderAdjustPanel();
    renderQuotePreview();
  });

  document.getElementById("btnExportPDF")?.addEventListener("click", () => window.print());
  document.getElementById("btnExportExcel")?.addEventListener("click", () => exportQuoteExcel());

  // 输入客户信息后实时刷新预览
  document.getElementById("customerName")?.addEventListener("input", () => renderQuotePreview());
  document.getElementById("projectName")?.addEventListener("input", () => renderQuotePreview());
}

function startSelection(){
  if (!gifts.length) {
    alert("礼品库为空，请先新增礼品或用 Excel 导入。");
    return;
  }

  const budgetMax = Number(document.getElementById("budgetMax").value || 0);
  const budgetMin = Number(document.getElementById("budgetMin").value || 0);
  const budget = budgetMax > 0 ? budgetMax : budgetMin;
  if (!budget || budget <= 0) {
    alert("请输入预算范围（至少填一个数字）。");
    return;
  }

  const profitRate = Number(document.getElementById("profit").value || 0) / 100;
  const filtered = applyFilters(gifts);
  if (!filtered.length) {
    alert("当前筛选条件下没有可用礼品，请调整筛选。");
    return;
  }

  selectedPlan = autoCombine(filtered, budget, profitRate);
  document.getElementById("adjustProfit").value = String(Math.round(profitRate * 100));

  renderPlanResult({budget, profitRate});
  renderAdjustPanel();
  renderQuotePreview();

  const has = selectedPlan.length > 0;
  document.getElementById("btnOpenAdjust").disabled = !has;
  document.getElementById("btnOpenQuote").disabled = !has;
}

function applyFilters(list){
  const festival = String(document.getElementById("filterFestival")?.value || "");
  const category = String(document.getElementById("filterCategory")?.value || "");
  const keywords = String(document.getElementById("filterKeywords")?.value || "").trim().toLowerCase();
  const customizableOnly = Boolean(document.getElementById("filterCustomizable")?.checked);
  const volume = String(document.querySelector("input[name='filterVolume']:checked")?.value || "");

  const terms = keywords ? keywords.split(/\s+/).filter(Boolean) : [];

  return list.filter(g => {
    if (festival && g.festival !== festival) return false;
    if (category && g.category !== category) return false;
    if (customizableOnly && !g.customizable) return false;
    if (volume && (g.volume || "") !== volume) return false;

    if (terms.length) {
      const hay = `${g.name} ${g.supplier} ${g.category} ${g.festival}`.toLowerCase();
      for (const t of terms) if (!hay.includes(t)) return false;
    }
    return true;
  });
}

function autoCombine(list, budget, profitRate){
  const targetCost = budget / (1 + profitRate);
  const shuffled = list.slice().sort(() => 0.5 - Math.random());

  /** @type {PlanItem[]} */
  const selected = [];
  let totalCost = 0;

  for (const gift of shuffled) {
    if (totalCost + gift.cost <= targetCost) {
      selected.push({
        giftId: gift.id,
        unitPrice: roundPrice(gift.cost * (1 + profitRate)),
        qty: getDefaultQty()
      });
      totalCost += gift.cost;
    }
  }

  return selected;
}

function applyProfitToPlan(profitRate){
  selectedPlan = selectedPlan.map(item => {
    const g = gifts.find(x => x.id === item.giftId);
    if (!g) return item;
    return {...item, unitPrice: roundPrice(g.cost * (1 + profitRate))};
  });
}

function renderPlanResult(meta){
  const el = document.getElementById("result");
  if (!el) return;

  if (!selectedPlan.length) {
    el.innerHTML = `<p class="muted">暂无推荐结果。请在上方填写预算并点击“开始选品”。</p>`;
    return;
  }

  const profitRate = meta?.profitRate ?? Number(document.getElementById("profit").value || 0) / 100;
  const budgetMax = Number(document.getElementById("budgetMax").value || 0);
  const budgetMin = Number(document.getElementById("budgetMin").value || 0);
  const budget = meta?.budget ?? (budgetMax > 0 ? budgetMax : budgetMin);

  const lines = selectedPlan.map(item => {
    const g = gifts.find(x => x.id === item.giftId);
    if (!g) return "";
    const supplier = g.supplier ? `（${escapeHtml(g.supplier)}）` : "";
    return `
      <div class="result-card">
        <div class="result-card__title">✓ ${escapeHtml(g.name)}${supplier}</div>
        <div class="result-card__meta">成本：¥${fmtMoney(g.cost)}　报价：¥${fmtMoney(item.unitPrice)}　数量：${item.qty}</div>
      </div>
    `;
  }).join("");

  const totals = calcTotals();
  el.innerHTML = `
    <div class="muted">客户预算：${fmtMoney(budget)}元　目标利润率：${Math.round(profitRate * 100)}%</div>
    <div style="margin-top:10px;">${lines}</div>
    <hr>
    礼盒总成本：${fmtMoney(totals.totalCost)}<br>
    建议报价：${fmtMoney(totals.totalPrice)}<br>
    预计利润：${fmtMoney(totals.totalProfit)}
  `;
}

function renderAdjustPanel(){
  const el = document.getElementById("adjustList");
  if (!el) return;

  if (!selectedPlan.length) {
    el.innerHTML = `<p class="muted">暂无可调整的组合。</p>`;
    return;
  }

  const html = selectedPlan.map(item => {
    const g = gifts.find(x => x.id === item.giftId);
    if (!g) return "";
    return `
      <div class="adjust-row">
        <div class="adjust-row__left">
          <div><b>${escapeHtml(g.name)}</b> <span class="muted">${escapeHtml(g.supplier || "")}</span></div>
          <div class="muted">成本 ¥${fmtMoney(g.cost)} / 报价 ¥${fmtMoney(item.unitPrice)}</div>
        </div>
        <div class="adjust-row__right">
          <input type="number" class="mini" data-action="price" data-id="${item.giftId}" value="${item.unitPrice}" title="单价">
          <input type="number" class="mini" data-action="qty" data-id="${item.giftId}" value="${item.qty}" title="数量">
          <button class="btn" data-action="remove" data-id="${item.giftId}">删除</button>
        </div>
      </div>
    `;
  }).join("");

  el.innerHTML = `
    <div class="muted" style="margin-bottom:10px;">可修改单品报价/数量，或删除礼品；会实时更新总计。</div>
    ${html}
    <div class="actions" style="margin-top:10px;">
      <select id="addToPlanSelect"></select>
      <button class="btn" id="btnAddToPlan">+ 添加礼品</button>
    </div>
  `;

  // 可添加礼品下拉
  const select = document.getElementById("addToPlanSelect");
  const existing = new Set(selectedPlan.map(x => x.giftId));
  const options = gifts
    .filter(g => !existing.has(g.id))
    .slice(0, 200)
    .map(g => `<option value="${g.id}">${escapeHtml(g.name)}（成本¥${fmtMoney(g.cost)}）</option>`)
    .join("");
  if (select) select.innerHTML = options || `<option value="">没有可添加的礼品</option>`;

  // 行内事件
  el.querySelectorAll("[data-action='remove']").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      selectedPlan = selectedPlan.filter(x => x.giftId !== id);
      renderPlanResult();
      renderAdjustPanel();
      renderQuotePreview();
    });
  });

  el.querySelectorAll("input[data-action='price']").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-id");
      const v = Number(inp.value || 0);
      selectedPlan = selectedPlan.map(x => x.giftId === id ? {...x, unitPrice: v} : x);
      renderPlanResult();
      renderQuotePreview();
    });
  });

  el.querySelectorAll("input[data-action='qty']").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.getAttribute("data-id");
      const v = Number(inp.value || 0);
      selectedPlan = selectedPlan.map(x => x.giftId === id ? {...x, qty: v} : x);
      renderPlanResult();
      renderQuotePreview();
    });
  });

  document.getElementById("btnAddToPlan")?.addEventListener("click", () => {
    const id = String(document.getElementById("addToPlanSelect")?.value || "");
    const g = gifts.find(x => x.id === id);
    if (!g) return;
    const profitRate = Number(document.getElementById("profit").value || 0) / 100;
    selectedPlan.push({giftId: g.id, unitPrice: roundPrice(g.cost * (1 + profitRate)), qty: getDefaultQty()});
    renderPlanResult();
    renderAdjustPanel();
    renderQuotePreview();
  });
}

function renderQuotePreview(){
  const el = document.getElementById("quotePreview");
  if (!el) return;

  if (!selectedPlan.length) {
    el.innerHTML = `<p class="muted">暂无报价内容。</p>`;
    return;
  }

  const customer = escapeHtml(String(document.getElementById("customerName")?.value || ""));
  const project = escapeHtml(String(document.getElementById("projectName")?.value || ""));

  const rows = selectedPlan.map(item => {
    const g = gifts.find(x => x.id === item.giftId);
    if (!g) return "";
    const line = item.unitPrice * item.qty;
    return `<tr>
      <td>${escapeHtml(g.name)}</td>
      <td>${item.qty}</td>
      <td>¥${fmtMoney(item.unitPrice)}</td>
      <td>¥${fmtMoney(line)}</td>
    </tr>`;
  }).join("");

  const totals = calcTotals();
  el.innerHTML = `
    <div class="muted">客户名称：${customer || "（未填写）"}　项目名称：${project || "（未填写）"}</div>
    <div class="table-wrap" style="margin-top:10px;">
      <table class="table" style="min-width:auto;">
        <thead><tr><th>礼品</th><th>数量</th><th>单价</th><th>小计</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:10px;">
      <b>总报价：</b>¥${fmtMoney(totals.totalPrice)}
      <span class="muted">（总成本 ¥${fmtMoney(totals.totalCost)}，预计利润 ¥${fmtMoney(totals.totalProfit)}）</span>
    </div>
  `;
}

function calcTotals(){
  let totalCost = 0;
  let totalPrice = 0;
  for (const item of selectedPlan) {
    const g = gifts.find(x => x.id === item.giftId);
    if (!g) continue;
    totalCost += g.cost * item.qty;
    totalPrice += item.unitPrice * item.qty;
  }
  return { totalCost, totalPrice, totalProfit: totalPrice - totalCost };
}

function getDefaultQty(){
  const v = Number(document.getElementById("defaultQty")?.value || 100);
  return v > 0 ? v : 100;
}

function renderGiftTable(){
  const tbody = document.querySelector("#giftTable tbody");
  if (!tbody) return;

  const q = String(document.getElementById("giftSearch")?.value || "").trim().toLowerCase();
  const list = q
    ? gifts.filter(g => (`${g.name} ${g.supplier} ${g.category} ${g.festival}`).toLowerCase().includes(q))
    : gifts;

  tbody.innerHTML = list.map(g => `
    <tr>
      <td>${g.imageDataUrl ? `<img class="img-thumb" src="${g.imageDataUrl}" alt="">` : `<div class="img-thumb" style="display:flex;align-items:center;justify-content:center;color:#999;">—</div>`}</td>
      <td>${escapeHtml(g.name)}</td>
      <td>${escapeHtml(g.supplier || "")}</td>
      <td>¥${fmtMoney(g.cost)}</td>
      <td>${g.moq || ""}</td>
      <td>${escapeHtml(g.category || "")}</td>
      <td>${escapeHtml(g.festival || "")}</td>
      <td>${g.customizable ? "✓" : ""}</td>
      <td>${escapeHtml(g.volume || "")}</td>
      <td><button class="btn" data-action="delete" data-id="${g.id}">删除</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-action='delete']").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const ok = confirm("确定删除该礼品吗？");
      if (!ok) return;
      gifts = gifts.filter(x => x.id !== id);
      selectedPlan = selectedPlan.filter(x => x.giftId !== id);
      saveGifts();
      updateGiftCount();
      renderGiftTable();
      renderPlanResult();
      renderAdjustPanel();
      renderQuotePreview();
    });
  });
}

async function readGiftFromForm(){
  const name = String(document.getElementById("add_name")?.value || "").trim();
  const supplier = String(document.getElementById("add_supplier")?.value || "").trim();
  const cost = Number(document.getElementById("add_cost")?.value || 0);
  const moq = Number(document.getElementById("add_moq")?.value || 0);
  const category = String(document.getElementById("add_category")?.value || "");
  const festival = String(document.getElementById("add_festival")?.value || "");
  const customizable = Boolean(document.getElementById("add_customizable")?.checked);
  const packageSpec = String(document.getElementById("add_packageSpec")?.value || "").trim();
  const cartonSize = String(document.getElementById("add_cartonSize")?.value || "").trim();
  const volume = String(document.getElementById("add_volume")?.value || "");

  if (!name) { alert("请填写礼品名称"); return null; }
  if (!cost || cost <= 0) { alert("请填写有效成本价"); return null; }

  const imgInput = document.getElementById("add_image");
  const file = imgInput?.files?.[0];
  const imageDataUrl = file ? await readFileAsDataUrl(file) : "";

  return {
    id: cryptoId(),
    name, supplier, cost,
    moq: moq || 0,
    category, festival,
    customizable,
    packageSpec,
    cartonSize,
    volume,
    imageDataUrl
  };
}

function clearAddForm(){
  ["add_name","add_supplier","add_cost","add_moq","add_packageSpec","add_cartonSize"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["add_category","add_festival","add_volume"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const cb = document.getElementById("add_customizable");
  if (cb) cb.checked = false;
  const img = document.getElementById("add_image");
  if (img) img.value = "";
}

function handleExcelUpload(event){
  const file = event.target.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") {
    alert("Excel 解析库加载失败。请确认网络可访问后重试。");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e){
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {type: "array"});
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {header:1, defval:""});
    if (rows.length < 2) { alert("Excel 中没有数据，请检查文件。"); return; }

    const header = rows[0].map(x => String(x).trim());
    const idx = (name) => header.indexOf(name);

    const nameIndex = idx("名称");
    const costIndex = idx("成本");
    if (nameIndex === -1 || costIndex === -1) { alert("请确认表头包含：名称、成本。"); return; }

    const supplierIndex = idx("供应商");
    const moqIndex = idx("MOQ");
    const categoryIndex = idx("分类");
    const festivalIndex = idx("节日");
    const customizableIndex = idx("是否可定制");
    const packageSpecIndex = idx("包装规格");
    const cartonSizeIndex = idx("外箱尺寸");
    const volumeIndex = idx("包装体积");

    /** @type {Gift[]} */
    const newGifts = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[nameIndex] ?? "").trim();
      const cost = Number(row[costIndex]);
      if (!name || isNaN(cost) || cost <= 0) continue;

      const supplier = supplierIndex !== -1 ? String(row[supplierIndex] ?? "").trim() : "";
      const moq = moqIndex !== -1 ? Number(row[moqIndex] || 0) : 0;
      const category = categoryIndex !== -1 ? String(row[categoryIndex] ?? "").trim() : "";
      const festival = festivalIndex !== -1 ? String(row[festivalIndex] ?? "").trim() : "";
      const customizableRaw = customizableIndex !== -1 ? String(row[customizableIndex] ?? "").trim() : "";
      const customizable = ["1","是","TRUE","true","yes","Y","y","✓"].includes(customizableRaw);
      const packageSpec = packageSpecIndex !== -1 ? String(row[packageSpecIndex] ?? "").trim() : "";
      const cartonSize = cartonSizeIndex !== -1 ? String(row[cartonSizeIndex] ?? "").trim() : "";
      const volume = volumeIndex !== -1 ? String(row[volumeIndex] ?? "").trim() : "";

      newGifts.push({
        id: cryptoId(),
        name,
        supplier,
        cost,
        moq: isNaN(moq) ? 0 : moq,
        category,
        festival,
        customizable,
        packageSpec,
        cartonSize,
        volume,
        imageDataUrl: ""
      });
    }

    if (!newGifts.length) { alert("没有读到有效的礼品数据，请检查内容。"); return; }

    // 追加导入（不覆盖）
    gifts = [...newGifts, ...gifts];
    saveGifts();
    updateGiftCount();
    renderGiftTable();
    toast("Excel 导入成功");
    showPage("page-manage");
  };
  reader.onerror = function(){ alert("读取 Excel 文件失败，请重试。"); };
  reader.readAsArrayBuffer(file);
}

function updateGiftCount(){
  const el = document.getElementById("giftCount");
  if (el) el.textContent = `当前礼品数：${gifts.length}`;
}

function exportQuoteExcel(){
  if (!selectedPlan.length) { alert("暂无报价内容"); return; }
  if (typeof XLSX === "undefined") { alert("导出需要 XLSX 库，请确认网络可访问后重试。"); return; }

  const customer = String(document.getElementById("customerName")?.value || "").trim();
  const project = String(document.getElementById("projectName")?.value || "").trim();
  const totals = calcTotals();

  const data = [
    ["客户名称", customer],
    ["项目名称", project],
    [],
    ["礼品", "数量", "单价", "小计", "供应商", "成本"],
    ...selectedPlan.map(item => {
      const g = gifts.find(x => x.id === item.giftId);
      const line = item.unitPrice * item.qty;
      return [g?.name || "", item.qty, item.unitPrice, line, g?.supplier || "", g?.cost || ""];
    }),
    [],
    ["总成本", totals.totalCost],
    ["总报价", totals.totalPrice],
    ["预计利润", totals.totalProfit]
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "报价单");

  const fileName = `报价单_${customer || "客户"}_${project || "项目"}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
  XLSX.writeFile(wb, fileName);
}

function loadGifts(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveGifts(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gifts));
  } catch {
    // ignore
  }
}

function toast(msg){
  const hint = document.getElementById("add_hint");
  if (hint) hint.textContent = msg;
  setTimeout(() => {
    if (hint) hint.textContent = "保存后会进入礼品库，可在“礼品库管理”查看。";
  }, 2200);
}

function fmtMoney(n){
  const x = Number(n || 0);
  return x.toFixed(0);
}

function roundPrice(n){
  return Math.round(Number(n || 0));
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function cryptoId(){
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * @typedef {Object} Gift
 * @property {string} id
 * @property {string} name
 * @property {string} supplier
 * @property {number} cost
 * @property {number} moq
 * @property {string} category
 * @property {string} festival
 * @property {boolean} customizable
 * @property {string} packageSpec
 * @property {string} cartonSize
 * @property {string} volume
 * @property {string} imageDataUrl
 */

/**
 * @typedef {Object} PlanItem
 * @property {string} giftId
 * @property {number} unitPrice
 * @property {number} qty
 */
