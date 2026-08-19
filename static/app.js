let records = [];
let options = {};
const tableState = {};
const tableModels = {};
const appBasePath = document.documentElement.dataset.basePath || "";
const viewPreferenceKey = "ecargo.analytics.activeView";

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const fmt = new Intl.NumberFormat("pt-BR");
const fmt1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const supportExcludedCategories = [
  "ALTERAR PERFIL",
  "ALTERAÇÃO DE PERFIL - REVISÃO",
  "CRIAÇÃO/ALTERAÇÃO PERFIL",
  "DESBLOQUEAR ACESSO",
  "MANUTENÇÃO DE PERFIL",
  "REMOVER ACESSO",
  "REMOVER ACESSO - REVISÃO",
  "RESET DE SENHA",
  "EVOLUTIVA",
  "MUDANÇA",
  "MUDANCA",
];
const supportViewExcludedCategories = [...supportExcludedCategories];
const supportViewExcludedStatuses = ["01-NOVO PROBLEMA"];

document.getElementById("fileInput").addEventListener("change", uploadFile);
document.getElementById("fetch222").addEventListener("click", fetch222);
document.getElementById("clearFilters").addEventListener("click", clearFilters);
document.getElementById("downloadCsv").addEventListener("click", downloadCsv);
document.getElementById("categoryMode").addEventListener("change", renderDashboard);
document.getElementById("groupEvolutiva").addEventListener("click", () => applyCategoryGroup("include", ["EVOLUTIVA"]));
document.getElementById("groupMudanca").addEventListener("click", () => applyCategoryGroup("include", ["MUDANÇA", "MUDANCA"]));
document.getElementById("groupSuporte").addEventListener("click", () => applyCategoryGroup("exclude", supportExcludedCategories));
document.getElementById("tabDashboard").addEventListener("click", () => setActiveView("dashboard"));
document.getElementById("tabSupport").addEventListener("click", () => setActiveView("support"));
document.getElementById("closeDetail").addEventListener("click", closeDetail);
setDefaultDates();
setActiveView(savedActiveView());
loadBase();

async function loadBase() {
  try {
    const response = await fetch(`${appBasePath}/api/base`);
    const payload = await response.json();
    if (!response.ok) return;
    applyPayload(payload);
    if (records.length) {
      setStatus(`${fmt.format(records.length)} chamados carregados da base acumulada.${syncText(payload)}`);
    }
  } catch {
    setStatus("Nenhum arquivo carregado.");
  }
}

async function uploadFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  setStatus(`Processando ${file.name}...`);
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${appBasePath}/api/analyze`, { method: "POST", body: form });
  const payload = await response.json();
  if (!response.ok) {
    setStatus(payload.error || "Falha ao processar arquivo.");
    return;
  }

  applyPayload(payload);
  setStatus(`${fmt.format(records.length)} chamados na base. ${importText(payload)} Arquivo: ${file.name}.${syncText(payload)}`);
}

async function fetch222() {
  const { start, end } = selectedDateRange();
  const button = document.getElementById("fetch222");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Buscando...";
  setStatus(`Buscando chamados do SUPORTE ECARGO de ${formatDateBr(start)} até ${formatDateBr(end)}...`);

  try {
    const payload = await fetch222Payload(start, end);

    applyPayload(payload);
    const warning = payload.warning ? ` ${payload.warning}` : "";
    setStatus(`${fmt.format(records.length)} chamados na base. ${importText(payload)}${syncText(payload)}${warning}`);
  } catch (error) {
    setStatus(`Falha ao buscar dados do 222: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function applyPayload(payload) {
  records = payload.records || [];
  options = payload.options || {};
  buildFilters();
  renderDashboard();
}

function importText(payload) {
  const result = payload.import_result;
  if (!result) return "";
  return `${fmt.format(result.inserted || 0)} novos, ${fmt.format(result.updated || 0)} atualizados.`;
}

function syncText(payload) {
  const sync = payload.sync || {};
  if (!sync.last_sync_status) return "";
  return ` Última sync: ${sync.last_sync_status}.`;
}

