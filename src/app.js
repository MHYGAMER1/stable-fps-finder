(() => {
  "use strict";

  const { parseCSV, analyze, compare } = window.StableFPS;
  const $ = (id) => document.getElementById(id);
  const runs = [];
  const MAX_FILES = 24;
  const MAX_BYTES = 16 * 1024 * 1024;
  const arabicErrors = new Map([
    ["The CSV file is empty.", "الملف فارغ."],
    ["Ambiguous frame time columns.", "الملف يحتوي على أكثر من عمود لزمن الإطار."],
    ["Missing frame time column in milliseconds.", "أضف عمود Frame Time (ms) بالمللي ثانية."],
    ["Multiple processes or swap chains. Export one stream per CSV.", "صدّر بيانات اللعبة من سلسلة عرض واحدة لكل ملف."],
    ["No frame samples found.", "ما لقينا إطارات في الملف."],
    ["Invalid quoting in CSV.", "علامات الاقتباس في الملف غير صالحة."],
    ["Unclosed quote in CSV.", "فيه علامة اقتباس مفتوحة في الملف."],
    ["Frame times exceed the supported range.", "قيم زمن الإطار تتجاوز النطاق المدعوم."],
    ["File is too large.", "الحد الأقصى لحجم الملف 16 MiB."],
  ]);
  const format = (value, digits = 2) => value.toFixed(digits);
  let nextId = 1;
  let selectedId = 0;
  let importing = false;
  let language = "ar";
  let statusMessage = () => t("إذا ما عندك تسجيلات، ابدأ بالتجربة الافتراضية.");
  let errorMessages = [];
  const labels = Array.from(document.querySelectorAll("[data-localize]"), (node) => [node, node.textContent]);

  function t(arabic, values = {}) {
    const phrase = language === "en" ? window.StableEnglish[arabic] ?? arabic : arabic;
    return phrase.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  }

  function setStatus(message) {
    statusMessage = message;
    $("status").textContent = message();
  }

  function element(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }

  function cells(row, values) {
    for (const value of values) {
      const cell = row.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
    }
  }

  function runValues(run) {
    const { stats } = run;
    return [
      format(stats.seconds, 1) + " s · " + stats.count,
      format(stats.averageFPS), format(stats.lowFPS), format(stats.p99),
      format(stats.deviation), format(stats.spikesPerMinute),
    ];
  }

  function addRun(name, csv, cap = null, demo = false) {
    const { frames } = parseCSV(csv);
    runs.push({ id: nextId++, demo, name, frames, cap, stats: analyze(frames) });
  }

  function showErrors(errors) {
    errorMessages = errors;
    $("errors").replaceChildren(...errors.map((message) => element("li", message())));
    $("errors").hidden = !errors.length;
  }

  function groupValues(group) {
    return [group.cap, group.runs, format(group.averageFPS), format(group.lowFPS),
      format(group.spikesPerMinute), format(group.p99Ratio, 3), format(group.lowRatio * 100, 1) + "%"];
  }

  function renderComparison() {
    const { winner, groups } = compare(runs);
    $("result-value").textContent = winner ? winner.cap + " FPS" : "—";
    $("result-value").dir = "ltr";
    const mixed = runs.some((run) => run.demo) && runs.some((run) => !run.demo);
    const excluded = runs.filter((run) => !run.stats.eligible || run.cap === null).length;
    const note = excluded ? t(" التسجيلات المستبعدة من المقارنة {count}.", { count: excluded }) : "";
    if (mixed) $("result-value").textContent = "—";
    $("result-detail").textContent = mixed
      ? t("احذف التسجيلات الافتراضية قبل مقارنة تسجيلات لعبك.")
      : winner
        ? t("متوسط الأداء الفعلي {avg} FPS، ونتيجة 1% Low تساوي {low} FPS. أحداث التقطيع في الدقيقة {events}. التوصية تخص التسجيلات المستوردة.", { avg: format(winner.averageFPS, 1), low: format(winner.lowFPS, 1), events: format(winner.spikesPerMinute, 1) }) + note
        : t("أضف تسجيلين بحدّين مختلفين، لكل تسجيل 15 ثانية و300 إطار على الأقل.") + note;
    const rows = mixed ? [] : groups.map((group) => {
      const row = element("tr", undefined, group.cap === winner?.cap ? "best-row" : "");
      cells(row, groupValues(group));
      return row;
    });
    $("cap-details").hidden = !rows.length;
    $("groups").replaceChildren(...rows);
  }

  function actionButton(label, action, name) {
    const button = element("button", label);
    button.type = "button";
    button.setAttribute("aria-label", label + " " + name);
    button.addEventListener("click", action);
    return button;
  }

  function renderRuns() {
    const rows = runs.map((run) => {
      const row = element("tr");
      const name = element("bdi", run.name);
      const capField = element("input");
      capField.type = "number";
      capField.min = "1";
      capField.max = "2000";
      capField.step = "1";
      capField.dir = "ltr";
      capField.placeholder = "FPS";
      capField.value = run.cap ?? "";
      capField.setAttribute("aria-label", t("حد FPS لتسجيل ") + run.name);
      capField.addEventListener("input", () => {
        const value = capField.valueAsNumber;
        const valid = Number.isInteger(value) && value >= 1 && value <= 2000;
        capField.setAttribute("aria-invalid", String(!valid && (capField.value !== "" || capField.validity.badInput)));
        run.cap = valid ? value : null;
        renderComparison();
      });
      const actions = element("div", undefined, "row-actions");
      actions.append(
        actionButton(t("رسم"), () => {
          selectedId = run.id;
          renderChart();
          $("chart-select").focus();
        }, run.name),
        actionButton(t("حذف"), () => {
          runs.splice(runs.indexOf(run), 1);
          render();
          setStatus(() => t("انحذف التسجيل ") + run.name + ".");
          $("import-button").focus();
        }, run.name),
      );
      cells(row, [name, capField, ...runValues(run), actions]);
      return row;
    });
    $("runs").replaceChildren(...rows);
    $("runs-table").hidden = !runs.length;
    $("empty-runs").hidden = Boolean(runs.length);
    $("export").disabled = !runs.length;
  }

  function drawChart(canvas, run) {
    const context = canvas.getContext("2d");
    const { width, height } = canvas;
    const bounds = { left: 68, top: 24, right: width - 24, bottom: height - 45 };
    const { frames, stats } = run;
    const maximum = frames.reduce((max, time) => Math.max(max, time), 0) * 1.07;
    const total = stats.seconds * 1000;
    const y = (time) => bounds.bottom - (time / maximum) * (bounds.bottom - bounds.top);
    const label = (value) => (value > 0 && (value < 0.01 || value >= 10000) ? value.toExponential(1) : format(value, 1));
    context.direction = "ltr";
    context.fillStyle = "#101827";
    context.fillRect(0, 0, width, height);
    context.font = '15px "Segoe UI", sans-serif';
    context.textAlign = "right";
    context.fillStyle = "#b0bdd2";
    context.strokeStyle = "#34435d";
    context.lineWidth = 1;
    for (let tick = 0; tick <= 4; tick++) {
      const time = maximum * tick / 4;
      const vertical = y(time);
      context.beginPath();
      context.moveTo(bounds.left, vertical);
      context.lineTo(bounds.right, vertical);
      context.stroke();
      context.fillText(label(time) + " ms", bounds.left - 7, vertical + 4);
    }
    context.textAlign = "center";
    for (let tick = 0; tick <= 4; tick++) {
      const horizontal = bounds.left + (bounds.right - bounds.left) * tick / 4;
      context.fillText(label(stats.seconds * tick / 4) + " s", horizontal, bounds.bottom + 25);
    }

    const numberOfBins = bounds.right - bounds.left;
    const bins = Array.from({ length: numberOfBins + 1 }, () => ({ min: Infinity, max: 0, spike: 0 }));
    const spikes = new Set(stats.spikes);
    let elapsed = 0;
    frames.forEach((time, index) => {
      elapsed += time;
      const bucket = bins[Math.min(numberOfBins, Math.floor((elapsed / total) * numberOfBins))];
      bucket.min = Math.min(bucket.min, time);
      bucket.max = Math.max(bucket.max, time);
      if (spikes.has(index)) bucket.spike = Math.max(bucket.spike, time);
    });
    context.strokeStyle = "#83ecc8";
    context.lineWidth = 1.5;
    context.beginPath();
    let hasPoints = false;
    bins.forEach((bin, index) => {
      if (!bin.max) return;
      const x = bounds.left + index;
      if (hasPoints) context.lineTo(x, y(bin.min));
      else context.moveTo(x, y(bin.min));
      context.lineTo(x, y(bin.max));
      hasPoints = true;
    });
    context.stroke();
    context.fillStyle = "#ffc092";
    bins.forEach((bin, index) => {
      if (!bin.spike) return;
      context.beginPath();
      context.arc(bounds.left + index, y(bin.spike), 2.75, 0, Math.PI * 2);
      context.fill();
    });
  }

  function renderChart() {
    const run = runs.find((entry) => entry.id === selectedId) ?? runs[0];
    selectedId = run?.id ?? 0;
    $("chart-select").value = String(selectedId);
    $("chart-content").hidden = !run;
    $("empty-chart").hidden = Boolean(run);
    if (!run) return;
    drawChart($("chart"), run);
    $("chart-caption").textContent = t("أحداث التقطيع المرصودة {events}، والإطارات الطويلة {frames}.", { events: run.stats.events, frames: run.stats.spikes.length });
    $("chart").setAttribute("aria-label", t("زمن الإطار لتسجيل ") + run.name + ". " + $("chart-caption").textContent);
  }

  function render() {
    renderRuns();
    renderComparison();
    $("chart-select").replaceChildren(...runs.map((run) => new Option(run.name, String(run.id))));
    $("chart-select").disabled = !runs.length;
    renderChart();
  }

  function exportReport() {
    const report = document.implementation.createHTMLDocument("Stable FPS Finder v0.1.2");
    report.documentElement.lang = language;
    report.documentElement.dir = document.documentElement.dir;
    const charset = report.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    report.head.prepend(charset);
    const viewport = report.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    const style = report.createElement("style");
    style.textContent = "body{font:16px/1.6 'Segoe UI',sans-serif;color:#13223a;margin:24px} main{max-width:1080px;margin:auto} table{width:100%;border-collapse:collapse;white-space:nowrap} th,td{padding:6px;border-bottom:1px solid #a6afbd;text-align:start} section{overflow:auto} img{width:100%;height:auto} h3{overflow-wrap:anywhere} figure{margin:10px 0 28px} @media print{figure{break-inside:avoid}}";
    report.head.append(viewport, style);
    const main = element("main");
    const title = element("h1", "Stable FPS Finder v0.1.2 · by @MHYGAMER1");
    title.dir = "ltr";
    main.append(title, element("h2", t("حد الإطارات الموصى بضبطه") + " · " + $("result-value").textContent),
      element("p", $("result-detail").textContent), element("h2", t("نتائج التسجيلات")));
    if (runs.some((run) => run.demo)) main.append(element("p", t("يتضمن بيانات افتراضية.")));
    const table = $("runs-table").querySelector("table").cloneNode(true);
    table.tHead.rows[0].deleteCell(-1);
    Array.from(table.tBodies[0].rows).forEach((row, index) => {
      row.cells[1].textContent = runs[index].cap ?? "—";
      row.deleteCell(-1);
    });
    const runSection = element("section");
    runSection.append(table);
    main.append(runSection);
    if (!$("cap-details").hidden) {
      const groupSection = element("section");
      groupSection.append(element("h2", t("نتائج المقارنة حسب الحد")), $("cap-details").querySelector("table").cloneNode(true));
      main.append(groupSection);
    }
    const canvas = element("canvas");
    canvas.width = $("chart").width;
    canvas.height = $("chart").height;
    for (const run of runs) {
      drawChart(canvas, run);
      const figure = element("figure");
      const image = element("img");
      image.src = canvas.toDataURL("image/png");
      image.alt = t("زمن الإطار لتسجيل ") + run.name;
      figure.append(element("h3", run.name), image, element("figcaption",
        t("الخط الأخضر لزمن الإطار والنقاط البرتقالية للإطارات الطويلة. الأحداث المرصودة {events}.", { events: run.stats.events })));
      main.append(figure);
    }
    main.append(element("h2", t("طريقة الحساب")), ...Array.from($("method").querySelectorAll("p"), (p) => p.cloneNode(true)));
    report.body.append(main);
    const link = element("a");
    const url = URL.createObjectURL(new Blob(["<!doctype html>\n" + report.documentElement.outerHTML], { type: "text/html;charset=utf-8" }));
    link.href = url;
    link.download = "stable-fps-report.html";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(() => t("تم طلب حفظ التقرير."));
  }

  $("import-button").addEventListener("click", () => $("files").click());
  $("files").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files);
    event.target.value = "";
    if (!files.length || importing) return;
    importing = true;
    $("demo").disabled = $("import-button").disabled = true;
    setStatus(() => t("جاري تحليل الملفات…"));
    const errors = [];
    let imported = 0;
    try {
      for (const file of files) {
        if (runs.length >= MAX_FILES) {
          errors.push(() => t("الحد الأقصى {count} تسجيلًا. احذف تسجيلات قديمة لإضافة المزيد.", { count: MAX_FILES }));
          break;
        }
        try {
          if (file.size > MAX_BYTES) throw new Error("File is too large.");
          const bytes = await file.arrayBuffer();
          const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
          const utf16 = (signature[0] === 255 && signature[1] === 254)
            || (signature[0] === 254 && signature[1] === 255);
          const encoding = utf16 ? (signature[0] === 255 ? "utf-16le" : "utf-16be") : "utf-8";
          addRun(file.name, new TextDecoder(encoding).decode(bytes));
          imported++;
        } catch (error) {
          errors.push(() => file.name + " · " + (t(arabicErrors.get(error.message) ?? error.message)));
        }
      }
      showErrors(errors);
      render();
      setStatus(() => imported ? t("تم استيراد {count} من {total} ملفات.", { count: imported, total: files.length }) : t("تعذّر استيراد الملفات المحددة."));
    } finally {
      importing = false;
      $("demo").disabled = $("import-button").disabled = false;
    }
  });

  $("demo").addEventListener("click", () => {
    if (runs.some((run) => run.demo)) {
      setStatus(() => t("التجربة الافتراضية محمّلة بالفعل."));
      return;
    }
    if (runs.length) {
      setStatus(() => t("افتح الأداة في تبويب جديد لتجربة البيانات الافتراضية."));
      return;
    }
    window.StableDemo.forEach(({ name, csv, cap }) => addRun(name, csv, cap, true));
    selectedId = runs.find((run) => run.cap === 90).id;
    showErrors([]);
    render();
    setStatus(() => t("تم تحميل ثلاث تسجيلات افتراضية عند 40 و60 و90 FPS."));
  });
  $("chart-select").addEventListener("change", (event) => {
    selectedId = Number(event.target.value);
    renderChart();
  });
  $("export").addEventListener("click", exportReport);
  $("language").addEventListener("click", () => {
    language = language === "ar" ? "en" : "ar";
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    $("language").textContent = language === "ar" ? "English" : "العربية";
    $("language").lang = language === "ar" ? "en" : "ar";
    for (const [node, arabic] of labels) node.textContent = t(arabic);
    setStatus(statusMessage);
    showErrors(errorMessages);
    render();
  });
})();
