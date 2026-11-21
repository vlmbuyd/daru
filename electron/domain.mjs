// src/domain.ts
var today = (now = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
var addDays = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
function blank(date = "", time = "") {
  return { id: crypto.randomUUID(), title: "", kind: time ? "event" : "task", date, time, duration: 60, list: "\uBC1B\uC740\uD568", tags: "", priority: "\uBCF4\uD1B5", done: false, source: "\uC9C1\uC811 \uC785\uB825", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
function parse(line, base = today()) {
  const item = blank();
  item.title = line.trim();
  item.routine = /매일|매주|루틴|반복/.test(line);
  item.deadline = /마감/.test(line);
  item.source = line;
  const warnings = [];
  item.kind = /^(메모|아이디어)\s*[:：]/.test(line) ? "note" : /회의|약속|미팅/.test(line) ? "event" : "task";
  const dates = [];
  for (const [word, n] of [["\uC624\uB298", 0], ["\uB0B4\uC77C", 1], ["\uBAA8\uB808", 2]]) if (line.includes(word)) dates.push(addDays(base, n));
  const absolute = line.match(/\d{4}-\d{2}-\d{2}/g) || [];
  for (const date of absolute) {
    if (validDate(date)) dates.push(date);
    else warnings.push("\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uB0A0\uC9DC\uC785\uB2C8\uB2E4.");
  }
  if (new Set(dates).size === 1) item.date = dates[0];
  else if (dates.length > 1) warnings.push("\uB0A0\uC9DC \uD45C\uD604\uC774 \uCDA9\uB3CC\uD569\uB2C8\uB2E4. \uB0A0\uC9DC\uB97C \uACE8\uB77C \uC8FC\uC138\uC694.");
  if (/다음|이번|주말|요일|\d+월|\d+일/.test(line.replace(/\d{4}-\d{2}-\d{2}/g, ""))) warnings.push("\uC0C1\uB300 \uB0A0\uC9DC\xB7\uC694\uC77C\xB7\uC5F0\uB3C4 \uC5C6\uB294 \uB0A0\uC9DC\uB294 \uC9C1\uC811 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  const times = [...line.matchAll(/(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분)?)/g)];
  if (times.length === 1) {
    const [, amp, h, m, m2] = times[0];
    let hour = Number(h);
    const minute = Number(m || m2 || 0);
    if (hour > 23 || minute > 59 || amp && (hour < 1 || hour > 12)) warnings.push("\uC2DC\uAC04 \uBC94\uC704\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    else if (!amp && hour >= 1 && hour <= 12 && !m) warnings.push("\uC624\uC804\xB7\uC624\uD6C4\uAC00 \uBAA8\uD638\uD569\uB2C8\uB2E4. \uC2DC\uAC04\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.");
    else {
      if (amp) hour = hour % 12 + (amp === "\uC624\uD6C4" ? 12 : 0);
      item.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  } else if (times.length > 1) warnings.push("\uC5EC\uB7EC \uC2DC\uAC04 \uD45C\uD604\uC740 \uC9C1\uC811 \uC2DC\uC791 \uC2DC\uAC01\uACFC \uAE38\uC774\uB97C \uC815\uD574 \uC8FC\uC138\uC694.");
  if (/아침|저녁|점심|밤|쯤|언젠가/.test(line)) warnings.push("\uBAA8\uD638\uD55C \uC2DC\uAC04 \uD45C\uD604\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
  if (item.time && !item.date) warnings.push("\uC2DC\uAC04\uC5D0 \uD574\uB2F9\uD558\uB294 \uB0A0\uC9DC\uB97C \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.");
  if (item.kind === "note") {
    item.date = "";
    item.time = "";
  }
  return { item, warnings };
}
function validate(items) {
  if (!Array.isArray(items) || items.length > 1e4) throw Error("\uC798\uBABB\uB41C \uB370\uC774\uD130");
  const ids = /* @__PURE__ */ new Set();
  for (const x of items) {
    if (x?.category !== void 0 && typeof x.category !== "string" || x?.color !== void 0 && !/^#[0-9a-fA-F]{6}$/.test(x.color) || x?.monthly !== void 0 && typeof x.monthly !== "boolean" || x?.routine !== void 0 && typeof x.routine !== "boolean" || x?.deadline !== void 0 && typeof x.deadline !== "boolean") throw Error("\uBD84\uB958 \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    if (!x || typeof x.id !== "string" || ids.has(x.id) || typeof x.title !== "string" || !x.title.trim() || x.title.length > 2e3 || !["task", "event", "note"].includes(x.kind) || typeof x.date !== "string" || x.date && !validDate(x.date) || typeof x.time !== "string" || x.time && (!x.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)) || !Number.isInteger(x.duration) || x.duration < 15 || x.duration > 1440 || typeof x.done !== "boolean" || !["\uBCF4\uD1B5", "\uB192\uC74C"].includes(x.priority) || ["list", "tags", "source", "updatedAt"].some((k) => typeof x[k] !== "string")) throw Error("\uD56D\uBAA9\uC758 \uC81C\uBAA9\xB7\uB0A0\uC9DC\xB7\uC2DC\uAC04\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    ids.add(x.id);
  }
}
function matches(x, filter, base = today()) {
  const monday = addDays(base, -(((/* @__PURE__ */ new Date(base + "T12:00:00Z")).getUTCDay() + 6) % 7));
  return filter === "\uC804\uCCB4" || filter === "\uC624\uB298" && x.date === base || filter === "\uC774\uBC88 \uC8FC" && x.date >= monday && x.date <= addDays(monday, 6) || filter === "\uB0A0\uC9DC \uC5C6\uC74C" && !x.date;
}
function overlaps(item, items) {
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return !!item.time && items.some((x) => x.id !== item.id && !x.done && x.date === item.date && x.time && min(item.time) < min(x.time) + x.duration && min(x.time) < min(item.time) + item.duration);
}
var minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
var clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
function changeTime(item, mode, date, minute) {
  const next = { ...item, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  minute = Math.round(minute / 15) * 15;
  if (mode === "move") {
    if (minute + item.duration > 1440) throw Error("\uB2E4\uC74C \uB0A0\uAE4C\uC9C0 \uC774\uC5B4\uC9C0\uB294 \uC774\uB3D9\uC740 \uC544\uC9C1 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC544\uC694.");
    if (minute < 0 || minute > 1425) throw Error("\uC2DC\uC791 \uC2DC\uAC04\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.");
    next.date = date;
    next.time = clock(minute);
  } else {
    if (!item.time || date !== item.date) throw Error("\uAC19\uC740 \uB0A0\uC9DC \uC548\uC5D0\uC11C \uC870\uC808\uD574 \uC8FC\uC138\uC694.");
    const start = minutes(item.time), end = start + item.duration;
    if (mode === "resize-start") {
      if (minute < 0 || minute > end - 15 || minute > 1425) throw Error("\uC2DC\uC791\uC740 \uC885\uB8CC\uBCF4\uB2E4 \uBE68\uB77C\uC57C \uD574\uC694.");
      next.time = clock(minute);
      next.duration = end - minute;
    } else {
      if (minute < start + 15 || minute > 1440) throw Error("\uC885\uB8CC\uB294 \uC2DC\uC791\uBCF4\uB2E4 \uB2A6\uC5B4\uC57C \uD574\uC694.");
      next.duration = minute - start;
    }
  }
  validate([next]);
  return next;
}
var categories = { \uACF5\uBD80: "#70879D", \uCDE8\uC5C5: "#887998", \uD504\uB85C\uC81D\uD2B8: "#708D7C", \uC0DD\uD65C: "#9B876E", \uBBF8\uBD84\uB958: "#899098" };
function monthShift(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function monthDates(month) {
  const first = month + "-01";
  const offset = (/* @__PURE__ */ new Date(first + "T12:00:00Z")).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
}
function inMonthView(x) {
  return x.monthly ?? (!x.routine && (x.kind === "event" || x.priority === "\uB192\uC74C" || !!x.deadline));
}
export {
  addDays,
  blank,
  categories,
  changeTime,
  clock,
  inMonthView,
  matches,
  minutes,
  monthDates,
  monthShift,
  overlaps,
  parse,
  today,
  validDate,
  validate
};