async function fetch222Payload(start, end) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const params = new URLSearchParams({ start, end, scope: "ecargo" });
      const response = await fetch(`${appBasePath}/api/fetch-222?${params.toString()}`);
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`resposta inválida do servidor (${response.status})`);
      }
      if (!response.ok) {
        throw new Error(payload.error || `servidor retornou ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        setStatus(`A primeira tentativa falhou (${error.message}). Tentando novamente...`);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }
  throw lastError;
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 1);
  document.getElementById("startDateInput").value = toDateInput(start);
  document.getElementById("endDateInput").value = toDateInput(end);
}

function selectedDateRange() {
  const start = document.getElementById("startDateInput").value;
  const end = document.getElementById("endDateInput").value;
  if (!start || !end) {
    throw new Error("Informe data inicial e data final.");
  }
  if (end < start) {
    throw new Error("Data final não pode ser menor que a data inicial.");
  }
  return { start, end };
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateBr(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function setActiveView(view) {
  const nextView = view === "support" ? "support" : "dashboard";
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== nextView;
  });
  document.getElementById("tabDashboard").classList.toggle("active", nextView === "dashboard");
  document.getElementById("tabSupport").classList.toggle("active", nextView === "support");
  localStorage.setItem(viewPreferenceKey, nextView);
  closeDetail();
}

function savedActiveView() {
  return localStorage.getItem(viewPreferenceKey) === "support" ? "support" : "dashboard";
}

function buildFilters() {
  buildCheckList("categoryList", options.categorias || []);
  buildCheckList("subcategoryList", options.subcategorias || []);
  buildCheckList("yearList", options.anos || []);
  buildCheckList(
    "monthList",
    (options.meses || []).map((m) => ({ value: m.numero, label: m.nome }))
  );
}

function buildCheckList(id, values) {
  const target = document.getElementById(id);
  target.innerHTML = "";
  values.forEach((item) => {
    const value = typeof item === "object" ? item.value : item;
    const labelText = typeof item === "object" ? item.label : item;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.addEventListener("change", renderDashboard);
    label.append(input, document.createTextNode(labelText));
    target.appendChild(label);
  });
}

function selected(id) {
  return new Set([...document.querySelectorAll(`#${id} input:checked`)].map((el) => String(el.value)));
}

function applyCategoryGroup(mode, categoryNames) {
  const wanted = new Set(categoryNames.map(normalizeFilterText));
  document.getElementById("categoryMode").value = mode;
  document.querySelectorAll("#categoryList input").forEach((input) => {
    input.checked = wanted.has(normalizeFilterText(input.value));
  });
  renderDashboard();
}

function normalizeFilterText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function filteredRecords() {
  const cats = selected("categoryList");
  const subs = selected("subcategoryList");
  const years = selected("yearList");
  const months = selected("monthList");
  const catMode = document.getElementById("categoryMode").value;

  return records.filter((row) => {
    const category = String(row["Categoria de terceiro nível"] || "");
    const subcategory = String(row.Subcategoria || "");
    const year = String(row["Ano solicitação"] || "");
    const month = String(row["Mês número"] || "");

    if (cats.size && catMode === "include" && !cats.has(category)) return false;
    if (cats.size && catMode === "exclude" && cats.has(category)) return false;
    if (subs.size && !subs.has(subcategory)) return false;
    if (years.size && !years.has(year)) return false;
    if (months.size && !months.has(month)) return false;
    return true;
  });
}

function renderDashboard() {
  const rows = filteredRecords();
  const durations = rows.map((r) => r["Tempo atendimento (h)"]).filter((v) => typeof v === "number");
  const closed = rows.filter((r) => r["Situação gerencial"] === "Finalizado").length;
  const open = rows.filter((r) => r["Situação gerencial"] === "Em aberto").length;
  const weeklyRows = weekly(rows);
  const todayWeek = currentIsoWeek();
  const currentWeek = weeklyRows.find((r) => r.Ano === todayWeek.year && r.Semana === todayWeek.week) || emptyWeek(todayWeek);
  const previousWeek = previousIsoWeek(weeklyRows, todayWeek);
  const agingRows = aging(rows);
  const oldBacklog15 = backlog(rows).filter((r) => Number(r["Dias aberto"]) > 15).length;
  const oldBacklog30 = backlog(rows).filter((r) => Number(r["Dias aberto"]) > 30).length;
  const closureRate = currentWeek && currentWeek.Chamados ? (currentWeek.Finalizados / currentWeek.Chamados) * 100 : 0;

  document.getElementById("currentWeekLabel").textContent = `Semana atual S${todayWeek.week}/${todayWeek.year}`;
  document.getElementById("kpiWeekOpened").textContent = fmt.format(currentWeek?.Chamados || 0);
  document.getElementById("kpiWeekOpenedDelta").textContent = deltaText(currentWeek?.Chamados, previousWeek?.Chamados, "entradas vs semana anterior");
  document.getElementById("kpiWeekClosed").textContent = fmt.format(currentWeek?.Finalizados || 0);
  document.getElementById("kpiWeekClosedDelta").textContent = deltaText(currentWeek?.Finalizados, previousWeek?.Finalizados, "vs semana anterior");
  document.getElementById("kpiWeekBalance").textContent = signed(currentWeek?.["Saldo da semana"] || 0);
  document.getElementById("kpiWeekBalanceHint").textContent = currentWeek ? balanceHint(currentWeek["Saldo da semana"]) : "entradas - finalizados";
  document.getElementById("kpiOpen").textContent = fmt.format(open);
  document.getElementById("kpiMedian").textContent = `${fmt1.format(median(durations))}h`;
  document.getElementById("kpiAvg").textContent = `média ${fmt1.format(avg(durations))}h`;
  document.getElementById("kpiAging").textContent = `${fmt.format(oldBacklog15)} acima de 15 dias`;
  document.getElementById("focusPeriod").textContent = currentWeek ? `S${currentWeek.Semana}/${currentWeek.Ano}` : "-";
  document.getElementById("focusClosureRate").textContent = `${fmt1.format(closureRate)}%`;
  document.getElementById("focusOldBacklog").textContent = fmt.format(oldBacklog30);
  document.getElementById("meetingNarrative").textContent = meetingNarrative(rows.length, closed, open, currentWeek, previousWeek, oldBacklog15);

  renderSupportView();
  renderCharts(rows, weeklyRows, agingRows);
  closeDetail();

  renderTable("agingTable", agingRows, ["Faixa", "Chamados", "% backlog"], null, (row) =>
    showDetails(`Backlog ${row.Faixa}`, rowsForAging(rows, row.Faixa))
  );
  renderTable("monthlyTable", monthly(rows), ["Mês", "Chamados", "Finalizados", "Em aberto", "Taxa fechamento", "Tempo médio h"], null, (row) =>
    showDetails(`Chamados de ${row.Mês}`, rows.filter((r) => r["Mês solicitação"] === row.Mês))
  );
  renderTable("weeklyTable", weeklyRows, ["Ano", "Mês", "Semana", "Chamados", "Finalizados", "Taxa fechamento", "Saldo da semana", "Saldo acumulado", "Mediana h"], (row) =>
    row.Ano === todayWeek.year && row.Semana === todayWeek.week ? "is-current-week" : ""
  , (row) =>
    showDetails(`Semana ${row.Semana}/${row.Ano}`, rows.filter((r) => r["Ano solicitação"] === row.Ano && r["Semana do ano"] === row.Semana))
  );
  renderTable("categoryTable", categoryAttention(rows), ["Categoria", "Chamados", "Em aberto", "Saldo", "Mediana h"], null, (row) =>
    showDetails(`Categoria ${row.Categoria}`, rows.filter((r) => (r["Categoria de terceiro nível"] || "Não informado") === row.Categoria))
  );
  renderTable("analystTable", analystPerformance(rows), ["Analista", "Chamados", "Finalizados", "Em aberto", "Mediana h"], null, (row) =>
    showDetails(`Analista ${row.Analista}`, rows.filter((r) => (r["Analista Responsável"] || "Não informado") === row.Analista))
  );
  renderTable("groupTable", ranking(rows, "Grupo solucionador", "Grupo"), ["Grupo", "Chamados"], null, (row) =>
    showDetails(`Grupo ${row.Grupo}`, rows.filter((r) => (r["Grupo solucionador"] || "Não informado") === row.Grupo))
  );
  renderTable("backlogTable", backlog(rows), ["#", "Categoria", "Grupo", "Status", "Localidade", "Data de solicitação", "Dias aberto", "Título"]);
}

function renderSupportView() {
  const rows = supportOpenRows(records);
  const breached = rows.filter((row) => row._slaLevel === "breached").length;
  const warning = rows.filter((row) => row._slaLevel === "warning").length;
  const ok = rows.filter((row) => row._slaLevel === "ok").length;

  document.getElementById("supportOpenTotal").textContent = fmt.format(rows.length);
  document.getElementById("supportSlaBreached").textContent = fmt.format(breached);
  document.getElementById("supportSlaWarning").textContent = fmt.format(warning);
  document.getElementById("supportSlaOk").textContent = fmt.format(ok);

  renderTable("supportSlaTable", supportSlaSummary(rows), ["Faixa", "Chamados", "% fila"], supportSlaRowClass, (row) =>
    showDetails(`Suporte - ${row.Faixa}`, rows.filter((ticket) => ticket["SLA"] === row.Faixa).map((ticket) => ticket._source))
  );
  renderTable(
    "supportOpenTable",
    rows,
    ["#", "SLA", "Horas aberto", "Horas para SLA", "Categoria", "Subcategoria", "Grupo", "Status", "Data de solicitação", "Título"],
    supportSlaRowClass,
    (row) => showDetails(`Chamado ${row["#"]}`, [row._source])
  );
}

function supportOpenRows(sourceRows) {
  return sourceRows
    .filter((row) => row["Situação gerencial"] === "Em aberto" && isSupportViewTicket(row))
    .map((row) => {
      const hours = openHours(row);
      const sla = supportSla(hours);
      return {
        "#": row["#"],
        SLA: sla.label,
        "Horas aberto": hours === null ? "" : fmt1.format(hours),
        "Horas para SLA": hours === null ? "" : fmt1.format(48 - hours),
        Categoria: row["Categoria de terceiro nível"] || "Não informado",
        Subcategoria: row.Subcategoria || "Não informado",
        Grupo: row["Grupo solucionador"] || "Não informado",
        Status: row.Status || "",
        "Data de solicitação": row["Data de solicitação"],
        Título: row["Título"],
        _slaLevel: sla.level,
        _hoursOpen: hours,
        _source: row,
      };
    })
    .sort((a, b) => supportPriority(a) - supportPriority(b) || (b._hoursOpen || 0) - (a._hoursOpen || 0));
}

function isSupportCategory(row) {
  const category = normalizeFilterText(row["Categoria de terceiro nível"]);
  const excluded = new Set(supportExcludedCategories.map(normalizeFilterText));
  return !excluded.has(category);
}

function isSupportViewTicket(row) {
  const category = normalizeFilterText(row["Categoria de terceiro nível"]);
  const primaryCategory = normalizeFilterText(row.Categoria);
  const status = normalizeFilterText(row.Status);
  const excludedCategories = new Set(supportViewExcludedCategories.map(normalizeFilterText));
  const excludedStatuses = new Set(supportViewExcludedStatuses.map(normalizeFilterText));
  return !excludedCategories.has(category) && !excludedCategories.has(primaryCategory) && !excludedStatuses.has(status);
}

function openHours(row) {
  const opened = new Date(String(row["Data de solicitação"]).replace(" ", "T"));
  if (Number.isNaN(opened.getTime())) return null;
  return Math.max(0, (new Date() - opened) / 3600000);
}

function supportSla(hours) {
  if (hours === null) return { label: "Sem data", level: "unknown" };
  if (hours >= 48) return { label: "SLA vencido", level: "breached" };
  if (hours >= 36) return { label: "Atenção", level: "warning" };
  return { label: "Dentro do SLA", level: "ok" };
}

function supportPriority(row) {
  return { breached: 0, warning: 1, unknown: 2, ok: 3 }[row._slaLevel] ?? 4;
}

function supportSlaSummary(rows) {
  const buckets = [
    { Faixa: "SLA vencido", level: "breached" },
    { Faixa: "Atenção", level: "warning" },
    { Faixa: "Dentro do SLA", level: "ok" },
    { Faixa: "Sem data", level: "unknown" },
  ];
  return buckets
    .map((bucket) => {
      const count = rows.filter((row) => row._slaLevel === bucket.level).length;
      return { ...bucket, Chamados: count, "% fila": percent(count, rows.length), _slaLevel: bucket.level };
    })
    .filter((row) => row.Chamados > 0 || row._slaLevel !== "unknown");
}

function supportSlaRowClass(row) {
  if (row._slaLevel === "breached") return "sla-breached";
  if (row._slaLevel === "warning") return "sla-warning";
  return "";
}

function monthly(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = r["Mês solicitação"] || "Sem data";
    const item = map.get(key) || { Mês: key, Chamados: 0, Finalizados: 0, "Em aberto": 0, durations: [] };
    item.Chamados += 1;
    item.Finalizados += r["Situação gerencial"] === "Finalizado" ? 1 : 0;
    item["Em aberto"] += r["Situação gerencial"] === "Em aberto" ? 1 : 0;
    if (typeof r["Tempo atendimento (h)"] === "number") item.durations.push(r["Tempo atendimento (h)"]);
    map.set(key, item);
  });
  return [...map.values()]
    .sort((a, b) => a.Mês.localeCompare(b.Mês))
    .map((r) => ({
      ...r,
      "Taxa fechamento": percent(r.Finalizados, r.Chamados),
      "Tempo médio h": fmt1.format(avg(r.durations)),
    }));
}

