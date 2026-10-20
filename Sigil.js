.pragma library

// The machine drawn twice from one model. Every ring is a list of marks in
// (u, w): u runs along the ring 0..1, w across it from -1 (inner / bottom) to
// 1 (outer / top). Projected onto circles that is the sigil; projected onto
// straight rows it is the strip; anything in between is the knead.

var TAU = Math.PI * 2

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function lerp(a, b, k) { return a + (b - a) * k }
function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }

function hashStr(s) {
    var h = 2166136261 >>> 0
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    return h
}
function rng(seed) {
    var a = seed >>> 0
    return function() {
        a = (a + 0x6D2B79F5) >>> 0
        var t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
function rgbOf(hex) {
    var n = parseInt(String(hex).slice(1, 7), 16)
    return [n >> 16 & 255, n >> 8 & 255, n & 255]
}
function alpha(hex, a) { var c = rgbOf(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")" }
function mix(h1, h2, k) {
    var a = rgbOf(h1), b = rgbOf(h2)
    return "#" + a.map(function(v, i) { return ("0" + Math.round(lerp(v, b[i], k)).toString(16)).slice(-2) }).join("")
}

// The theme's colours.toml: the accent, a colour per section, and a dimmed
// foreground for labels.
function palette(toml) {
    var v = {}
    String(toml).split("\n").forEach(function(line) {
        // The same pattern as the shell's Color: quoted or bare #rrggbb.
        var m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*["']?(#[0-9A-Fa-f]{6})/)
        if (m) v[m[1].toLowerCase()] = m[2]
    })
    var pick = function() { for (var i = 0; i < arguments.length; i++) if (v[arguments[i]]) return v[arguments[i]]; return "" }
    var fg = pick("foreground", "color7") || "#cacccc", bg = pick("background", "color0") || "#101315"
    var accent = pick("accent", "color4") || fg
    var blue = pick("blue", "color4") || accent, yellow = pick("yellow", "color3") || accent
    var magenta = pick("magenta", "color5") || pick("red", "color1") || accent
    var bc = rgbOf(bg), light = (0.2126 * bc[0] + 0.7152 * bc[1] + 0.0722 * bc[2]) / 255 > 0.5
    return { fg: fg, dim: mix(fg, bg, 0.34), accent: accent, cat: { hw: blue, sw: yellow, age: magenta }, light: light }
}

// ---------------------------------------------------------------- the rings

var CATS = ["hw", "sw", "age"]
// How far the other rings and rows fade while one is picked.
var DIM_RING = 0.35
var DIM_TEXT = 0.6
var CAT_NAME = { hw: "Hardware", sw: "Software", age: "Age / Uptime" }
var RINGS = [
    { k: "cores",   cat: "hw",  name: "CPU",      r: [0.03, 0.12] },
    { k: "threads", cat: "hw",  name: "Threads",  r: [0.13, 0.25] },
    { k: "gpu",     cat: "hw",  name: "GPU",      r: [0.26, 0.30] },
    { k: "mem",     cat: "hw",  name: "Memory",   r: [0.305, 0.35] },
    { k: "disk",    cat: "hw",  name: "Disk",     r: [0.355, 0.40] },
    { k: "hz",      cat: "hw",  name: "Display",  r: [0.405, 0.465] },
    { k: "pkgs",    cat: "sw",  name: "Packages", r: [0.515, 0.585] },
    { k: "upd",     cat: "sw",  name: "Upgrades", r: [0.59, 0.635] },
    { k: "theme",   cat: "sw",  name: "Theme",    r: [0.64, 0.685] },
    { k: "themes",  cat: "sw",  name: "Themes",   r: [0.69, 0.74] },
    { k: "plugins", cat: "sw",  name: "Plugins",  r: [0.745, 0.79] },
    { k: "age",     cat: "age", name: "OS age",   r: [0.835, 0.87] },
    { k: "since",   cat: "age", name: "Updated",  r: [0.88, 0.915], fixed: true },
    { k: "up",      cat: "age", name: "Uptime",   r: [0.925, 0.995], fixed: true }
]
var RK = {}
RINGS.forEach(function(r, i) { RK[r.k] = i })
// Thin dividers between the sections, in the sigil only.
var SEPS = [["hw", 0.49], ["sw", 0.812]]

// ------------------------------------------------------------- machine facts

var GIB = 1073741824

function num(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") }
function size(bytes) {
    var g = bytes / GIB
    return g >= 1000 ? (g / 1024).toFixed(2) + " TiB" : g.toFixed(2) + " GiB"
}
function sizeShort(bytes) {
    var g = bytes / GIB
    return g >= 1000 ? (g / 1024).toFixed(1) + " T" : Math.round(g) + " G"
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
function day(epoch) { var d = new Date(epoch * 1000); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() }
function stamp(epoch) {
    var d = new Date(epoch * 1000)
    return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + ", " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)
}
function ago(hours) {
    if (hours < 1) return Math.max(1, Math.round(hours * 60)) + " min ago"
    if (hours < 48) return Math.floor(hours) + " h ago"
    return Math.floor(hours / 24) + " days ago"
}

// Everything derived from one reading of the helper. `elapsed` is the
// seconds since that reading, so uptime and "updated" keep ticking.
function facts(m, elapsed) {
    var now = m.now + elapsed
    var f = {}
    f.days = m.installed > 0 ? Math.max(0, Math.floor((now - m.installed) / 86400)) : 0
    f.upKnown = m.uptime !== null && m.uptime !== undefined
    f.upSec = (m.uptime || 0) + elapsed
    f.sinceH = m.lastUpgrade > 0 ? Math.max(0, (now - m.lastUpgrade) / 3600) : -1
    f.mem = m.memory.total > 0 ? (m.memory.used || 0) / m.memory.total : 0
    f.disk = m.disk.total > 0 ? (m.disk.used || 0) / m.disk.total : 0
    f.pulses = m.display.hz > 0 ? Math.max(1, Math.round(m.display.hz / 10)) : 0
    f.gpuUnit = m.gpu.cores ? GPU_UNITS[m.gpu.driver] || null : null
    f.gpuBy = f.gpuUnit ? "cores" : m.gpu.vram ? "vram" : ""
    f.squares = f.gpuUnit ? Math.max(1, Math.round(m.gpu.cores / f.gpuUnit.per)) : m.gpu.vram ? Math.round(m.gpu.vram / GIB) : 0
    f.squares = clamp(f.squares, 0, 192)
    f.weeks = Math.ceil(f.days / 7)
    // How much each mark of the counted rings stands for, and how many marks.
    f.per = { cores: perMark("cores", m.cpu.cores), threads: perMark("threads", m.cpu.threads),
              pkgs: perMark("pkgs", m.packages.pacman), upd: perMark("upd", m.upgrades), age: perMark("age", f.weeks) }
    f.lines = { cores: lines(m.cpu.cores, f.per.cores), threads: lines(m.cpu.threads, f.per.threads),
                pkgs: lines(m.packages.pacman, f.per.pkgs), upd: lines(m.upgrades, f.per.upd), age: lines(f.weeks, f.per.age) }
    f.pkgSizes = !!(m.packages.sizes && m.packages.sizes.length)
    f.weekly = !!(m.upgradesByWeek && m.upgradesByWeek.length)
    return f
}

// fastfetch's GPU core count is a different unit for each driver: NVIDIA's
// CUDA cores, AMD's compute units (64 shader cores each), Intel's execution
// units (8 lanes each). A dot is one block of about that size: 128 CUDA
// cores (an SM), one compute unit, 8 execution units. Other drivers' counts
// (nouveau, asahi) aren't comparable, so those draw their VRAM instead.
var GPU_UNITS = {
    nvidia: { per: 128, word: "core", long: "shader cores" },
    amdgpu: { per: 1, word: "CU", long: "compute units" },
    radeon: { per: 1, word: "CU", long: "compute units" },
    i915:   { per: 8, word: "EU", long: "execution units" },
    xe:     { per: 8, word: "EU", long: "execution units" }
}

// A counted ring gets coarser once its count would crowd it: a mark then
// stands for the next step up (a 64-core CPU draws 16 lines of 4 cores,
// years of upgrades runs of 200), so a big or old machine stays legible.
var COARSER = {
    cores:   { per: [1, 2, 4, 8], max: 24 },
    threads: { per: [1, 2, 4, 8], max: 48 },
    pkgs:    { per: [10, 20, 40, 100, 200], max: 160 },
    upd:     { per: [40, 80, 200, 400, 1000, 2000], max: 160 },
    age:     { per: [1, 2, 4, 13, 52], max: 140 }   // weeks
}
function perMark(k, n) {
    var st = COARSER[k]
    for (var i = 0; i < st.per.length; i++) if ((n || 0) / st.per[i] <= st.max) return st.per[i]
    return st.per[st.per.length - 1]
}
function lines(n, per) { return n > 0 ? Math.max(1, Math.round(n / per)) : 0 }
function plural(n, one, many) { return n === 1 ? one : n + " " + many }
// "1 theme", "81 themes".
function count(n, word) { return num(n) + " " + word + (n === 1 ? "" : "s") }

function upText(sec, long) {
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), mi = Math.floor(sec % 3600 / 60)
    if (long) return d ? d + (d === 1 ? " day, " : " days, ") + h + (h === 1 ? " hour" : " hours") : h + (h === 1 ? " hour, " : " hours, ") + mi + (mi === 1 ? " min" : " mins")
    return d ? d + " d " + h + " h" : h + " h " + ("0" + mi).slice(-2) + " m"
}

function resShort(d) {
    if (d.height >= 2160) return d.width >= 5000 ? "5K" : "4K"
    if (d.width / Math.max(1, d.height) > 2.1) return "UW " + d.height + "p"
    return d.height + "p"
}

var UNKNOWN = "unknown"
// One row per ring: s = the strip's short value, l = the list's plain fact,
// how = the footer's line on hover (say).
function text(k, m, f, themeName) {
    var t = fact(k, m, f, themeName)
    t.how = say(k, m, f, themeName)
    return t
}
function fact(k, m, f, themeName) {
    var hz = Math.round(m.display.hz || 0), none = { s: UNKNOWN, l: UNKNOWN }
    switch (k) {
    case "cores":
        if (!m.cpu.cores) return { s: UNKNOWN, l: m.cpu.name || UNKNOWN }
        return { s: count(m.cpu.cores, "core"), l: m.cpu.name || UNKNOWN }
    case "threads":
        if (!m.cpu.threads) return none
        return { s: count(m.cpu.threads, "thread"), l: m.cpu.threads + (m.cpu.mhz ? " @ " + (m.cpu.mhz / 1000).toFixed(2) + " GHz" : "") }
    case "gpu":
        if (f.gpuBy === "cores") return { s: count(m.gpu.cores, f.gpuUnit.word), l: m.gpu.name || UNKNOWN }
        if (f.gpuBy === "vram") return { s: size(m.gpu.vram), l: m.gpu.name || UNKNOWN }
        return { s: m.gpu.type ? m.gpu.type.toLowerCase() : UNKNOWN, l: m.gpu.name || UNKNOWN }
    case "mem":
        if (!m.memory.total) return none
        return { s: ((m.memory.used || 0) / GIB).toFixed(1) + " / " + Math.round(m.memory.total / GIB) + " GiB",
                 l: ((m.memory.used || 0) / GIB).toFixed(1) + " / " + (m.memory.total / GIB).toFixed(1) + " GiB" }
    case "disk":
        if (!m.disk.total) return none
        var used = m.disk.used || 0, usedText = used / GIB >= 1000 ? (used / GIB / 1024).toFixed(2) + " TiB" : Math.round(used / GIB) + " GiB"
        return { s: sizeShort(used) + " / " + sizeShort(m.disk.total), l: usedText + " / " + size(m.disk.total).replace(/\.00 /, " ") }
    case "hz":
        if (!m.display.width || !hz) return none
        return { s: resShort(m.display) + " · " + hz + " Hz", l: m.display.width + "×" + m.display.height + " @ " + hz + " Hz" }
    case "pkgs":
        if (m.packages.pacman === null || m.packages.pacman === undefined) return none
        return { s: num(m.packages.pacman) + " pkgs", l: num(m.packages.pacman) }
    case "upd": return { s: num(m.upgrades) + " upg", l: num(m.upgrades) }
    case "theme": return { s: themeName || UNKNOWN, l: themeName || UNKNOWN }
    case "themes":
        var th = m.themes || { count: 0 }
        if (!th.count) return { s: UNKNOWN, l: UNKNOWN }
        return { s: count(th.count, "theme"), l: String(th.count) }
    case "plugins":
        var pl = m.plugins
        if (!pl) return none
        return { s: count(pl.count, "plugin"), l: String(pl.count) }
    case "age":
        if (!(m.installed > 0)) return none
        return { s: f.days + " days", l: f.days + " days" }
    case "since":
        if (f.sinceH < 0) return { s: "never", l: "never" }
        return { s: ago(f.sinceH), l: stamp(m.lastUpgrade) }
    case "up":
        if (!f.upKnown) return none
        return { s: upText(f.upSec, false), l: upText(f.upSec, true) }
    }
    return { s: "", l: "" }
}

// The footer's line on hover: what the row is, then how its ring draws it,
// in two short sentences.
function say(k, m, f, themeName) {
    var pct = function(x) { return Math.round(x * 100) + "%" }
    switch (k) {
    case "cores":
        if (!m.cpu.cores) return "The CPU didn't report its cores."
        return "Your " + (m.cpu.name || "CPU") + " has " + count(m.cpu.cores, "core") + ". " + (f.per.cores === 1 ? "Each core is one short line of dots." : "Each short line of dots is " + f.per.cores + " cores.")
    case "threads":
        if (!m.cpu.threads) return "The CPU didn't report its threads."
        return "It runs " + count(m.cpu.threads, "thread") + (m.cpu.mhz ? " at " + (m.cpu.mhz / 1000).toFixed(2) + " GHz" : "") + ". " + (f.per.threads === 1 ? "Each thread is one line of dots." : "Each line of dots is " + f.per.threads + " threads.")
    case "gpu":
        if (f.gpuBy === "cores") return "Your " + m.gpu.name + " has " + num(m.gpu.cores) + " " + f.gpuUnit.long + ", one dot " + (f.gpuUnit.per === 1 ? "each." : "per " + f.gpuUnit.per + ".")
            + (m.gpu.usage !== null && m.gpu.usage !== undefined ? " Its load right now is " + Math.round(m.gpu.usage) + "%." : "")
        if (f.gpuBy === "vram") return "Your " + m.gpu.name + " has " + size(m.gpu.vram) + " of video memory, one dot per GiB."
        return "The GPU didn't report its cores or memory, so there are no dots."
    case "mem":
        if (!m.memory.total) return "Memory wasn't reported."
        return pct(f.mem) + " of your " + Math.round(m.memory.total / GIB) + " GiB of memory is in use. The large dots fill in as more is used."
    case "disk":
        if (!m.disk.total) return "The root disk wasn't reported."
        return "Your disk is " + pct(f.disk) + " full" + (m.disk.fs ? " (" + m.disk.fs + ")" : "") + ". The large dots show how much is used."
    case "hz":
        if (!m.display.hz) return "The display wasn't reported."
        return "Your " + (m.display.inches ? Math.round(m.display.inches) + "″ " : "") + "display runs at " + Math.round(m.display.hz) + " Hz. Each pulse in the wave is 10 Hz."
    case "pkgs":
        if (m.packages.pacman === null || m.packages.pacman === undefined) return "Packages weren't reported."
        return "You have " + num(m.packages.pacman) + " pacman packages" + (m.packages.other ? " and " + num(m.packages.other) + " others" : "") + ". "
            + (f.pkgSizes ? "Each line is " + f.per.pkgs + ", by last install or upgrade; taller ones are bigger." : "Each line of dots is " + f.per.pkgs + " packages.")
    case "upd": return num(m.upgrades) + " packages have been upgraded" + (m.installed > 0 ? " since " + day(m.installed) : "") + ". Each short run of dots is " + num(f.per.upd) + " upgrades."
    case "theme":
        var all = m.themes && m.themes.count
        return "You're using " + (themeName || "this theme") + (all ? ", one of " + all + " installed themes" : "") + ". The 8 dots stand for its terminal colours."
    case "themes":
        var th = m.themes || { count: 0 }
        if (!th.count) return "No themes were found."
        return "You have " + count(th.count, "theme") + " installed. Each one is a dot, and your active one is the larger one in the accent colour."
    case "plugins":
        var pl = m.plugins
        if (!pl) return "The shell didn't list its plugins."
        if (!pl.count) return "You haven't added any plugins yet. Each one would be a dot here."
        var on = pl.on.filter(function(x) { return x }).length
        return "You've added " + count(pl.count, "plugin") + ", and " + on + (on === 1 ? " is" : " are") + " switched on. Each one is a dot; the faint ones are off."
    case "age":
        if (!(m.installed > 0)) return "The install date wasn't found."
        return "Omarchy was installed " + f.days + " days ago, on " + day(m.installed) + ". Each dot is " + plural(f.per.age, "one week", "weeks") + (f.weekly ? "; the bigger it is, the more you upgraded then." : ".")
    case "since":
        if (f.sinceH < 0) return "No upgrades are logged yet. It fills over a week."
        return "The last update was " + ago(f.sinceH) + ". It fills over a week" + (f.sinceH > 168 ? ", so it's full now." : ".")
    case "up":
        if (!f.upKnown) return "Uptime wasn't reported."
        var d = Math.floor(f.upSec / 86400), h = Math.floor(f.upSec % 86400 / 3600), mi = Math.floor(f.upSec % 3600 / 60)
        var unit = function(n, w) { return n + " " + w + (n === 1 ? "" : "s") }
        var span = d ? unit(d, "day") + " and " + unit(h, "hour") : h ? unit(h, "hour") + " and " + unit(mi, "minute") : unit(mi, "minute")
        return "This computer has been up and running for " + span + ". It fills once every 24 hours" + (d ? ", and each dot is a full day." : ".")
    }
    return ""
}

// The seed: same hostname and hardware, same shape.
function geometry(m) {
    var f = facts(m, 0)
    var r = rng(hashStr([m.host, m.cpu.name, m.gpu.name, m.installed].join("|")))
    var arr = function(n) { var a = []; for (var i = 0; i < n; i++) a.push(r()); return a }
    var off = arr(RINGS.length)
    var g = {
        offC: off,
        spoke: arr(Math.max(1, f.lines.threads)), tick: arr(f.lines.pkgs),
        dot: arr(Math.max(1, f.lines.age)), seg: arr(f.lines.upd)
    }
    // Where the helper read them, package lines and age dots come from the
    // machine's own history instead of the seed: each line's height is the
    // disk space of its packages (by last install or upgrade, on a log scale), each
    // dot's size the upgrades in its weeks.
    if (f.pkgSizes && g.tick.length) {
        var logs = groups(m.packages.sizes, g.tick.length, 1).map(function(v) { return Math.log(1 + v) })
        var lo = Math.min.apply(null, logs), hi = Math.max.apply(null, logs)
        g.tick = logs.map(function(v) { return hi > lo ? (v - lo) / (hi - lo) : 0.5 })
    }
    if (f.weekly) {
        var ups = groups(m.upgradesByWeek, g.dot.length, f.per.age), most = Math.max.apply(null, ups)
        g.dot = ups.map(function(v) { return most > 0 ? Math.sqrt(v / most) : 0 })
    }
    return g
}
// `a` summed into n consecutive groups: of `size` items each, or (size 1
// with more items than groups) spread evenly.
function groups(a, n, size) {
    var out = []
    for (var j = 0; j < n; j++) {
        var i0 = size > 1 ? j * size : Math.floor(j * a.length / n), i1 = size > 1 ? i0 + size : Math.floor((j + 1) * a.length / n), t = 0
        for (var i = i0; i < Math.min(i1, a.length); i++) t += a[i] || 0
        out.push(t)
    }
    return out
}

// ------------------------------------------------------------------- colour

// Sections each get one theme colour; neighbouring rings in a section
// alternate between it and a softer shade, so they stay apart.
function ringColor(k, pal) {
    if (k === "up") return pal.accent
    var r = RINGS[RK[k]], base = pal.cat[r.cat], nth = 0
    for (var i = 0; i < RK[k]; i++) if (RINGS[i].cat === r.cat) nth++
    return nth % 2 ? mix(base, pal.fg, 0.32) : base
}

// -------------------------------------------------------------------- marks

function marks(k, s) {
    var m = s.machine, f = s.facts, g = s.geo, pal = s.pal, C = ringColor(k, pal), out = []
    // Faint marks are stronger on a light background (see the end).
    var track = alpha(pal.dim, pal.light ? 0.9 : 0.55), faint = alpha(pal.dim, pal.light ? 1 : 0.8)
    var i, j, n
    switch (k) {
    case "cores":
        n = f.lines.cores
        if (!n) break
        // One short line of dots per core (or per few: heavier then).
        for (j = 0; j < n; j++) out.push({ d: "tick", u: (j + 0.5) / n, w0: -0.55, w1: 0.55, lw: f.per.cores > 1 ? 3.4 : 2.6, col: C })
        break
    case "threads":
        n = f.lines.threads
        // One line of dots per thread (or per few: heavier then). Lengths
        // come from the seed; with few threads they stay nearly even.
        var vary = clamp((n - 8) / 24, 0, 1)
        for (j = 0; j < n; j++)
            out.push({ d: "tick", u: (j + 0.5) / n, w0: -1, w1: -1 + 2 * lerp(0.8, 0.3 + 0.7 * g.spoke[j % g.spoke.length], vary), lw: f.per.threads > 1 ? 1.7 : 1, col: C })
        break
    case "gpu":
        // A still count, like the cores: one dot per block of shader cores
        // (GPU_UNITS), or per GiB of VRAM. Not a load gauge: kneading the window itself
        // loads the GPU, so a live gauge filled in at the end of every knead.
        n = f.squares
        var sz = clamp(1.3 * Math.sqrt(68 / Math.max(1, n)), 0.95, 2.6)
        for (j = 0; j < n; j++) out.push({ d: "dot", u: (j + 0.5) / n, w: 0, s: sz, col: C })
        break
    case "mem": case "disk":
        var fill = k === "mem" ? f.mem : f.disk
        out.push({ d: "seg", u0: 0, u1: 1, w: 0, lw: 1, col: track, dash: [1, 4] })
        out.push({ d: "seg", u0: 0, u1: Math.max(0.002, fill), w: 0, lw: 5, col: C })
        break
    case "hz":
        if (!f.pulses) { out.push({ d: "seg", u0: 0, u1: 1, w: 0, lw: 1, col: track }); break }
        // Always drawn at phase 0: in the sigil the pulses travel by turning
        // the ring (projC, layerRate), and the strip keeps them still.
        var K = f.pulses, ph = 0, uMax = 1
        var wv = function(u) { return (((u * K + ph) % 1) + 1) % 1 < 0.5 ? 0.6 : -0.6 }
        var line = [[0, wv(0)]], edges = []
        for (var q = 0; q <= 2 * K + 3; q++) { var e = (q / 2 - ph) / K; if (e > 0 && e < uMax) edges.push(e) }
        edges.sort(function(x, y) { return x - y }).forEach(function(e) { line.push([e, wv(e - 1e-6)]); line.push([e, wv(e + 1e-6)]) })
        line.push([uMax, wv(uMax - 1e-6)])
        // Round the sigil the wave meets its own start: an edge at 12 o'clock
        // needs its step there too, or the ring shows a break.
        if (line[line.length - 1][1] !== line[0][1]) line.push([1, line[0][1]])
        out.push({ d: "poly", pts: line, lw: 1.3, col: C })
        break
    case "pkgs":
        n = g.tick.length
        for (j = 0; j < n; j++) out.push({ d: "tick", u: (j + 0.5) / n, w0: -1, w1: -1 + 2 * (0.12 + 0.88 * g.tick[j]), lw: 1, col: C, a: 0.85 })
        break
    case "upd":
        n = g.seg.length
        for (j = 0; j < n; j++) { var u0 = j / n; out.push({ d: "seg", u0: u0, u1: u0 + (0.2 + 0.65 * g.seg[j]) / n, w: 0, lw: 2.4, col: C }) }
        break
    case "theme":
        out.push({ d: "seg", u0: 0, u1: 1, w: 0, lw: 1, col: track })
        // Its 8 terminal colours as 8 dots, all in the ring's own colour.
        for (j = 0; j < 8; j++) out.push({ d: "dot", u: j / 8 + 1 / 16, w: 0, s: 3.2, col: C })
        break
    case "themes":
        var th = m.themes || { count: 0 }
        n = th.count || 0
        var ts = clamp(1.2 * Math.sqrt(60 / Math.max(1, n)), 0.9, 2.2), mine = -1
        for (j = 0; j < n; j++) {
            if (j === th.current) { mine = j; continue }
            out.push({ d: "dot", u: (j + 0.5) / n, w: 0, s: ts, col: C })
        }
        // Your theme last, larger, in the accent.
        if (mine >= 0) out.push({ d: "dot", u: (mine + 0.5) / n, w: 0, s: ts * 1.8, col: pal.accent })
        break
    case "plugins":
        var pl = m.plugins || { count: 0, on: [] }
        n = pl.count || 0
        var ps = clamp(2.6 * Math.sqrt(12 / Math.max(1, n)), 1.4, 3)
        var offs = []
        for (j = 0; j < n; j++) {
            var mk = { d: "dot", u: (j + 0.5) / n, w: 0, s: ps, col: C }
            if (pl.on[j]) out.push(mk); else { mk.a = 0.3; offs.push(mk) }
        }
        out = out.concat(offs)
        break
    case "age":
        if (!(m.installed > 0)) break
        n = g.dot.length
        for (j = 0; j < n; j++) {
            var last = j === n - 1
            // From the history: weeks without upgrades small and faint.
            var quiet = f.weekly && !last && g.dot[j] === 0
            out.push({ d: "dot", u: (j + 0.5) / n, w: 0, s: last ? 3.2 : f.weekly ? 0.7 + 2.3 * g.dot[j] : 0.8 + 1.3 * g.dot[j],
                       col: last ? pal.accent : C, a: quiet ? 0.4 : undefined })
        }
        break
    case "since":
        out.push({ d: "seg", u0: 0, u1: 1, w: 0, lw: 1, col: track, dash: [1, 4] })
        for (var dd = 0; dd < 7; dd++) out.push({ d: "tick", u: dd / 7, w0: -0.7, w1: 0.7, lw: 1, col: faint })
        if (f.sinceH >= 0) {
            var fs = Math.min(1, f.sinceH / 168)
            out.push({ d: "seg", u0: 0, u1: Math.max(0.002, fs), w: 0, lw: 2.6, col: C })
            out.push({ d: "dot", u: fs, w: 0, s: 2.4, col: pal.fg })
        }
        break
    case "up":
        for (var h = 0; h <= 24; h++) out.push({ d: "tick", u: h / 24, w0: 0.25, w1: h % 6 ? 0.6 : 1, lw: 1, col: faint })
        var fu = (f.upSec / 3600 % 24) / 24
        for (var dn = 0, days = Math.min(31, Math.floor(f.upSec / 86400)); dn < days; dn++)
            out.push({ d: "dot", u: (dn + 0.5) / 31, w: 0.95, s: 1.1, col: pal.fg, a: 0.8 })
        out.push({ d: "seg", u0: 0, u1: Math.max(0.002, fu), w: -0.4, lw: 3, col: pal.accent })
        out.push({ d: "dot", u: fu, w: -0.4, s: 2.8, col: pal.fg })
        break
    }
    // Dots carry about half the ink of the solid lines they stand for, which
    // on a light background left the thin, pale marks hard to see. There
    // thin lines get bigger dots and the nearly opaque ones full colour.
    if (pal.light)
        for (j = 0; j < out.length; j++) {
            if (out[j].d !== "dot" && out[j].lw < 1.45) out[j].lw = 1.45
            if (out[j].a > 0.8 && out[j].a < 1) out[j].a = 1
        }
    return out
}

// A knead frame's marks: none of them change while the shape does (the
// display pulses travel by turning the ring), so they are made once per
// knead (s.markCache, which the card empties when a knead starts or a
// reading or the theme changes).
function marksOf(k, s) {
    var mc = s.markCache
    if (!mc) return marks(k, s)
    return mc[k] || (mc[k] = marks(k, s))
}

// ------------------------------------------------------------- projections

// A projection P(u, w, o) puts the point in o (a new array without one).
// Frames pass these two scratch arrays instead: a knead frame projects
// thousands of points, and an array for each kept the garbage collector
// busy (it walks the whole shell's heap, a late frame now and then).
var QA = [0, 0], QB = [0, 0]

function spinRate(i) { return RINGS[i].fixed ? 0 : 0.0000065 * (i % 2 ? 1 : -1) * (1 + i * 0.1) }   // turns per ms
// A ring's turn rate: its spin, plus the display pulses travelling round
// (the wave is drawn at phase 0 and turned instead). The knead frames turn
// it the same way (projC), so in the strip, where nothing turns, it stands
// still, and a knead into the strip settles without a jump.
function layerRate(i, s) {
    var r = spinRate(i)
    if (RINGS[i].k === "hz" && s.facts.pulses > 0) r -= 0.00025 / s.facts.pulses
    return r
}
// Where a ring layer points at time t, in degrees.
function layerAngle(i, t, s) {
    var turns = (RINGS[i].fixed ? 0 : s.geo.offC[i]) + t * layerRate(i, s)
    return (((turns % 1) + 1) % 1) * 360
}
function projC(cx, cy, R, i, t, s) {
    var a = RINGS[i].r[0], b = RINGS[i].r[1], off = RINGS[i].fixed ? 0 : s.geo.offC[i] + t * layerRate(i, s)
    return function(u, w, o) {
        var r = R * (a + (b - a) * (w + 1) / 2), th = -Math.PI / 2 + TAU * (u + off)
        o = o || [0, 0]
        o[0] = cx + Math.cos(th) * r; o[1] = cy + Math.sin(th) * r
        return o
    }
}
function projL(x0, x1, y, rh) {
    return function(u, w, o) { o = o || [0, 0]; o[0] = x0 + u * (x1 - x0); o[1] = y - w * rh * 0.36; return o }
}

// Bead lines: every mark is drawn as round dots. A line becomes a string of
// evenly spaced dots (thicker lines, bigger dots); a dotted track spaces
// them wider. The same in the knead frames and the resting layers.
var BEAD = { gap: 4.2, dashGap: 1.7, dashAlpha: 0.85, square: 1.1, round: 1.9 }
// A canvas frame draws a couple of thousand dots. Each is filled on its own:
// one path holding them all cost about twice as much to rasterize (measured
// off-screen at 1.25x, the dots of a knead frame: ~12 ms as one path, ~3.5 ms
// one by one). The tiniest (a pixel or two across) are squares of the same
// area, which look the same and skip the path entirely; small ones
// octagons; only the big ones true circles.
var OCT = [1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071, -0.7071]
function beadDot(c, x, y, r) {
    if (r <= BEAD.square) { var h = r * 0.886; c.fillRect(x - h, y - h, 2 * h, 2 * h); return }
    c.beginPath()
    if (r > BEAD.round) c.arc(x, y, r, 0, TAU, false)
    else {
        c.moveTo(x + r, y)
        for (var k = 2; k < 16; k += 2) c.lineTo(x + OCT[k] * r, y + OCT[k + 1] * r)
    }
    c.fill()
}
// Dots from (u0, w0) to (u1, w1), ends included: the first one left out
// when it continues a stretch already drawn, the last when it lands on the
// mark's own start (a full ring). Dots are filled one by one, so a dot drawn
// twice in a see-through colour would show darker.
function beadRun(c, P, u0, w0, u1, w1, step, r, skipFirst, skipLast) {
    var o = P(u0, w0, QA), px = o[0], py = o[1], L = 0, k = Math.abs(u1 - u0) > 1e-6 ? 8 : 1, q
    // Its length, from a few points along it (a stretch along u bends).
    for (q = 1; q <= k; q++) {
        o = P(u0 + (u1 - u0) * q / k, w0 + (w1 - w0) * q / k, QA)
        L += Math.sqrt((o[0] - px) * (o[0] - px) + (o[1] - py) * (o[1] - py)); px = o[0]; py = o[1]
    }
    if (L < step * 0.6) {
        if (!skipFirst) { o = P((u0 + u1) / 2, (w0 + w1) / 2, QA); beadDot(c, o[0], o[1], r) }
        return
    }
    var n = Math.max(1, Math.round(L / step))
    for (q = skipFirst ? 1 : 0; q <= (skipLast && n > 1 ? n - 1 : n); q++) { o = P(u0 + (u1 - u0) * q / n, w0 + (w1 - w0) * q / n, QA); beadDot(c, o[0], o[1], r) }
}
// Whether (u1, w1) is drawn where (u0, w0) is: a closed ring.
function closes(P, u0, w0, u1, w1) {
    var a = P(u0, w0, QB), ax = a[0], ay = a[1]
    a = P(u1, w1, QB)
    return Math.abs(a[0] - ax) + Math.abs(a[1] - ay) < 0.5
}
function sameBead(a, b) {
    return a.col === b.col && (a.a === undefined ? 1 : a.a) === (b.a === undefined ? 1 : b.a) && !a.dash === !b.dash
}

function drawMarks(c, ms, P, z) {
    var ga = c.globalAlpha, i = 0
    while (i < ms.length) {
        var m = ms[i], end = i + 1
        // The batch: this mark and the ones after it with the same look.
        while (end < ms.length && sameBead(m, ms[end])) end++
        c.globalAlpha = ga * (m.a === undefined ? 1 : m.a) * (m.dash ? BEAD.dashAlpha : 1)
        c.fillStyle = m.col
        for (var j = i; j < end; j++) {
            var mk = ms[j]
            if (mk.d === "dot") {
                var o = P(mk.u, mk.w, QA)
                beadDot(c, o[0], o[1], Math.max(0.9, mk.s * z * 0.8))
                continue
            }
            var r = clamp(mk.lw * z * 0.5, 0.8, 2.6), step = Math.max(BEAD.gap, r * 2.7) * (mk.dash ? BEAD.dashGap : 1)
            if (mk.d === "tick") beadRun(c, P, mk.u, mk.w0, mk.u, mk.w1, step, r, false, false)
            else if (mk.d === "seg") beadRun(c, P, mk.u0, mk.w, mk.u1, mk.w, step, r, false, closes(P, mk.u0, mk.w, mk.u1, mk.w))
            else if (mk.d === "poly") {
                var pts = mk.pts, last = pts.length - 1, shut = closes(P, pts[0][0], pts[0][1], pts[last][0], pts[last][1])
                for (var q = 1; q <= last; q++)
                    beadRun(c, P, pts[q - 1][0], pts[q - 1][1], pts[q][0], pts[q][1], step, r, q > 1, shut && q === last)
            }
        }
        i = end
    }
    c.globalAlpha = ga
}

// A small picture of each ring for its list row: same colour, same shape,
// made of the same dots. About 16 px wide, centred on y.
function icon(c, k, x, y, col, s) {
    var pal = s.pal, f = s.facts, j, q
    var dot = function(px, py, r) { beadDot(c, px, py, r) }
    // A run of dots from (x1, y1) to (x2, y2), about `step` apart.
    var run = function(x1, y1, x2, y2, r, step) {
        var n = Math.max(1, Math.round(Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) / step))
        for (var i = 0; i <= n; i++) dot(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, r)
    }
    var faint = function(fn) { var ga = c.globalAlpha; c.globalAlpha = ga * (pal.light ? 0.6 : 0.4); fn(); c.globalAlpha = ga }
    c.save()
    c.fillStyle = col
    switch (k) {
    case "cores": for (j = 0; j < 4; j++) run(x + 2 + j * 4, y - 4, x + 2 + j * 4, y + 4, 0.85, 2.67); break
    case "threads": [6, 3, 7, 4, 5].forEach(function(hh, i) { run(x + 1 + i * 3.6, y + 4, x + 1 + i * 3.6, y + 4 - hh, 0.65, 2.2) }); break
    case "gpu": for (j = 0; j < 4; j++) for (q = 0; q < 2; q++) dot(x + 2 + j * 4, y - 2.5 + q * 5, 1.2); break
    case "mem": case "disk":
        var fr = k === "mem" ? f.mem : f.disk
        faint(function() { run(x, y, x + 16, y, 0.5, 2.6) })
        run(x, y, x + Math.max(0, 16 * fr), y, 1.4, 3.4); break
    case "hz":
        var sq = [[x, y + 3], [x, y - 3], [x + 4, y - 3], [x + 4, y + 3], [x + 8, y + 3], [x + 8, y - 3], [x + 12, y - 3], [x + 12, y + 3], [x + 16, y + 3]]
        for (j = 1; j < sq.length; j++) run(sq[j - 1][0], sq[j - 1][1], sq[j][0], sq[j][1], 0.65, 2)
        break
    case "pkgs": [5, 2, 7, 3, 6, 4, 8].forEach(function(hh, i) { run(x + 1 + i * 2.4, y + 4, x + 1 + i * 2.4, y + 4 - hh, 0.65, 2.2) }); break
    case "upd": [[0, 4], [6, 3], [11, 5]].forEach(function(p) { run(x + p[0], y, x + p[0] + p[1], y, 0.9, 2.4) }); break
    case "theme":
        faint(function() { run(x, y, x + 16, y, 0.5, 2.6) })
        for (j = 0; j < 4; j++) dot(x + 2 + j * 4, y, 1.5)
        break
    case "themes":
        for (j = 0; j < 5; j++) dot(x + 1.6 + j * 3.2, y, j === 2 ? 2 : 1.3)
        break
    case "plugins":
        for (j = 0; j < 3; j++) dot(x + 1.6 + j * 4.2, y, 1.6)
        faint(function() { dot(x + 1.6 + 3 * 4.2, y, 1.6) })
        break
    case "age":
        [1, 1.5, 1, 1.4].forEach(function(r, i) { dot(x + 1.5 + i * 3.6, y, r) })
        c.fillStyle = pal.accent; dot(x + 15.5, y, 2.1); break
    case "since":
        var fs = f.sinceH < 0 ? 0 : Math.min(1, f.sinceH / 168)
        faint(function() { for (j = 0; j <= 7; j++) run(x + j * 16 / 7, y - 3, x + j * 16 / 7, y + 3, 0.5, 3) })
        run(x, y, x + 16 * fs, y, 0.9, 2.4)
        c.fillStyle = pal.fg; dot(x + 16 * fs, y, 1.6); break
    case "up":
        var fu = (f.upSec / 3600 % 24) / 24
        faint(function() { [0, 4, 8, 12, 16].forEach(function(dx) { run(x + dx, y - 4, x + dx, y - 1.5, 0.5, 2.5) }) })
        run(x, y + 2, x + 16 * fu, y + 2, 1, 2.6)
        c.fillStyle = pal.fg; dot(x + 16 * fu, y + 2, 1.7); break
    }
    c.restore()
}

// ------------------------------------------------------------------- layout

// The info list: section heads and one row per ring, in ring order.
var LIST = (function() {
    var out = [], cat = ""
    RINGS.forEach(function(r, i) { if (r.cat !== cat) { cat = r.cat; out.push({ head: cat }) } out.push({ i: i }) })
    return out
})()
var LIST_AT = {}
LIST.forEach(function(e, j) { if (e.head) LIST_AT["h:" + e.head] = j; else LIST_AT[e.i] = j })

function layout(w, h, s) {
    var narrow = w < 640, infoW = narrow ? w - 16 : Math.round(s.unit * 29)
    var R, cx, cy, ix, itop, ih
    if (narrow) {
        // Sigil above the list, both fitted to the height there is.
        ih = Math.max(14, Math.min(21, (h - 2 * Math.min(w * 0.44, 165) - 54) / LIST.length))
        R = Math.max(40, Math.min(w * 0.44, 165, (h - ih * LIST.length - 54) / 2))
        cx = w / 2; cy = R + 16; ix = 8; itop = cy + R + 22
    }
    else {
        var leftW = w - infoW
        R = Math.min(leftW * 0.45, h * 0.45); cx = leftW / 2 + 10; cy = h / 2; ix = leftW + 2
        ih = Math.min(s.unit * 2.2, (h - 16) / LIST.length); itop = (h - ih * LIST.length) / 2
    }
    // The strip: a row per ring and per section head.
    var rows = LIST.length, padT = 10, padB = 8
    var hs = Math.min(h, rows * s.unit * 3.4 + padT + padB)
    var rh = (hs - padT - padB) / rows
    var nameW = s.unit * 7.5, valW = clamp(s.valW || s.unit * 11.5, s.unit * 8, w * 0.3)
    var x0 = 16, xv = w - 16, tx0 = x0 + nameW, tx1 = xv - valW - 10
    var rowY = [], heads = {}
    LIST.forEach(function(e, j) { var y = padT + j * rh + rh / 2; if (e.head) heads[e.head] = y; else rowY[e.i] = y })
    return { w: w, h: h, narrow: narrow, infoW: infoW, R: R, cx: cx, cy: cy, ix: ix, itop: itop, ih: ih,
             rh: rh, x0: x0, xv: xv, tx0: tx0, tx1: tx1, rowY: rowY, heads: heads,
             yI: function(j) { return itop + j * ih + ih / 2 } }
}

// Which ring is under the pointer: by ring in the sigil, by row in the
// list and the strip. -1 for none.
function hit(Y, s, x, y) {
    var shape = average(s.cur)
    if (shape > 0.5) {
        var inList = Y.narrow ? y > Y.itop - 4 : x > Y.ix - 4
        if (inList) { var e = LIST[Math.floor((y - Y.itop) / Y.ih)]; return e && !e.head ? e.i : -1 }
        var d = Math.sqrt((x - Y.cx) * (x - Y.cx) + (y - Y.cy) * (y - Y.cy)) / Y.R
        if (d > 1) return -1
        for (var i = 0; i < RINGS.length; i++) if (d >= RINGS[i].r[0] - 0.01 && d < RINGS[i].r[1] + 0.005) return i
        return -1
    }
    for (var k = 0; k < RINGS.length; k++) if (Math.abs(y - Y.rowY[k]) < Y.rh / 2) return k
    return -1
}

function average(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t / a.length }

// -------------------------------------------------------------------- paint

function paintRings(c, Y, t, s) {
    for (var i = 0; i < RINGS.length; i++) {
        var wc = s.cur[i], wl = 1 - wc
        var PL = projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh), PC = projC(Y.cx, Y.cy, Y.R, i, t, s)
        var P = wc >= 1 ? PC : wl >= 1 ? PL : (function(PL, PC, wl, wc) {
            var a = [0, 0], b = [0, 0]
            return function(u, ww, o) {
                PL(u, ww, a); PC(u, ww, b)
                o = o || [0, 0]
                o[0] = a[0] * wl + b[0] * wc; o[1] = a[1] * wl + b[1] * wc
                return o
            }
        })(PL, PC, wl, wc)
        var build = ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
        c.globalAlpha = (s.hi < 0 || s.hi === i ? 1 : DIM_RING) * build
        drawMarks(c, marksOf(RINGS[i].k, s), P, wl * (Y.rh / 24) + wc * (Y.R / 200))
    }
}

// Section dividers and the centre dot: the sigil only.
function paintDeco(c, Y, s) {
    var shape = average(s.cur), pal = s.pal
    c.globalAlpha = shape
    c.fillStyle = pal.fg; c.beginPath(); c.arc(Y.cx, Y.cy, Math.max(2, Y.R * 0.014), 0, TAU, false); c.fill()
    SEPS.forEach(function(sp) {
        var a = Math.pow(shape, 2)
        if (a < 0.01) return
        // A ring of small dots, like the bead lines.
        var r = Y.R * sp[1], n = Math.round(TAU * r / (BEAD.gap * 1.8)), dr = pal.light ? 1.05 : 0.8
        c.globalAlpha = a; c.fillStyle = alpha(pal.cat[sp[0]], pal.light ? 0.7 : 0.45)
        for (var j = 0; j < n; j++) beadDot(c, Y.cx + Math.cos(TAU * j / n) * r, Y.cy + Math.sin(TAU * j / n) * r, dr)
    })
}

// The lines after the section heads and the list icons. (The words are
// QML text items, placed with textPos below, so the canvas never draws text.)
function paintText(c, Y, s) {
    var shape = average(s.cur), pal = s.pal
    CATS.forEach(function(cat) {
        var p = headPos(Y, cat, shape), tw = s.headW ? s.headW[cat] || 0 : 0
        var x2 = lerp(Y.xv, Y.ix + Y.infoW - 12, shape)
        c.globalAlpha = 1; c.fillStyle = alpha(pal.cat[cat], 0.3)
        c.fillRect(p[0] + tw + 10, Math.round(p[1]), Math.max(0, x2 - p[0] - tw - 10), 1)
    })
    for (var i = 0; i < RINGS.length; i++) {
        var kk = s.cur[i]
        c.globalAlpha = Math.pow(kk, 2)
        if (c.globalAlpha > 0.01) icon(c, RINGS[i].k, Y.ix + 6, Y.yI(LIST_AT[i]), ringColor(RINGS[i].k, pal), s)
    }
    c.globalAlpha = 1
}

// Where a section head sits, at shape `shape` (0 strip, 1 sigil): [x, y].
function headPos(Y, cat, shape) {
    return [lerp(Y.x0, Y.ix + 6, shape), lerp(Y.heads[cat], Y.yI(LIST_AT["h:" + cat]), shape)]
}
// Where ring i's name and value sit: { nameX, valueX, y }. `shortW` is the
// width of the strip's short value (right-aligned there).
function textPos(Y, i, k, unit, shortW) {
    return { nameX: lerp(Y.x0, Y.ix + unit * 2.5, k), valueX: lerp(Y.xv - shortW, Y.ix + unit * 9.2, k),
             y: lerp(Y.rowY[i], Y.yI(LIST_AT[i]), k) }
}

// Everything, for the knead (s.cur may differ per ring), in layout Y.
function paint(c, Y, t, s) {
    // A solid background (the card's own colour), so the layers underneath
    // never show through and double up while the two hand over.
    if (s.bg) { c.globalAlpha = 1; c.fillStyle = s.bg; c.fillRect(0, 0, Y.w, Y.h) }
    paintRings(c, Y, t, s)
    paintDeco(c, Y, s)
    paintText(c, Y, s)
}

// At rest: the parts that never move, painted once.
function paintStatic(c, Y, s) {
    paintDeco(c, Y, s)
    paintText(c, Y, s)
}

// At rest in the sigil: one ring, centred in a w × h layer, pointing up;
// the layer itself is turned on the GPU.
function paintRingLayer(c, i, w, h, R, s) {
    var a = RINGS[i].r[0], b = RINGS[i].r[1], cx = w / 2, cy = h / 2
    var P = function(u, ww, o) {
        var r = R * (a + (b - a) * (ww + 1) / 2), th = -Math.PI / 2 + TAU * u
        o = o || [0, 0]
        o[0] = cx + Math.cos(th) * r; o[1] = cy + Math.sin(th) * r
        return o
    }
    drawMarks(c, marks(RINGS[i].k, s), P, R / 200)
}

// At rest in the strip: one row's track, `trackW` wide from x = x0, its
// middle at y = cy.
function paintRowLayer(c, i, x0, trackW, cy, rh, s) {
    drawMarks(c, marks(RINGS[i].k, s), projL(x0, x0 + trackW, cy, rh), rh / 24)
}
