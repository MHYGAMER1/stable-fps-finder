(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StableFPS = api;
})(globalThis, function () {
  "use strict";

  const MIN_FRAMES = 300;
  const MIN_SECONDS = 15;
  const TOLERANCE = { spikesPerMinute: 2, p99Ratio: 0.10, lowRatio: 0.05 };
  const TIME_HEADERS = new Set([
    "frametime", "frametimems", "mstime", "msbetweenpresents", "frametimeinms",
  ]);
  const FPS_HEADERS = new Set(["fps", "framerate", "instantaneousfps"]);
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

  function parseRows(text, delimiter, limit = Infinity) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    let closedQuote = false;
    function pushField() {
      row.push(field.trim());
      field = "";
      closedQuote = false;
    }
    function pushRow() {
      pushField();
      if (row.some(Boolean)) rows.push(row);
      row = [];
    }

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index++;
        } else if (char === '"') {
          quoted = false;
          closedQuote = true;
        } else {
          field += char;
        }
      } else if (char === delimiter) {
        pushField();
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && text[index + 1] === "\n") index++;
        pushRow();
        if (rows.length === limit) return rows;
      } else if (char === '"' && !field.trim() && !closedQuote) {
        field = "";
        quoted = true;
      } else if (char === '"' || (closedQuote && char.trim())) {
        throw new Error("Invalid quoting in CSV.");
      } else {
        field += char;
      }
    }
    if (quoted) throw new Error("Unclosed quote in CSV.");
    pushRow();
    return rows;
  }

  function parseNumber(cell, delimiter) {
    const text = delimiter === "," ? cell : cell.replace(",", ".");
    if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return NaN;
    return Number(text);
  }

  function parseCSV(input) {
    const text = input.replace(/^\uFEFF/, "");
    if (!text.trim()) throw new Error("The CSV file is empty.");
    let format;
    for (const delimiter of [",", ";", "\t"]) {
      try {
        const [header] = parseRows(text, delimiter, 1);
        const names = header.map(normalize);
        const timeColumns = names.filter((name) => TIME_HEADERS.has(name));
        if (timeColumns.length) {
          if (timeColumns.includes("msbetweenpresents") || timeColumns.length === 1) {
            format = { delimiter, names };
            break;
          }
          throw new Error("Ambiguous frame time columns.");
        }
      } catch (error) {
        if (error.message === "Ambiguous frame time columns.") throw error;
      }
    }
    if (!format) throw new Error("Missing frame time column in milliseconds.");
    const { delimiter, names } = format;
    const presentMon = names.includes("msbetweenpresents");
    const timeIndex = presentMon ? names.indexOf("msbetweenpresents")
      : names.findIndex((name) => TIME_HEADERS.has(name));
    const fpsIndex = names.findIndex((name) => FPS_HEADERS.has(name));
    const streamIndexes = ["processid", "application", "swapchainaddress"]
      .map((name) => names.indexOf(name)).filter((index) => index >= 0);
    const rows = parseRows(text, delimiter);
    const frames = [];
    const suppliedFPS = [];
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index];
      if (row.length !== names.length) throw new Error("Record " + (index + 1) + ": wrong column count.");
      if (streamIndexes.some((column) => row[column] !== rows[1][column])) {
        throw new Error("Multiple processes or swap chains. Export one stream per CSV.");
      }
      const milliseconds = parseNumber(row[timeIndex], delimiter);
      const fps = fpsIndex < 0 ? null : parseNumber(row[fpsIndex], delimiter);
      if (presentMon && index === 1 && milliseconds === 0 && (fps === null || fps === 0)) continue;
      if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !Number.isFinite(1000 / milliseconds)) {
        throw new Error("Record " + (index + 1) + ": frame time must be a positive finite value in ms.");
      }
      if (fps !== null && (!Number.isFinite(fps) || fps < 0)) {
        throw new Error("Record " + (index + 1) + ": FPS must be a finite non-negative value.");
      }
      frames.push(milliseconds);
      if (fps !== null) suppliedFPS.push(fps);
    }
    if (!frames.length) throw new Error("No frame samples found.");
    return { frames, inputFPS: suppliedFPS.length ? mean(suppliedFPS) : null };
  }

  function median(sorted) {
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
  }

  function analyze(frames) {
    if (!frames.length || !frames.every((time) => Number.isFinite(time) && time > 0)) {
      throw new Error("A capture must contain positive finite frame times.");
    }
    const sorted = [...frames].sort((a, b) => a - b);
    const count = frames.length;
    const total = frames.reduce((sum, time) => sum + time, 0);
    if (!Number.isFinite(total)) throw new Error("Frame times exceed the supported range.");
    const seconds = total / 1000;
    const averageTime = total / count;
    const center = median(sorted);
    const p99 = sorted[Math.ceil(count * 0.99) - 1];
    const averageFPS = 1000 / averageTime;
    const lowFPS = 1000 / mean(sorted.slice(-Math.ceil(count * 0.01)));
    const deviation = Math.sqrt(mean(frames.map((time) => (time - averageTime) ** 2)));
    if (![averageFPS, lowFPS, p99 / center, deviation].every(Number.isFinite)) {
      throw new Error("Frame times exceed the supported range.");
    }
    const spikes = [];
    let events = 0;
    frames.forEach((time, index) => {
      const previous = frames.slice(Math.max(0, index - 30), index);
      const baseline = previous.length >= 6 ? median(previous.sort((a, b) => a - b)) : center;
      if (time >= Math.max(baseline * 1.5, baseline + 6)) {
        if (!spikes.length || spikes[spikes.length - 1] !== index - 1) events++;
        spikes.push(index);
      }
    });
    return {
      count, seconds, averageFPS, lowFPS, p99, median: center, deviation,
      p99Ratio: p99 / center, lowRatio: lowFPS / averageFPS,
      spikes, events, spikesPerMinute: events * 60 / seconds,
      eligible: count >= MIN_FRAMES && seconds >= MIN_SECONDS,
    };
  }

  function compare(runs) {
    const byCap = new Map();
    for (const { cap, stats } of runs) {
      if (!stats.eligible || !Number.isInteger(cap) || cap < 1 || cap > 2000) continue;
      if (!byCap.has(cap)) byCap.set(cap, []);
      byCap.get(cap).push(stats);
    }
    const keys = ["averageFPS", "lowFPS", "spikesPerMinute", "p99Ratio", "lowRatio"];
    const groups = Array.from(byCap, ([cap, stats]) => {
      const metrics = Object.fromEntries(keys.map((key) => [key, median(stats.map((item) => item[key]).sort((a, b) => a - b))]));
      return { cap, runs: stats.length, ...metrics };
    }).sort((a, b) => b.cap - a.cap);
    if (groups.length < 2) return { groups, winner: null };

    const fewestSpikes = Math.min(...groups.map((group) => group.spikesPerMinute));
    const quiet = groups.filter((group) => group.spikesPerMinute <= fewestSpikes + TOLERANCE.spikesPerMinute);
    const bestP99 = Math.min(...quiet.map((group) => group.p99Ratio));
    const consistent = quiet.filter((group) => group.p99Ratio <= bestP99 + TOLERANCE.p99Ratio);
    const bestLow = Math.max(...consistent.map((group) => group.lowRatio));
    const finalists = consistent.filter((group) => group.lowRatio >= bestLow - TOLERANCE.lowRatio);
    finalists.sort((a, b) => b.averageFPS - a.averageFPS || b.lowFPS - a.lowFPS || a.cap - b.cap);
    return { groups, winner: finalists[0] };
  }

  return { parseCSV, analyze, compare, MIN_FRAMES, MIN_SECONDS };
});