function weekly(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = `${r["Ano solicitação"]}-${r["Mês número"]}-${r["Semana do ano"]}`;
    const item = map.get(key) || {
      Ano: r["Ano solicitação"],
      "Mês número": r["Mês número"],
      Mês: r["Mês nome"],
      Semana: r["Semana do ano"],
      Chamados: 0,
      Finalizados: 0,
      "Saldo da semana": 0,
      durations: [],
    };
    item.Chamados += 1;
    item.Finalizados += r["Situação gerencial"] === "Finalizado" ? 1 : 0;
    item["Saldo da semana"] = item.Chamados - item.Finalizados;
    if (typeof r["Tempo atendimento (h)"] === "number") item.durations.push(r["Tempo atendimento (h)"]);
    map.set(key, item);
  });

  let saldo = 0;
  return [...map.values()]
    .sort((a, b) => (a.Ano - b.Ano) || (a["Mês número"] - b["Mês número"]) || (a.Semana - b.Semana))
    .map((r) => {
      saldo += r["Saldo da semana"];
      return {
        ...r,
        "Taxa fechamento": percent(r.Finalizados, r.Chamados),
        "Saldo da semana": signed(r["Saldo da semana"]),
        "Saldo acumulado": signed(saldo),
        "Mediana h": fmt1.format(median(r.durations)),
      };
    });
}

function currentIsoWeek() {
  const today = new Date();
  return isoWeek(today);
}

function isoWeek(date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((copy - yearStart) / 86400000 + 1) / 7);
  return { year: copy.getUTCFullYear(), week };
}

function previousIsoWeek(weeklyRows, todayWeek) {
  return weeklyRows
    .filter((r) => r.Ano < todayWeek.year || (r.Ano === todayWeek.year && r.Semana < todayWeek.week))
    .at(-1);
}

function emptyWeek(todayWeek) {
  return {
    Ano: todayWeek.year,
    Mês: monthNames[new Date().getMonth()],
    Semana: todayWeek.week,
    Chamados: 0,
    Finalizados: 0,
    "Taxa fechamento": "0%",
    "Saldo da semana": "0",
    "Saldo acumulado": "0",
    "Mediana h": "0,0",
  };
}

function categoryAttention(rows) {
  return groupedPerformance(rows, "Categoria de terceiro nível", "Categoria")
    .sort((a, b) => (b["Em aberto"] - a["Em aberto"]) || (b.Chamados - a.Chamados))
    .slice(0, 20);
}

function analystPerformance(rows) {
  return groupedPerformance(rows, "Analista Responsável", "Analista")
    .sort((a, b) => (b.Finalizados - a.Finalizados) || (b.Chamados - a.Chamados))
    .slice(0, 20);
}

function groupedPerformance(rows, key, labelColumn) {
  const map = new Map();
  rows.forEach((r) => {
    const label = r[key] || "Não informado";
    const item = map.get(label) || {
      [labelColumn]: label,
      Chamados: 0,
      Finalizados: 0,
      "Em aberto": 0,
      durations: [],
    };
    item.Chamados += 1;
    item.Finalizados += r["Situação gerencial"] === "Finalizado" ? 1 : 0;
    item["Em aberto"] += r["Situação gerencial"] === "Em aberto" ? 1 : 0;
    if (typeof r["Tempo atendimento (h)"] === "number") item.durations.push(r["Tempo atendimento (h)"]);
    map.set(label, item);
  });

  return [...map.values()].map((item) => ({
    ...item,
    Saldo: signed(item.Chamados - item.Finalizados),
    "Mediana h": fmt1.format(median(item.durations)),
  }));
}

function ranking(rows, key, labelColumn) {
  const map = new Map();
  rows.forEach((r) => {
    const label = r[key] || "Não informado";
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([label, Chamados]) => ({ [labelColumn]: label, Chamados }));
}

function backlog(rows) {
  const today = new Date();
  return rows
    .filter((r) => r["Situação gerencial"] === "Em aberto")
    .map((r) => {
      const opened = new Date(String(r["Data de solicitação"]).replace(" ", "T"));
      const days = Number.isNaN(opened.getTime()) ? "" : Math.max(0, Math.floor((today - opened) / 86400000));
      return {
        "#": r["#"],
        Categoria: r["Categoria de terceiro nível"],
        Grupo: r["Grupo solucionador"],
        Status: r.Status,
        Localidade: r.Localidade,
        "Data de solicitação": r["Data de solicitação"],
        "Dias aberto": days,
        Título: r["Título"],
      };
    })
    .sort((a, b) => (b["Dias aberto"] || 0) - (a["Dias aberto"] || 0));
}

function aging(rows) {
  const openRows = backlog(rows);
  const buckets = [
    { Faixa: "0 a 7 dias", min: 0, max: 7 },
    { Faixa: "8 a 15 dias", min: 8, max: 15 },
    { Faixa: "16 a 30 dias", min: 16, max: 30 },
    { Faixa: "Acima de 30 dias", min: 31, max: Infinity },
  ];
  return buckets.map((bucket) => {
    const count = openRows.filter((r) => {
      const days = Number(r["Dias aberto"]);
      return days >= bucket.min && days <= bucket.max;
    }).length;
    return {
      Faixa: bucket.Faixa,
      Chamados: count,
      "% backlog": percent(count, openRows.length),
    };
  });
}

function renderCharts(rows, weeklyRows, agingRows) {
  renderWeeklyChart(rows, weeklyRows.slice(-10));
  renderBarChart(
    "categoryChart",
    categoryAttention(rows).slice(0, 8).map((row) => ({
      label: row.Categoria,
      value: row["Em aberto"],
      detail: () =>
        rows.filter(
          (r) =>
            (r["Categoria de terceiro nível"] || "Não informado") === row.Categoria &&
            r["Situação gerencial"] === "Em aberto"
        ),
      title: `Abertos - ${row.Categoria}`,
    })),
    "Chamados abertos"
  );
  renderBarChart(
    "agingChart",
    agingRows.map((row) => ({
      label: row.Faixa,
      value: row.Chamados,
      detail: () => rowsForAging(rows, row.Faixa),
      title: `Backlog ${row.Faixa}`,
    })),
    "Chamados"
  );
}

function renderWeeklyChart(rows, weeks) {
  const target = document.getElementById("weeklyChart");
  target.innerHTML = "";
  const maxValue = Math.max(1, ...weeks.map((row) => Math.max(row.Chamados, row.Finalizados)));
  const grid = document.createElement("div");
  grid.className = "weekly-chart";

  weeks.forEach((row) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "week-bars";
    button.title = `Semana ${row.Semana}/${row.Ano}`;
    button.addEventListener("click", () =>
      showDetails(`Semana ${row.Semana}/${row.Ano}`, rows.filter((r) => r["Ano solicitação"] === row.Ano && r["Semana do ano"] === row.Semana))
    );

    const opened = document.createElement("span");
    opened.className = "bar opened";
    opened.style.height = `${Math.max(6, (row.Chamados / maxValue) * 130)}px`;
    opened.textContent = row.Chamados;

    const closed = document.createElement("span");
    closed.className = "bar closed";
    closed.style.height = `${Math.max(6, (row.Finalizados / maxValue) * 130)}px`;
    closed.textContent = row.Finalizados;

    const label = document.createElement("small");
    label.textContent = `S${row.Semana}`;

    button.append(opened, closed, label);
    grid.appendChild(button);
  });

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = "<span><i class=\"opened-dot\"></i>Entraram</span><span><i class=\"closed-dot\"></i>Finalizados</span>";
  target.append(grid, legend);
}

function renderBarChart(id, items, metricLabel) {
  const target = document.getElementById(id);
  target.innerHTML = "";
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rank-bar";
    button.addEventListener("click", () => showDetails(item.title, item.detail()));

    const label = document.createElement("span");
    label.textContent = item.label;
    const track = document.createElement("b");
    track.style.width = `${Math.max(4, (item.value / maxValue) * 100)}%`;
    const value = document.createElement("strong");
    value.textContent = `${fmt.format(item.value)} ${metricLabel}`;

    button.append(label, track, value);
    target.appendChild(button);
  });
}

function rowsForAging(rows, faixa) {
  const ranges = {
    "0 a 7 dias": [0, 7],
    "8 a 15 dias": [8, 15],
    "16 a 30 dias": [16, 30],
    "Acima de 30 dias": [31, Infinity],
  };
  const [min, max] = ranges[faixa] || [0, Infinity];
  const today = new Date();
  return rows.filter((row) => {
    if (row["Situação gerencial"] !== "Em aberto") return false;
    const opened = new Date(String(row["Data de solicitação"]).replace(" ", "T"));
    if (Number.isNaN(opened.getTime())) return false;
    const days = Math.max(0, Math.floor((today - opened) / 86400000));
    return days >= min && days <= max;
  });
}

function percent(value, total) {
  if (!total) return "0%";
  return `${fmt1.format((value / total) * 100)}%`;
}

function signed(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${fmt.format(number)}` : fmt.format(number);
}

function deltaText(current, previous, suffix) {
  if (current === undefined || previous === undefined) return "sem comparação";
  const delta = Number(current) - Number(previous);
  return `${signed(delta)} ${suffix}`;
}

function balanceHint(value) {
  const balance = Number(value) || 0;
  if (balance > 0) return "backlog aumentou";
  if (balance < 0) return "backlog reduziu";
  return "backlog estável";
}

function meetingNarrative(total, closed, open, currentWeek, previousWeek, oldBacklog15) {
  if (!total) return "Carregue uma base para gerar a leitura semanal.";
  if (!currentWeek) return "Não há chamados com data de solicitação válida no filtro atual.";
  const balance = Number(String(currentWeek["Saldo da semana"]).replace("+", "")) || 0;
  const trend = previousWeek ? `, ${deltaText(currentWeek.Chamados, previousWeek.Chamados, "entradas vs semana anterior")}` : "";
  const balanceText = balance > 0 ? "aumentou" : balance < 0 ? "reduziu" : "ficou estável";
  return `Na semana ${currentWeek.Semana}, entraram ${fmt.format(currentWeek.Chamados)} chamados e ${fmt.format(currentWeek.Finalizados)} foram finalizados${trend}. O saldo ${balanceText}; há ${fmt.format(open)} chamados abertos, sendo ${fmt.format(oldBacklog15)} acima de 15 dias.`;
}

function renderTable(id, rows, columns, rowClass, rowClick) {
  tableModels[id] = { rows, columns, rowClass, rowClick };
  tableState[id] ||= { filter: "", sortColumn: null, sortDir: "asc" };
  ensureTableControls(id);
  drawTable(id);
}

function ensureTableControls(id) {
  const table = document.getElementById(id);
  const wrap = table.closest(".table-wrap");
  if (!wrap || wrap.querySelector(`#${id}Filter`)) return;

  const tools = document.createElement("div");
  tools.className = "table-tools";

  const input = document.createElement("input");
  input.id = `${id}Filter`;
  input.type = "search";
  input.placeholder = "Filtrar tabela...";
  input.value = tableState[id]?.filter || "";
  input.addEventListener("input", () => {
    tableState[id].filter = input.value;
    drawTable(id);
  });

  tools.appendChild(input);
  wrap.insertBefore(tools, table);
}

function drawTable(id) {
  const table = document.getElementById(id);
  const model = tableModels[id];
  const state = tableState[id];
  if (!model || !state) return;

  const { columns, rowClass, rowClick } = model;
  const rows = sortRows(filterRows(model.rows, columns, state.filter), state.sortColumn, state.sortDir);
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-button";
    button.textContent = `${col}${state.sortColumn === col ? (state.sortDir === "asc" ? " ↑" : " ↓") : ""}`;
    button.addEventListener("click", () => {
      if (state.sortColumn === col) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortColumn = col;
        state.sortDir = "asc";
      }
      drawTable(id);
    });
    th.appendChild(button);
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const line = document.createElement("tr");
    if (rowClass) {
      const className = rowClass(row);
      if (className) line.className = className;
    }
    if (rowClick) {
      line.classList.add("clickable-row");
      line.tabIndex = 0;
      line.addEventListener("click", () => rowClick(row));
      line.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          rowClick(row);
        }
      });
    }
    columns.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] ?? "";
      line.appendChild(td);
    });
    tbody.appendChild(line);
  });
  table.appendChild(tbody);
}

function filterRows(rows, columns, filter) {
  const term = String(filter || "").trim().toLowerCase();
  if (!term) return [...rows];
  return rows.filter((row) => columns.some((col) => String(row[col] ?? "").toLowerCase().includes(term)));
}

function sortRows(rows, column, dir) {
  if (!column) return rows;
  const direction = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => compareValues(a[column], b[column]) * direction);
}

function compareValues(a, b) {
  const leftNumber = numericValue(a);
  const rightNumber = numericValue(b);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
}

function numericValue(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/^\+/, "").replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?%?$/.test(normalized) ? Number(normalized.replace("%", "")) : null;
}

function showDetails(title, rows) {
  const panel = document.getElementById("detailPanel");
  const sorted = [...rows].sort((a, b) => String(b["Data de solicitação"]).localeCompare(String(a["Data de solicitação"])));
  panel.hidden = false;
  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailMeta").textContent = `${fmt.format(sorted.length)} chamados no detalhe selecionado.`;
  renderTable("detailTable", detailRows(sorted), ["#", "Categoria", "Subcategoria", "Status", "Analista", "Data solicitação", "Data encerramento", "Tempo h", "Título"]);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeDetail() {
  const panel = document.getElementById("detailPanel");
  if (panel) panel.hidden = true;
}

function detailRows(rows) {
  return rows.map((row) => ({
    "#": row["#"],
    Categoria: row["Categoria de terceiro nível"],
    Subcategoria: row.Subcategoria,
    Status: row.Status,
    Analista: row["Analista Responsável"],
    "Data solicitação": row["Data de solicitação"],
    "Data encerramento": row["Data de encerramento"],
    "Tempo h": row["Tempo atendimento (h)"] ?? "",
    Título: row["Título"],
  }));
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clearFilters() {
  document.querySelectorAll(".check-list input").forEach((input) => {
    input.checked = false;
  });
  document.getElementById("categoryMode").value = "include";
  renderDashboard();
}

function downloadCsv() {
  const rows = filteredRecords();
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csv = [columns.join(";")]
    .concat(rows.map((row) => columns.map((col) => csvCell(row[col])).join(";")))
    .join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ecargo_dados_filtrados.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
