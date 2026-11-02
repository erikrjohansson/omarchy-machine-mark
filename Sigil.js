.pragma library

// The machine drawn twice from one model. Every ring is a list of marks in
// (u, w): u runs along the ring 0..1, w across it from -1 (inner / bottom) to
// 1 (outer / top). Projected onto circles that is the sigil; projected onto
// straight rows it is the strip; anything in between is the knead.

var TAU = Math.PI * 2

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function lerp(a, b, k) { return a + (b - a) * k }
function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
function smooth(x) { return x * x * (3 - 2 * x) }

function hashStr(s) {
    var h = 2166136261 >>> 0
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    return h
}
// The first n numbers rng(seed) gives, into RN (no closure: these run per
// particle, thousands at a time).
var RN = new Float64Array(8)
function rngN(seed, n) {
    var a = seed >>> 0
    for (var i = 0; i < n; i++) {
        a = (a + 0x6D2B79F5) >>> 0
        var t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        RN[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    return RN
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

// The knead unbends the sigil: every ring stays an arc round one shared
// centre, which sinks from the sigil's centre towards infinity below the
// strip, so the rings flatten into their rows together. Arcs round one
// centre never meet, and the rings keep their order all the way (outer
// above inner, as in the strip). First each ring turns its cut (u = 0) to
// the bottom, where it opens.
var TURN_END = 0.4       // the turn is done this far into the knead
var BEND_START = 0.12    // the unbending starts here
var BEND_EASE = 2        // the arcs' curvature goes as (1 - p) ^ BEND_EASE

// How far the knead has got, b (0 sigil, 1 strip), as the arcs' shape:
// turn, unbent p, the centre's x, base (where it would be without the
// sinking) and D (how far it has sunk: an arc a sigil radius out from the
// centre bends (1 - p) ^ BEND_EASE as much as at the start).
// The bend starts from rest (p eases in), so it doesn't kick in mid-turn.
// The arcs reach the track's length and middle early (pl), so they are over
// the track, clear of the words, well before they are straight; they come
// down to their rows (q) in step with that, not after it.
function bendOf(Y, b) {
    var x = clamp((b - BEND_START) / (1 - BEND_START), 0, 1), p = x * x * (2 - x)
    var pl = 1 - Math.pow(1 - p, 3), q = 1 - (1 - p) * (1 - p)
    return { b: b, turn: smooth(clamp(b / TURN_END, 0, 1)), p: p, pl: pl, q: q,
             D: Y.R * (Math.pow(Math.max(1e-4, 1 - p), -BEND_EASE) - 1),
             x: lerp(Y.cx, (Y.tx0 + Y.tx1) / 2, pl), base: lerp(Y.cy, Y.yb, q) }
}

// An arc's angle for length L at radius rho, never past a whole ring, and
// eased in so its ends stay inside the card.
function arcAngle(Y, B, L, rho) {
    var half = Math.min(B.x, Y.w - B.x) - 8
    if (half < rho) {
        var most = 2 * rho * Math.asin(half / rho), soft = most * 0.8
        if (L > soft) L = soft + (most - soft) * tanh((L - soft) / (most - soft))
    }
    return Math.min(TAU, L / rho)
}
function tanh(x) { var e = Math.exp(2 * x); return (e - 1) / (e + 1) }

// A ring's turn for this knead (s.markCache is emptied when one starts):
// where it pointed when the knead began and how far it has to go to point
// its cut down, taken as a whole number of turns short of that.
function turnOf(i, t, s) {
    var mc = s.markCache, tr = mc && mc["turn" + i]
    if (!tr) {
        var off = (RINGS[i].fixed ? 0 : s.geo.offC[i]) + t * layerRate(i, s), d = 0.5 - off
        d -= Math.floor(d + 0.5)
        tr = { off0: off - Math.round(off + d - 0.5), t0: t, d: d }
        if (mc) mc["turn" + i] = tr
    }
    return tr
}

function projU(Y, i, t, s, B) {
    var tr = turnOf(i, t, s)
    // Turns past pointing down: the ring's own spin stops as it turns.
    var off = tr.off0 + (t - tr.t0) * layerRate(i, s) * (1 - B.turn) + tr.d * B.turn - 0.5
    return arcP(Y, B, RINGS[i].r[0], RINGS[i].r[1], Y.rowY[i], Y.rh * 0.36, off)
}
// One arc of the knead, turned `off` turns: from the sigil's radii r0..r1
// (in sigil radii, w -1..1) to the strip's band round y (w -1..1 is
// y + k..y - k).
function arcP(Y, B, r0, r1, y, k, off) {
    var rm = Y.R * (r0 + r1) / 2, cy = B.base + B.D
    // The arc's angle: its length over its radius (never past a whole ring).
    var th = arcAngle(Y, B, lerp(TAU * rm, Y.tx1 - Y.tx0, B.pl), B.D + lerp(rm, Y.yb - y, B.q))
    return function(u, w, o) {
        var rho = B.D + lerp(Y.R * (r0 + (r1 - r0) * (w + 1) / 2), Y.yb - y + w * k, B.q)
        var psi = (u - 0.5) * th + off * TAU
        o = o || [0, 0]
        o[0] = B.x + Math.sin(psi) * rho; o[1] = cy - Math.cos(psi) * rho
        return o
    }
}
// A section's arc: its divider ring (the outermost section has none: one
// just outside the rings), unbending onto the section's head row.
var HEAD_R = { hw: 0.49, sw: 0.812, age: 1.03 }
function headArc(Y, B, cat) { return arcP(Y, B, HEAD_R[cat], HEAD_R[cat], Y.heads[cat], 0, 0) }

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
var beadDot = (function() {
    var _BEAD = BEAD, _OCT = OCT, _TAU = TAU
    return function beadDot(c, x, y, r) {
    if (r <= _BEAD.square) { var h = r * 0.886; c.fillRect(x - h, y - h, 2 * h, 2 * h); return }
    c.beginPath()
    if (r > _BEAD.round) c.arc(x, y, r, 0, _TAU, false)
    else {
        c.moveTo(x + r, y)
        for (var k = 2; k < 16; k += 2) c.lineTo(x + _OCT[k] * r, y + _OCT[k + 1] * r)
    }
    c.fill()
}})()

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
// A knead frame's runs keep their dots: each run has the count it has at
// rest in the sigil and in the strip (n), and n slides between the two.
// Dots stay at q / n from the start and slide along as it stretches; the end
// dot stays put, and the one next to it grows out of it (or shrinks into
// it). Recounting every frame moved every dot each time the count changed,
// which crawled. endA is the end dot's alpha (0 where it would sit on the
// start of a closed ring).
function beadRunN(c, P, u0, w0, u1, w1, n, r, skipFirst, endA) {
    var m = Math.floor(n), f = n - m, ga = c.globalAlpha, o, q
    for (q = skipFirst ? 1 : 0; q <= m; q++) {
        var a = q < m ? 1 : f
        if (a < 0.01) continue
        o = P(u0 + (u1 - u0) * q / n, w0 + (w1 - w0) * q / n, QA)
        if (a < 1) c.globalAlpha = ga * a
        beadDot(c, o[0], o[1], r)
        c.globalAlpha = ga
    }
    if (endA < 0.01) return
    o = P(u1, w1, QA)
    if (endA < 1) c.globalAlpha = ga * endA
    beadDot(c, o[0], o[1], r)
    c.globalAlpha = ga
}
// A run's dot count at rest: what beadRun draws, as intervals (0 for a
// single dot in the middle).
function beadCount(P, u0, w0, u1, w1, step) {
    var o = P(u0, w0, QA), px = o[0], py = o[1], L = 0, k = Math.abs(u1 - u0) > 1e-6 ? 8 : 1
    for (var q = 1; q <= k; q++) {
        o = P(u0 + (u1 - u0) * q / k, w0 + (w1 - w0) * q / k, QA)
        L += Math.sqrt((o[0] - px) * (o[0] - px) + (o[1] - py) * (o[1] - py)); px = o[0]; py = o[1]
    }
    return L < step * 0.6 ? 0 : Math.max(1, Math.round(L / step))
}
// The rest counts of a mark's runs, [sigil, strip, closed in the sigil],
// kept on the (per-knead) mark for this layout.
function runCounts(mk, K) {
    if (mk.nKey === K.key) return mk.n
    var steps = [K.zc, K.zl].map(function(z) {
        var r = clamp(mk.lw * z * 0.5, 0.8, 2.6)
        return Math.max(BEAD.gap, r * 2.7) * (mk.dash ? BEAD.dashGap : 1)
    })
    var runs = mk.d === "tick" ? [[mk.u, mk.w0, mk.u, mk.w1]]
             : mk.d === "seg" ? [[mk.u0, mk.w, mk.u1, mk.w]]
             : mk.pts.slice(1).map(function(pt, q) { return [mk.pts[q][0], mk.pts[q][1], pt[0], pt[1]] })
    var first = runs[0], last = runs[runs.length - 1]
    var shut = mk.d !== "tick" && closes(K.PC, first[0], first[1], last[2], last[3])
    mk.n = runs.map(function(e) {
        return [beadCount(K.PC, e[0], e[1], e[2], e[3], steps[0]), beadCount(K.PL, e[0], e[1], e[2], e[3], steps[1])]
    })
    mk.shut = shut
    mk.nKey = K.key
    return mk.n
}
// One run of a knead frame: with the counts slid between, or recounted
// where one end is a single dot (rare: very short ticks).
// shutAt: where the mark starts, for the last run of one that closes in
// the sigil.
function kneadRun(c, P, e, ns, K, step, r, skipFirst, shutAt) {
    var endA = 1
    if (shutAt) {
        // A closed ring's end dot shows as its cut opens.
        var o = P(e[2], e[3], QB), x = o[0], y = o[1]
        o = P(shutAt[0], shutAt[1], QB)
        endA = clamp(Math.sqrt((o[0] - x) * (o[0] - x) + (o[1] - y) * (o[1] - y)) / step, 0, 1)
    }
    if (!ns[0] || !ns[1]) { beadRun(c, P, e[0], e[1], e[2], e[3], step, r, skipFirst, endA < 0.5); return }
    beadRunN(c, P, e[0], e[1], e[2], e[3], lerp(ns[0], ns[1], K.p), r, skipFirst, endA)
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

// K: a knead frame's ends (see runCounts), or none at rest.
function drawMarks(c, ms, P, z, K) {
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
            if (K) {
                var ns = runCounts(mk, K)
                if (mk.d === "tick") kneadRun(c, P, [mk.u, mk.w0, mk.u, mk.w1], ns[0], K, step, r, false, null)
                else if (mk.d === "seg") kneadRun(c, P, [mk.u0, mk.w, mk.u1, mk.w], ns[0], K, step, r, false, mk.shut ? [mk.u0, mk.w] : null)
                else for (var e = 1; e < mk.pts.length; e++)
                    kneadRun(c, P, [mk.pts[e - 1][0], mk.pts[e - 1][1], mk.pts[e][0], mk.pts[e][1]], ns[e - 1], K, step, r, e > 1,
                             mk.shut && e === mk.pts.length - 1 ? mk.pts[0] : null)
                continue
            }
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

// The info list: section heads and one row per ring, from the outside in.
// The strip has the same rows: the sigil's top half read downwards, so the
// knead can unbend the rings without any of them crossing another.
var LIST = (function() {
    var out = [], cat = ""
    for (var i = RINGS.length - 1; i >= 0; i--) {
        if (RINGS[i].cat !== cat) { cat = RINGS[i].cat; out.push({ head: cat }) }
        out.push({ i: i })
    }
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
    return { w: w, h: h, narrow: narrow, infoW: infoW, R: R, cx: cx, cy: cy, ix: ix, itop: itop, ih: ih, unit: s.unit,
             rh: rh, x0: x0, xv: xv, tx0: tx0, tx1: tx1, rowY: rowY, heads: heads, yb: hs,
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
    var B = bendOf(Y, 1 - average(s.cur)), zc = Y.R / 200, zl = Y.rh / 24
    var mid = B.b > 0 && B.p < 1, key = Y.w + "x" + Y.h
    for (var i = 0; i < RINGS.length; i++) {
        var PL = projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh)
        var P = B.b <= 0 ? projC(Y.cx, Y.cy, Y.R, i, t, s) : B.p >= 1 ? PL : projU(Y, i, t, s, B)
        var build = ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
        c.globalAlpha = (s.hi < 0 || s.hi === i ? 1 : DIM_RING) * build
        drawMarks(c, marksOf(RINGS[i].k, s), P, lerp(zc, zl, B.p),
                  mid ? { PC: projC(Y.cx, Y.cy, Y.R, i, 0, s), PL: PL, zc: zc, zl: zl, p: B.pl, key: key } : null)
    }
}

// Section dividers and the centre dot: the sigil only.
// The centre dot shrinks away while the rings turn, before they open; the
// dividers unbend with the rings towards their section's head, fading.
function paintDeco(c, Y, s) {
    var pal = s.pal, B = bendOf(Y, 1 - average(s.cur)), dot = 1 - smooth(clamp(B.b / 0.3, 0, 1))
    if (dot > 0.01) {
        c.globalAlpha = dot
        c.fillStyle = pal.fg; c.beginPath(); c.arc(B.x, B.base + B.D, Math.max(2, Y.R * 0.014) * dot, 0, TAU, false); c.fill()
    }
    SEPS.forEach(function(sp) {
        var a = Math.pow(1 - B.p, 2)
        if (a < 0.01) return
        // A ring of small dots, like the bead lines.
        var n = Math.round(TAU * Y.R * sp[1] / (BEAD.gap * 1.8)), dr = pal.light ? 1.05 : 0.8, P = headArc(Y, B, sp[0])
        c.globalAlpha = a; c.fillStyle = alpha(pal.cat[sp[0]], pal.light ? 0.7 : 0.45)
        for (var j = 0; j < n; j++) { var o = P(j / n, 0, QA); beadDot(c, o[0], o[1], dr) }
    })
}

// The lines after the section heads and the list icons. (The words are
// QML text items, placed with textPos below, so the canvas never draws text.)
function paintText(c, Y, s) {
    var shape = average(s.cur), pal = s.pal, w = { mark: s.mark, back: s.back, mode: s.mode, mc: s.markCache }
    CATS.forEach(function(cat) {
        var tw = s.headW ? s.headW[cat] || 0 : 0, a = wordAlpha(shape, Y, "h:" + cat, w)
        if (a < 0.01) return
        c.globalAlpha = a
        if (shape > 0.5) {
            // Drawn in with its head: it reels into it first.
            var sk = suckAt(Y, listB(1 - shape, s.back, s.mode), suckHead(Y, cat, tw))
            var x = Y.ix + 6 + tw + 10, rl = smooth(clamp(sk.s / HEAD_REEL, 0, 1)), len = (Y.ix + Y.infoW - 12 - x) * (1 - rl)
            if (rl >= 1) return
            x = sk.x + sk.sc * tw / 2 + 10
            c.globalAlpha = a * (1 - rl)
            c.fillStyle = alpha(pal.cat[cat], 0.3)
            c.fillRect(x, Math.round(sk.y), Math.max(0, len), 1)
            return
        }
        var p = headPos(Y, cat, shape), from = p[0] + tw + 10
        c.fillStyle = alpha(pal.cat[cat], 0.3)
        c.fillRect(from, Math.round(p[1]), Math.max(0, Y.xv - from), 1)
    })
    // The list's icons, there only; drawn in with their names (suckLabel),
    // or fading with them where the mode keeps the list in place.
    for (var i = 0; i < RINGS.length; i++) {
        if (s.cur[i] <= 0.5) continue
        var yi = Y.yI(LIST_AT[i]), col = ringColor(RINGS[i].k, pal)
        var W = s.wordW || {}, lb = suckLabel(Y, i, W.names ? W.names[i] || 0 : 0, W.vals ? W.vals[i] || 0 : 0), si = suckAt(Y, listB(1 - shape, s.back, s.mode), lb)
        if (si.s <= 0) {
            var ia = wordAlpha(s.cur[i], Y, i, w, "name")
            if (ia < 0.01) continue
            c.globalAlpha = ia; icon(c, RINGS[i].k, Y.ix + 6, yi, col, s); continue
        }
        if (si.a < 0.01) continue
        c.globalAlpha = si.a
        c.save(); c.translate(si.x, si.y); c.rotate(si.rot * Math.PI / 180); c.scale(si.sc, si.sc)
        icon(c, RINGS[i].k, Y.ix + 6 - lb.x, 0, col, s)
        c.restore()
    }
    c.globalAlpha = 1
}

// The words never meet the dots, nor the core. The list's are drawn into
// the sigil as it winds up (suckAt: their alpha is there). In the strip, a
// row's name lights in the core's wake (WAKE) once the row's left end has
// closed into its places (no other row's dots reach its band), its value
// as the row's closing reaches its right end (part "value"); the heads and
// their lines the same, once the strata have settled. Back to the sigil,
// each row's words go out in place just before the core reaches the row
// and it bursts (a head's line, which runs across the core's way, sooner;
// the top head's as the core leaves the logo). id: a ring's
// index, or "h:" and a section. w: { mark, back } (the logo, a knead back
// to the sigil).
var WORD_FADE = 150, AGE_FADE = 100   // (the top head's quicker: the core passes it as it leaves the logo)
function burstWordAlpha(k, Y, id, w, part) {
    if (k > 0.5) return 1
    var head = typeof id === "string", mark = w ? w.mark : null, CT = coreTimes(Y, mark), y = head ? Y.heads[id.slice(2)] : Y.rowY[id]
    if (w && w.back) {
        if (id === "h:age") return 1 - smooth(clamp(k * T_R / AGE_FADE, 0, 1))
        return 1 - smooth(clamp((k * T_R - (head ? CT.heads[id.slice(2)] : CT.cross[id] - WORD_FADE)) / WORD_FADE, 0, 1))
    }
    var ms = (1 - k) * T_OUT, fin = smooth(clamp((ms - FINAL_OUT[0]) / (FINAL_OUT[1] - FINAL_OUT[0]), 0, 1))
    if (part === "value") return Math.max(fin, smooth(clamp((ms - CT.land[id] - (Y.tx1 - CT.xL) / V_SWEEP - 25) / 120, 0, 1)))
    var landed = smooth(clamp((ms - (head ? STRATA[1] : CT.land[id])) / 140, 0, 1))
    if (landed <= 0) return fin
    return Math.max(fin, landed * smooth(clamp((ms - (head ? CT.wakeH[id.slice(2)] : CT.wake[id])) / WAKE[1], 0, 1)))
}

// Where a section head sits, at shape `shape` (0 strip, 1 sigil): [x, y].
function headPos(Y, cat, shape) {
    return shape > 0.5 ? [Y.ix + 6, Y.yI(LIST_AT["h:" + cat])] : [Y.x0, Y.heads[cat]]
}
// Where ring i's name and value sit: { nameX, y, valueX, yv }. `shortW` is
// the width of the strip's short value (right-aligned there).
function textPos(Y, i, k, unit, shortW) {
    if (k > 0.5) { var yl = Y.yI(LIST_AT[i]); return { nameX: Y.ix + unit * 2.5, y: yl, valueX: Y.ix + unit * 9.2, yv: yl } }
    return { nameX: Y.x0, y: Y.rowY[i], valueX: Y.xv - shortW, yv: Y.rowY[i] }
}

// What a knead from now on draws with, worked out before its first frame
// (into s.markCache): the burst's particles, the core's way and, back to the
// sigil, the return's plan.
function burstPrepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    var P = burstOf(Y, t, s)
    coreTimes(Y, s.mark)
    if (s.back) returnOf(Y, P, t, s, s.mark)
}

// Everything, for the knead (s.cur may differ per ring), in layout Y.
function paint(c, Y, t, s) {
    // A solid background (the card's own colour), so the layers underneath
    // never show through and double up while the two hand over.
    if (s.bg) { c.globalAlpha = 1; c.fillStyle = s.bg; c.fillRect(0, 0, Y.w, Y.h) }
    modeOf(s.mode).paint(c, Y, t, s)
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

// --------------------------------------------------------------------- burst

// The knead bursts the sigil. It winds up: the whole sigil turns, faster and
// faster, drawing the list in; at top speed it tears, the rim first, and
// each dot is flung off along its way round (velocity matched, so it reads
// as thrown), slowing into a cloud over the stage, round the core, still
// in the middle. The cloud settles into loose strata about the rows'
// heights while the core goes down to the strip's foot and up a column
// through it: each row closes into its places as the core passes it, its
// words lighting in its wake, and the core goes on into the header's logo, which
// pulses as it lands. Back to the sigil is an animation of its own (see
// paintReturn), on the same path.
var B_TEAR = 0.29             // the spin-up ends and the rim tears
var SPIN_TURNS = 0.95         // turns by then (top speed ~2.6 turns/s: drawn as streaks, see paintBurst)
var T_MS = 3800               // the burst's own clock: its b-constants are in knead lengths of this (oldB)
var T_OUT = 4450              // the knead's length (AboutCard)
var BLUR = 1                  // a streak is this many frames of motion long
var BRAKE = 0.05              // the rings' own drift stops over this much
var STRETCH = 0.02            // the sigil swells this much under the spin, never shrinks
var TEAR_SPAN = 0.06, TEAR_JIT = 0.012   // the rim goes first, the inside this much later
var RAD_MIX = 0.35            // the flung direction: the way round, and this much outwards
var K_MIN = 5, K_MAX = 16     // a flung dot's impulse, its own (see burstOf)
var OUT = 0.22                // its length
var H_MAX = 1.2               // the flight's bend, at most, that sets its impulse K (it leaves at the spin's velocity)
var FILL_MIN = 0.2, FILL_VAR = 0.6, FLOOR = 0.15   // how far, of the room there is (FLOOR: sigil radii)
var SCATTER = 0.3             // and a push in a direction of its own, in sigil radii
var ROW_PULL = 0.25           // the cloud already leans a little towards the dot's row
var BOX_M = 20                // a safety edge, inside the stage
var SHRINK = 0.15             // dots shrink this much in flight
// From here in ms of the knead (b·T_OUT):
var STRATA = [0, 2300]        // each dot settles loosely about its row's height (STRATA_JIT rows deep) from its
var STRATA_JIT = 0.6, DRIFT = 6, DRIFT_T = 1800   // release, slowing all the way, done by STRATA[1]: one impulse, not a second wave
var CLOSE = 380               // a dot closes into its place over this
var LAND_LEAD = 0.8           // as the core is this many rows past its row, from the row's left end
var V_SWEEP = 2.0             // ... rightwards, so fast (px per ms)
var WAKE = [0.6, 170]         // a row's words light this far behind the core (rows), over this (ms)
var FINAL_OUT = [4300, 4450]  // and everything is lit by the end, whatever
var SEP_FADE = 0.2
var DUP_IN = 0.04, DUP_OUT = 0.25

function smoother(x) { return x * x * x * (x * (6 * x - 15) + 10) }
function hash32(n) {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
    return (n ^ (n >>> 16)) >>> 0
}

// The spin every ring shares, in turns: up as x³ to the tear, then on at
// that top speed (C1). And its speed, in turns per unit of b.
function spinAt(b) {
    var x = b / B_TEAR
    return x <= 1 ? SPIN_TURNS * x * x * x : SPIN_TURNS * (1 + 3 * (x - 1))
}
function spinRateAt(b) {
    var x = Math.min(1, b / B_TEAR)
    return 3 * SPIN_TURNS * x * x / B_TEAR
}
function swell(b) { var x = Math.min(1, b / B_TEAR); return 1 + STRETCH * x * x * x * x }

// The particles, made once per knead and layout (s.markCache): one per dot
// of the sigil or the strip, whichever has more. A run with nc dots in the
// sigil and nl in the strip gets N = max(nc, nl) + 1 particles; one that
// lands on the same dot as the one before it, at one end, is a twin there
// (DUP_C, DUP_L): unseen at that end, it splits off as it is flung or
// merges as it lands. So both ends are the rest drawings exactly.
var DUP_C = 1, DUP_L = 2, SEP = 4
function burstOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "burst" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var zc = Y.R / 200, zl = Y.rh / 24, list = [], styles = [], styleAt = {}
    var styleOf = function(col, a) {
        var k = col + "@" + a
        if (styleAt[k] === undefined) { styleAt[k] = styles.length; styles.push({ col: col, a: a }) }
        return styleAt[k]
    }
    var add = function(ring, seed, lx, ly, tx, ty, rc, rl, style, flags) {
        list.push({ ring: ring, seed: seed, lx: lx, ly: ly, tx: tx, ty: ty, rc: rc, rl: rl, style: style, flags: flags })
    }
    for (var i = 0; i < RINGS.length; i++) {
        var a = RINGS[i].r[0], bb = RINGS[i].r[1]
        var loc = function(u, w) {
            var r = Y.R * (a + (bb - a) * (w + 1) / 2), th = -Math.PI / 2 + TAU * u
            return [Math.cos(th) * r, Math.sin(th) * r]
        }
        var PL = projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh)
        var K = { PC: projC(Y.cx, Y.cy, Y.R, i, 0, s), PL: PL, zc: zc, zl: zl, key: key }
        var ms = marksOf(RINGS[i].k, s)
        for (var mi = 0; mi < ms.length; mi++) {
            var mk = ms[mi], style = styleOf(mk.col, (mk.a === undefined ? 1 : mk.a) * (mk.dash ? BEAD.dashAlpha : 1))
            var seed = i * 7919 + mi * 131, l, o
            if (mk.d === "dot") {
                l = loc(mk.u, mk.w); o = PL(mk.u, mk.w)
                add(i, seed, l[0], l[1], o[0], o[1], Math.max(0.9, mk.s * zc * 0.8), Math.max(0.9, mk.s * zl * 0.8), style, 0)
                continue
            }
            var ns = runCounts(mk, K)
            var rc = clamp(mk.lw * zc * 0.5, 0.8, 2.6), rl = clamp(mk.lw * zl * 0.5, 0.8, 2.6)
            var runs = mk.d === "tick" ? [[mk.u, mk.w0, mk.u, mk.w1]]
                     : mk.d === "seg" ? [[mk.u0, mk.w, mk.u1, mk.w]]
                     : mk.pts.slice(1).map(function(pt, q) { return [mk.pts[q][0], mk.pts[q][1], pt[0], pt[1]] })
            for (var ri = 0; ri < runs.length; ri++) {
                var e = runs[ri], nc = ns[ri][0], nl = ns[ri][1], N = Math.max(nc, nl)
                var pc = 0, pl = 0
                for (var j = ri > 0 ? 1 : 0; j <= N; j++) {
                    var ic = N ? Math.round(j * nc / N) : 0, il = N ? Math.round(j * nl / N) : 0
                    var fc = nc ? ic / nc : 0.5, fl = nl ? il / nl : 0.5, flags = 0
                    if (j > 0 && ic === pc) flags |= DUP_C
                    if (j > 0 && il === pl) flags |= DUP_L
                    // A closed ring's last dot is its first, in the sigil.
                    if (mk.shut && ri === runs.length - 1 && nc && ic === nc) flags |= DUP_C
                    pc = ic; pl = il
                    l = loc(e[0] + (e[2] - e[0]) * fc, e[1] + (e[3] - e[1]) * fc)
                    o = PL(e[0] + (e[2] - e[0]) * fl, e[1] + (e[3] - e[1]) * fl)
                    add(i, seed + ri * 17 + j, l[0], l[1], o[0], o[1], rc, rl, style, flags)
                }
            }
        }
    }
    // The section dividers burst too, and burn out.
    SEPS.forEach(function(sp, si) {
        var r = Y.R * sp[1], n = Math.round(TAU * r / (BEAD.gap * 1.8)), dr = s.pal.light ? 1.05 : 0.8
        var style = styleOf(alpha(s.pal.cat[sp[0]], s.pal.light ? 0.7 : 0.45), 1)
        for (var j = 0; j < n; j++) {
            var psi = (j / n - 0.5) * TAU
            add(-1, 99991 + si * 7919 + j, Math.sin(psi) * r, -Math.cos(psi) * r, 0, 0, dr, dr, style, SEP)
        }
    })
    // Drawn by look (one fill style at a time); what each is flung by is
    // worked out over the knead's first frames (burstWork), long before the
    // tear: worked out at once, it held the first frame 30 ms.
    list.sort(function(p, q) { return p.style - q.style })
    var n = list.length, F = function() { return new Float32Array(n) }
    var P = { n: n, styles: styles, ring: new Int16Array(n), style: new Int16Array(n), flags: new Uint8Array(n), seed: new Float64Array(n),
              lx: F(), ly: F(), tx: F(), ty: F(), rc: F(), rl: F(), px: F(), py: F(), qx: F(), qy: F(), ex: F(), ey: F(),
              rel: F(), eb: F(), s4: F(), s5: F(), s6: F(), k: F(), inv: F(),
              next: 0, ready: false, offs: RINGS.map(function(r, i) { return turnOf(i, t, s).off0 }) }
    for (var k = 0; k < n; k++) {
        var q = list[k]
        P.ring[k] = q.ring; P.style[k] = q.style; P.flags[k] = q.flags; P.seed[k] = q.seed
        P.lx[k] = q.lx; P.ly[k] = q.ly; P.tx[k] = q.tx; P.ty[k] = q.ty; P.rc[k] = q.rc; P.rl[k] = q.rl
        P.rel[k] = 9   // not flung yet: still on its ring
    }
    mc[key] = P
    return P
}

// The burst's particles' flights, for up to `budget` ms (Infinity: all).
// Each is flung when the spin tears it off (the rim first), from where it
// is then, along its way round and a little outwards; it slows on a curve
// into the cloud: from there, over part of the room there is, plus a push
// its own way, scaled to stay on the stage. Then each ring's dots of one
// look take that look's places in the strip in the order they lie across
// the cloud, so neighbours don't cross on the way in (same places, same
// look: the ends are still the rest drawings).
function burstWork(P, Y, budget) {
    if (P.ready) return P
    var until = Date.now() + budget, lo = 12, hiX = Y.w - 12, hiY = Y.h - 12, n = P.n
    var room = function(px, py, dx, dy) {
        var d = 1e9
        if (dx > 1e-6) d = Math.min(d, (hiX - px) / dx); else if (dx < -1e-6) d = Math.min(d, (lo - px) / dx)
        if (dy > 1e-6) d = Math.min(d, (hiY - py) / dy); else if (dy < -1e-6) d = Math.min(d, (lo - py) / dy)
        return Math.max(0, d)
    }
    while (P.next < n) {
        var k = P.next++, ring = P.ring[k], lx = P.lx[k], ly = P.ly[k]
        var rn = rngN(hash32(P.seed[k]), 6), s1 = rn[0], s3 = rn[1], s4 = rn[2], s5 = rn[3], s6 = rn[4], s7 = rn[5]
        var off = ring >= 0 ? P.offs[ring] : 0
        var r0 = Math.sqrt(lx * lx + ly * ly)
        var rel = B_TEAR + TEAR_SPAN * (1 - Math.min(1, r0 / Y.R)) + TEAR_JIT * s1
        var ang = (off + spinAt(rel)) * TAU, cs = Math.cos(ang), sn = Math.sin(ang), sw = swell(rel)
        var px = Y.cx + (lx * cs - ly * sn) * sw, py = Y.cy + (lx * sn + ly * cs) * sw
        var rx = px - Y.cx, ry = py - Y.cy, rr = Math.sqrt(rx * rx + ry * ry)
        if (rr < 1e-6) { rx = 0; ry = -1 } else { rx /= rr; ry /= rr }
        // The way round (clockwise on screen) and a little outwards.
        var fx = -ry + RAD_MIX * rx, fy = rx + RAD_MIX * ry, fl = Math.sqrt(fx * fx + fy * fy)
        fx /= fl; fy /= fl
        var out = Math.max(FLOOR * Y.R, room(px, py, fx, fy)) * (FILL_MIN + FILL_VAR * s3), ia = TAU * s5
        var dx = fx * out + Math.cos(ia) * SCATTER * Y.R * s6, dy = fy * out + Math.sin(ia) * SCATTER * Y.R * s6
        if (ring >= 0) dy += ROW_PULL * (Y.rowY[ring] - (py + dy))
        // Scaled down to fit (not clamped: clamping stacked them on the edge).
        var kap = 1
        if (px + dx > hiX) kap = Math.min(kap, (hiX - px) / dx); else if (px + dx < lo) kap = Math.min(kap, (lo - px) / dx)
        if (py + dy > hiY) kap = Math.min(kap, (hiY - py) / dy); else if (py + dy < lo) kap = Math.min(kap, (lo - py) / dy)
        kap = Math.max(0, kap) * (kap < 1 ? 0.8 + 0.2 * s7 : 1)
        dx *= kap; dy *= kap
        // The curve's bend, so it leaves at the speed the spin gave it; a fast
        // dot with a short way to go is thrown harder and brakes harder (its
        // own impulse K), as far as that takes.
        var L = Math.sqrt(dx * dx + dy * dy) || 1, v = TAU * spinRateAt(rel) * r0 * sw
        var K = clamp(v * OUT / (2 * H_MAX * L), K_MIN, K_MAX), inv = 1 / (1 - Math.exp(-K))
        // Its control point: it leaves exactly as the spin had it going (along
        // its circle, at its speed); its band's and drift's own start comes
        // off it below, once its place is known.
        var cq = TAU * spinRateAt(rel) * OUT / (2 * K * inv)
        P.k[k] = K; P.inv[k] = inv; P.s4[k] = s4
        P.px[k] = px; P.py[k] = py; P.ex[k] = px + dx; P.ey[k] = py + dy
        // (Where its flight ends as drawn, inside the soft edge: what its band starts from.)
        P.eb[k] = softBox(py + dy, 8, Y.h - 8)
        P.qx[k] = px - (py - Y.cy) * cq; P.qy[k] = py + (px - Y.cx) * cq
        var jr = rngN(hash32(P.seed[k] * 31 + 5), 2); P.s5[k] = jr[0]; P.s6[k] = jr[1]
        P.rel[k] = rel
        if ((k & 63) === 0 && Date.now() > until) return P
    }
    if (!P.groups) {
        P.groups = {}
        for (k = 0; k < n; k++) if (!(P.flags[k] & SEP)) { var gk = P.ring[k] + "/" + P.style[k]; (P.groups[gk] = P.groups[gk] || []).push(k) }
        P.groupKeys = Object.keys(P.groups); P.gi = 0
    }
    while (P.gi < P.groupKeys.length) {
        var ks = P.groups[P.groupKeys[P.gi++]]
        var to = ks.map(function(k) { return { tx: P.tx[k], ty: P.ty[k], rl: P.rl[k], dupL: P.flags[k] & DUP_L } })
        to.sort(function(a, b) { return a.tx - b.tx || a.ty - b.ty })
        ks.sort(function(a, b) { return P.ex[a] - P.ex[b] })
        ks.forEach(function(k, j) {
            var o = to[j]; P.tx[k] = o.tx; P.ty[k] = o.ty; P.rl[k] = o.rl; P.flags[k] = (P.flags[k] & ~DUP_L) | o.dupL
            // (The band's and the drift's start, so the sum leaves at the spin's velocity.)
            var rm = P.rel[k] * T_MS, c3 = 3 * OUT * T_MS / (Math.max(1, STRATA[1] - rm) * 2 * P.k[k] * P.inv[k])
            P.qy[k] -= (o.ty + STRATA_JIT * Y.rh * (P.s5[k] - 0.5) - P.eb[k]) * c3
            P.qx[k] -= DRIFT * Math.sin(TAU * (rm / DRIFT_T + P.s6[k])) * c3
        })
        if (Date.now() > until) return P
    }
    P.ready = true
    return P
}
// The burst's particles, all worked out.
function burstReady(Y, t, s) { var P = burstOf(Y, t, s); return burstWork(P, Y, Infinity) }
// Past BOX_M from an edge, a position eases into it and never reaches it.
var softBox = (function() {
    var _BOX_M = BOX_M
    return function softBox(v, lo, hi) {
    if (v > hi - _BOX_M) return hi - _BOX_M + _BOX_M * tanh((v - hi + _BOX_M) / _BOX_M)
    if (v < lo + _BOX_M) return lo + _BOX_M - _BOX_M * tanh((lo + _BOX_M - v) / _BOX_M)
    return v
}})()


// Particle k once flung, at b: o = [x, y, r, sx, sy (its streak, a frame
// back), tg (how far it has closed into its place)]; core: the core (it is
// pushed off it). It slows on its curve into the cloud (bo: the burst's
// own clock) while settling loosely about its row's height, drifting, and
// closes into its place as the core passes its row (CP: coreOut). The same
// as paintBurst draws (inline there: a call per dot cost ~2 ms a frame).
var FP = new Float32Array(6)
function flungAt(Y, P, k, b, o, core, CP) {
    var ms = b * T_OUT, bo = ms / T_MS
    var tau = clamp((bo - P.rel[k]) / OUT, 0, 1), ek = Math.exp(-P.k[k] * tau), f = (1 - ek) * P.inv[k], g = 1 - f
    var x = softBox(g * g * P.px[k] + 2 * g * f * P.qx[k] + f * f * P.ex[k], 8, Y.w - 8)
    var y = softBox(g * g * P.py[k] + 2 * g * f * P.qy[k] + f * f * P.ey[k], 8, Y.h - 8)
    var fv = P.k[k] * P.inv[k] * ek / OUT * 16.7 / T_MS * BLUR
    var sx = -fv * 2 * (g * (P.qx[k] - P.px[k]) + f * (P.ex[k] - P.qx[k])), sy = -fv * 2 * (g * (P.qy[k] - P.py[k]) + f * (P.ey[k] - P.qy[k]))
    var r = P.rc[k] * (1 - SHRINK * f), tg = 0
    if (P.ring[k] >= 0) {   // (a divider has no row: it only burns out)
        tg = smoother(clamp((ms - CP.land[P.ring[k]] - Math.max(0, P.tx[k] - CP.xL) / V_SWEEP + CLOSE) / CLOSE, 0, 1))
        var rm = P.rel[k] * T_MS, sk = Math.max(1, STRATA[1] - rm), us = clamp((ms - rm) / sk, 0, 1), gs = 1 - (1 - us) * (1 - us) * (1 - us)
        var band = P.ty[k] + STRATA_JIT * Y.rh * (P.s5[k] - 0.5) * (1 - tg) - P.eb[k]
        y += band * gs; sy -= band * 3 * (1 - us) * (1 - us) / sk * 16.7 * BLUR
        x += DRIFT * Math.sin(TAU * (ms / DRIFT_T + P.s6[k])) * (1 - tg) * gs
        x += (P.tx[k] - x) * tg
        r += (P.rl[k] - r) * tg
    }
    o[0] = x; o[1] = y; o[2] = r; o[3] = sx; o[4] = sy; o[5] = tg
    if (core && tg < 1) { var wx0 = o[0], wy0 = o[1], we = smooth(clamp((ms - P.rel[k] * T_MS) / 80, 0, 1)) * (1 - tg); wakeOff(o, core); o[0] = wx0 + (o[0] - wx0) * we; o[1] = wy0 + (o[1] - wy0) * we }
    return o
}

var RCOS = new Float32Array(RINGS.length + 1), RSIN = new Float32Array(RINGS.length + 1), RA = new Float32Array(RINGS.length)
function paintBurst(c, Y, t, s) {
    var _BLUR = BLUR, _BRAKE = BRAKE, _STK64 = STK64, _B_TEAR = B_TEAR, _CLOSE = CLOSE, _DIM_RING = DIM_RING, _DRIFT = DRIFT, _DRIFT_T = DRIFT_T, _DUP_C = DUP_C, _DUP_IN = DUP_IN, _DUP_L = DUP_L, _DUP_OUT = DUP_OUT, _FP = FP, _GLINT = GLINT, _GLINT_A = GLINT_A, _GLINT_W = GLINT_W, _OUT = OUT, _RA = RA, _RCOS = RCOS, _RINGS = RINGS, _RSIN = RSIN, _R_E = R_E, _SEP_FADE = SEP_FADE, _SHRINK = SHRINK, _STRATA = STRATA, _STRATA_JIT = STRATA_JIT, _SUCK0 = SUCK0, _TAU = TAU, _T_MS = T_MS, _T_OUT = T_OUT, _V_SWEEP = V_SWEEP
    var P = burstOf(Y, t, s), b = 1 - average(s.cur), ms = b * _T_OUT, bo = ms / _T_MS, ga = c.globalAlpha
    if (!P.ready) burstWork(P, Y, bo > _B_TEAR - 0.08 ? Infinity : 3)
    var CP = coreOut(Y, s.mark), core = coreAt(Y, b, s.mark), core0 = coreAt(Y, b - 16.7 / _T_OUT, s.mark)
    // (Fast, it is past a dot before the dot could be pushed: its push fades
    // out from 400 to 1200 px/s, rather than a one-frame jump of the dot.)
    core.w = 1 - smooth(clamp((Math.sqrt((core.x - core0.x) * (core.x - core0.x) + (core.y - core0.y) * (core.y - core0.y)) * 60 - 400) / 800, 0, 1))
    // Every ring turns with the shared spin; its own drift stops first.
    var spin = spinAt(bo), drift = 1 - smooth(clamp(bo / _BRAKE, 0, 1)), sw = swell(bo)
    for (var i = 0; i < _RINGS.length; i++) {
        var tr = turnOf(i, t, s), ang = (tr.off0 + (t - tr.t0) * layerRate(i, s) * drift + spin) * _TAU
        _RCOS[i] = Math.cos(ang) * sw; _RSIN[i] = Math.sin(ang) * sw
        _RA[i] = hiDim(s.hi < 0 || s.hi === i, 1 - b, _DIM_RING) * ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
    }
    // The dividers (ring -1) turn with the spin alone.
    _RCOS[_RINGS.length] = Math.cos(spin * _TAU) * sw; _RSIN[_RINGS.length] = Math.sin(spin * _TAU) * sw
    // Fast, a dot is drawn as the streak it makes in a frame: along its
    // circle while it spins (the angle dl back), along its path once flung.
    // Its ink is spread, so a fast ring becomes a soft band, not a hoop.
    var DB = 16.7 / _T_MS, dl = _TAU * spinRateAt(bo) * DB * _BLUR, dc = Math.cos(dl), ds = Math.sin(dl)
    var st = -1, cur = -1, cx = Y.cx, cy = Y.cy, sx = 0, sy = 0
    // The rim (its outer two rings) glints where a word goes in.
    var GL = bo > _SUCK0 && bo < _B_TEAR + _GLINT ? glintsAt(Y, bo, s) : [], rim = _RINGS.length - 2, gw = _GLINT_W / (Y.R * _R_E)
    // The particles' arrays and the frame's constants as locals, and the
    // clamps inlined: in QV4 a module variable read costs ~45 ns (a local
    // ~3) and a call ~50, and this loop did ~40 of them per dot.
    var Pring = P.ring, Pflags = P.flags, Prc = P.rc, Prel = P.rel, Plx = P.lx, Ply = P.ly, Pk = P.k, Pinv = P.inv, Ppx = P.px, Ppy = P.py, Pqx = P.qx, Pqy = P.qy, Pex = P.ex, Pey = P.ey, Peb = P.eb
    var Ptx = P.tx, Pty = P.ty, Prl = P.rl, Ps5 = P.s5, Ps6 = P.s6, Pstyle = P.style, styles = P.styles, land = CP.land, xL = CP.xL, nR = _RINGS.length
    var wHi = Y.w - 8, hHi = Y.h - 8, jit = _STRATA_JIT * Y.rh, fvK = DB * _BLUR / _OUT, bandK = 3 * 16.7 * _BLUR, msT = ms / _DRIFT_T, rr0 = core.r + 1.5, ccx = core.x, ccy = core.y
    for (var k = 0, n = P.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r = Prc[k], tg = 0, exact = true, rel = Prel[k]
        var tau = (bo - rel) / _OUT
        tau = tau < 0 ? 0 : tau > 1 ? 1 : tau
        sx = 0; sy = 0
        if (tau <= 0) {
            var ri = ring >= 0 ? ring : nR, lx = Plx[k], ly = Ply[k]
            x = cx + lx * _RCOS[ri] - ly * _RSIN[ri]; y = cy + lx * _RSIN[ri] + ly * _RCOS[ri]
            exact = b <= 0
            // Where it was a frame ago: turned back by dl.
            var ox = x - cx, oy = y - cy
            sx = cx + ox * dc + oy * ds - x; sy = cy - ox * ds + oy * dc - y
        }
        else {
            // As flungAt (inline: a call per dot cost ~2 ms a frame).
            var kk = Pk[k], ek = Math.exp(-kk * tau), f = (1 - ek) * Pinv[k], g = 1 - f
            var px = Ppx[k], py = Ppy[k], qx = Pqx[k], qy = Pqy[k], ex = Pex[k], ey = Pey[k]
            x = g * g * px + 2 * g * f * qx + f * f * ex; y = g * g * py + 2 * g * f * qy + f * f * ey
            // (softBox only does anything within its margin of an edge.)
            if (x < 28 || x > wHi - 20) x = softBox(x, 8, wHi)
            if (y < 28 || y > hHi - 20) y = softBox(y, 8, hHi)
            var fv = kk * Pinv[k] * ek * fvK
            sx = -fv * 2 * (g * (qx - px) + f * (ex - qx)); sy = -fv * 2 * (g * (qy - py) + f * (ey - qy))
            r *= 1 - _SHRINK * f
            // Settling into its row's band from its release, slowing all the
            // way (a divider has no row: it only burns out).
            if (ring >= 0) {
                var tx = Ptx[k]
                tg = (ms - land[ring] - (tx > xL ? tx - xL : 0) / _V_SWEEP + _CLOSE) / _CLOSE
                tg = tg <= 0 ? 0 : tg >= 1 ? 1 : tg * tg * tg * (tg * (6 * tg - 15) + 10)
                var rm = rel * _T_MS, sk = _STRATA[1] - rm
                if (sk < 1) sk = 1
                var us = (ms - rm) / sk
                us = us < 0 ? 0 : us > 1 ? 1 : us
                var u1 = 1 - us, gs = 1 - u1 * u1 * u1
                var band = Pty[k] + jit * (Ps5[k] - 0.5) * (1 - tg) - Peb[k]
                y += band * gs; sy -= band * u1 * u1 / sk * bandK
                x += _DRIFT * Math.sin(_TAU * (msT + Ps6[k])) * (1 - tg) * gs
                x += (tx - x) * tg
                r += (Prl[k] - r) * tg
            }
            exact = tg >= 1
            // The core parts the dots it passes (not those already in their
            // line: it is past them by then).
            var wx = x - ccx, wy = y - ccy
            if (tg < 1 && wx * wx + wy * wy < 9 * (rr0 + r) * (rr0 + r)) { var we = (ms - rel * _T_MS) / 80; we = (we >= 1 ? 1 : we * we * (3 - 2 * we)) * (1 - tg); _FP[0] = x; _FP[1] = y; _FP[2] = r; wakeOff(_FP, core); x += (_FP[0] - x) * we; y += (_FP[1] - y) * we }   // (let go as it closes, not at once)
        }
        var a = ring >= 0 ? _RA[ring] : 1 - smooth(clamp((bo - rel) / _SEP_FADE, 0, 1))
        var boost = 0
        if (GL.length && ring >= rim && tau <= 0) {
            var at = Math.atan2(y - cy, x - cx)
            for (var g = 0; g < GL.length; g += 2) {
                var d = Math.abs(at - GL[g]); if (d > Math.PI) d = _TAU - d
                if (d < gw) boost = Math.max(boost, GL[g + 1] * (1 - d / gw))
            }
            r *= 1 + 0.25 * boost
        }
        if (flags & _DUP_C) a *= smooth(clamp((bo - rel) / _DUP_IN, 0, 1))
        if (flags & _DUP_L) a *= 1 - smooth(clamp((tg - 1 + _DUP_OUT) / _DUP_OUT, 0, 1))
        if (a < 0.01) continue
        var sty = Pstyle[k], sl = Math.sqrt(sx * sx + sy * sy)
        a *= ga * styles[sty].a
        if (boost > 0) a = Math.min(1, a * (1 + _GLINT_A * boost))
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK64[sj] + _STK64[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        drawPart(c, x, y, r, sx, sy, sl, exact, 6, 4)
    }
    c.globalAlpha = ga
    paintCore(c, core, s, core0)
}

// A streak's samples share their dot's ink (STREAK_GLOW more once it is
// long), their overlaps counted: the alpha each is drawn with, from the
// dot's own a0. Continuous in sl (no step as a dot starts or stops
// streaking), and a fast dot no longer brightens (the 0.45 floor and up to
// 4 samples gave it 1.8 times its ink).
var STREAK_GLOW = 1.3
function streakAlpha(a0, r, sx, sy, sl, most, samples) {
    // (Its glow by its length before the cap: a tiny dot's cap can be under 2 px.)
    var e = sl - 2, cap = most * r
    if (sl > cap) { sx *= cap / sl; sy *= cap / sl; sl = cap }
    var ns = Math.min(samples, Math.ceil(sl / (2 * r)) + 1), s2 = 2 * r * (r > BEAD.square ? 0.841 : 0.886)
    var ox = s2 - Math.abs(sx) / (ns - 1), oy = s2 - Math.abs(sy) / (ns - 1)
    var B = ox > 0 && oy > 0 ? (ns - 1) * ox * oy / (s2 * s2) : 0
    var T = a0 * (1 + (STREAK_GLOW - 1) * Math.min(1, e / (4 * r))), tm = B < ns / 2 ? ns - B : ns * ns / (4 * B)
    if (T > tm) T = tm
    return B > 1e-6 ? (ns - Math.sqrt(ns * ns - 4 * B * T)) / (2 * B) : T / ns
}
// The same as a table, cheap per frame: the samples' alpha over the dot's
// (the mean of a streak along an axis and one at 45°), by r (quarter px)
// and sl / r (eighths: so its sample count changes on a bin's edge, exactly
// where drawPart's does, ceil(sl / 2r) + 1). STK64: at most 6r and 4
// samples; STK43: 4r and 3 (the denser kneads).
function streakTable(most, samples) {
    // [ri][ui][2]: the factor for a dot of alpha 0.5, and its change to alpha 1
    // (the overlaps' compositing isn't linear in alpha: interpolated by the dot's own).
    var t = new Float32Array(16 * 64 * 2)
    for (var ri = 0; ri < 16; ri++) for (var ui = 0; ui < 64; ui++) {
        var r = (ri + 0.5) / 4, sl = Math.max(2.001, (ui + 0.5) / 8 * r), d = sl / Math.SQRT2
        var f5 = (streakAlpha(0.5, r, sl, 0, sl, most, samples) + streakAlpha(0.5, r, d, d, sl, most, samples)) / 1.0
        var f1 = (streakAlpha(1, r, sl, 0, sl, most, samples) + streakAlpha(1, r, d, d, sl, most, samples)) / 2
        t[(ri * 64 + ui) * 2] = f5; t[(ri * 64 + ui) * 2 + 1] = f1 - f5
    }
    return t
}
var STK64 = streakTable(6, 4), STK43 = streakTable(4, 3)
// A particle at (x, y), r, its streak (sx, sy) (sl long) back to where it
// was a frame ago, if it is long enough to show, at most `most` radii long
// in `samples` dots (6, 4 by default). Exact: at rest, drawn as the rest
// drawings draw it.
var drawPart = (function() {
    var _BEAD = BEAD
    return function drawPart(c, x, y, r, sx, sy, sl, exact, most, samples) {
    if (sl > 2) {
        // A streak: dots of its own size along it, touching, so it reads
        // as a smear (a stroke or a filled quad per dot cost several times
        // the frame budget). Squares for the small ones, as below.
        var cap = (most || 6) * r
        if (sl > cap) { sx *= cap / sl; sy *= cap / sl; sl = cap }
        var ns = Math.min(samples || 4, Math.ceil(sl / (2 * r)) + 1), hh = r * (r > _BEAD.square ? 0.841 : 0.886)
        for (var q = 0; q < ns; q++) {
            var u = q / (ns - 1)
            if (r > _BEAD.round) beadDot(c, x + sx * u, y + sy * u, r)
            else c.fillRect(x + sx * u - hh, y + sy * u - hh, 2 * hh, 2 * hh)
        }
        return
    }
    // In flight (and spinning) a small dot is a square of the same area
    // (the octagon's, where the rest drawing draws an octagon: no step in
    // ink as a knead leaves it or comes back to it): nobody can tell, and
    // it skips the path.
    if (exact || r > _BEAD.round) beadDot(c, x, y, r)
    else { var h = r * (r > _BEAD.square ? 0.841 : 0.886); c.fillRect(x - h, y - h, 2 * h, 2 * h) }
}})()


// The core's way, a body with some weight: out, it is the burst's last
// dot, flung from the sigil's centre down to the strip's bottom-left, where
// it comes to rest, and rises
// like a bubble, up just inside the track's left edge past every row (each
// is read from its left end, as a line is), wobbling a little, gathering
// speed against its drag, and is caught under the logo (m, in stage
// coordinates) and eased into it, which pulses. Back, it drops out of the
// logo, falling against its drag down the same edge, and a spring catches
// it below the last row and settles it at the sigil's centre. All in
// closed form, so a pure function of time.
var CORE_SINK = [1420, 2300]   // out: flung (as the tear's last) to the strip's foot, then still till it rises
var CORE_FLING = [700, 6]      // the flight's length (ms) and impulse (as a dot's, dying away)
var CORE_END = 4300            // ... and into the logo by then
var CORE_RAMP = 30, CORE_FADE = 110   // its fling comes up over this (ms: a body, not a point); it sinks into the logo over this
var BUOY_TAU = 300             // the rise's speed comes up over this (ms)
var DROP_TAU = 450, DROP_BOT = 2000   // back: the fall's, and when it is through the last row
var SPRING_Z = 0.75, SNAP = [2500, 2800]   // the catch's damping; exactly at the centre by the end of SNAP
var WOBBLE = [6, 3], WOBBLE_L = 2.4      // its sway (px, out and back, at most 3% of the track), and wavelength (rows)
var CORE_PLAN = { key: "" }
// The way, once per layout: { xL (up the left edge), yLow (the foot), yc
// (where the logo catches it), vT (the rise's top speed), sc, d (when the
// catch starts, how long), vt (the fall's), w, wd, sx/sy (the spring) }.
function corePlan(Y, mark) {
    var m = mark || { x: 30, y: -30 }, key = [Y.w, Y.h, Y.cx, Y.cy, Y.R, Y.tx0, Y.tx1, Y.rh, m.x, m.y].join()
    if (CORE_PLAN.key === key) return CORE_PLAN
    var r0 = Math.max(2, Y.R * 0.014), aOut = Math.min(WOBBLE[0], 0.03 * (Y.tx1 - Y.tx0)), rh = Y.rh
    var top = Math.min.apply(null, Y.rowY), last = Math.max.apply(null, Y.rowY)
    var pl = { key: key, m: m, r0: r0, aOut: aOut, aBack: Math.min(WOBBLE[1], aOut), xL: Y.tx0 + r0 + 4 + aOut,
               yLow: Math.min(Y.h - 10, last + 0.7 * rh), yc: m.y + 24, kTop: top - 0.5 * rh, lam: WOBBLE_L * rh, rh: rh }
    // The rise: how long until it reaches yc at top speed vT, and the catch.
    var climb = function(vT) {
        var need = (pl.yLow - pl.yc) / vT, lo = 0, hi = 1e5
        for (var n = 0; n < 60; n++) { var mid = (lo + hi) / 2; if (mid - BUOY_TAU * (1 - Math.exp(-mid / BUOY_TAU)) < need) lo = mid; else hi = mid }
        var vc = Math.max(1e-3, vT * (1 - Math.exp(-lo / BUOY_TAU)))
        return { sc: lo, vc: vc, d: Math.min(5000, 2 * Math.max(0, pl.yc - m.y) / vc) }
    }
    var lo = 0.01, hi = 10
    for (var n = 0; n < 60; n++) { var mid = (lo + hi) / 2, c = climb(mid); if (CORE_SINK[1] + c.sc + c.d > CORE_END) lo = mid; else hi = mid }
    var c0 = climb(hi)
    pl.vT = hi; pl.sc = c0.sc; pl.d = c0.d
    // The fall: from rest at the logo, through the last row at DROP_BOT.
    var yBot = last
    pl.vt = (yBot - m.y) / (DROP_TAU * Math.log(Math.cosh(DROP_BOT / DROP_TAU)))
    // The spring: from where and how fast it falls there, to the centre;
    // as stiff as it must be to stay above the stage's foot.
    var x0 = coreX(pl, yBot, pl.aBack), v0y = pl.vt * Math.tanh(DROP_BOT / DROP_TAU)
    var v0x = (coreX(pl, yBot + 0.5, pl.aBack) - coreX(pl, yBot - 0.5, pl.aBack)) * v0y
    var floor = Math.min(Y.h - r0 - 2, yBot + 0.7 * rh)
    pl.sx = { a: x0 - Y.cx, v: v0x }; pl.sy = { a: yBot - Y.cy, v: v0y }
    for (var w = 0.008; w <= 0.0301; w += 0.0005) {
        pl.w = w; pl.wd = w * Math.sqrt(1 - SPRING_Z * SPRING_Z)
        var low = -1e9
        for (var t = 0; t <= 1500; t += 10) low = Math.max(low, Y.cy + springAt(pl, pl.sy, t))
        if (low <= floor) break
    }
    CORE_PLAN = pl
    return pl
}
// The core's x at height y on the way up or down: just inside the track's
// left edge, swaying (sway: its amplitude), leaving it for the logo only
// above the top row (out, all the way up into it: it arrives on an arc).
function coreX(pl, y, sway, out) {
    var env = smooth(clamp((pl.yLow - y) / pl.rh, 0, 1)), k2 = smooth(clamp((pl.kTop - y) / (pl.kTop - (out ? pl.m.y : pl.yc)), 0, 1))
    return lerp(pl.xL + sway * Math.sin(TAU * (pl.yLow - y) / pl.lam) * env, pl.m.x, k2)
}
// The spring's offset from the centre, s ms after it caught it (one axis).
function springAt(pl, ax, s) {
    var zw = SPRING_Z * pl.w, B = (ax.v + zw * ax.a) / pl.wd
    return Math.exp(-zw * s) * (ax.a * Math.cos(pl.wd * s) + B * Math.sin(pl.wd * s))
}
// The core at time t (ms) of the knead, out or back: { x, y, r, a }.
function coreWay(Y, t, mark, back) {
    var pl = corePlan(Y, mark), m = pl.m, r0 = pl.r0, x, y, r = r0, a = 1
    if (!back) {
        if (t <= CORE_SINK[0]) return { x: Y.cx, y: Y.cy, r: r0, a: 1 }
        if (t < CORE_SINK[1]) {
            // Flung down, and bending left along the foot (through (cx, yLow)).
            // (Its clock eased in over CORE_RAMP, so it gathers speed in a few
            // frames rather than leaving the centre at full speed.)
            var rho = CORE_RAMP / CORE_FLING[0], sl = Math.min(1, (t - CORE_SINK[0]) / CORE_FLING[0])
            sl = (sl - rho * (1 - Math.exp(-sl / rho))) / (1 - rho * (1 - Math.exp(-1 / rho)))
            var K = CORE_FLING[1], f = (1 - Math.exp(-K * sl)) / (1 - Math.exp(-K)), g = 1 - f
            return { x: g * g * Y.cx + 2 * g * f * Y.cx + f * f * pl.xL, y: g * g * Y.cy + 2 * g * f * pl.yLow + f * f * pl.yLow, r: r0, a: 1 }
        }
        var sr = t - CORE_SINK[1]
        if (sr < pl.sc) { y = pl.yLow - pl.vT * (sr - BUOY_TAU * (1 - Math.exp(-sr / BUOY_TAU))); x = coreX(pl, y, pl.aOut, true) }
        else {
            // Caught: eased into the logo from the speed it came at.
            var q = Math.min(1, (sr - pl.sc) / pl.d)
            // (It fades over its last CORE_FADE ms, not in two frames.)
            y = pl.yc - (pl.yc - m.y) * (1 - (1 - q) * (1 - q)); x = coreX(pl, y, pl.aOut, true)
            r = lerp(r0, 2.5, q); a = 1 - smooth(clamp((sr - pl.sc - pl.d) / Math.min(CORE_FADE, pl.d) + 1, 0, 1))
        }
        return { x: x, y: y, r: r, a: a }
    }
    if (t < DROP_BOT) {
        y = m.y + pl.vt * DROP_TAU * Math.log(Math.cosh(t / DROP_TAU))
        return { x: coreX(pl, y, pl.aBack), y: y, r: lerp(2.5, r0, smooth(clamp(t / 300, 0, 1))), a: smooth(clamp(t / 100, 0, 1)) }
    }
    var s = t - DROP_BOT, snap = 1 - smooth(clamp((t - SNAP[0]) / (SNAP[1] - SNAP[0]), 0, 1))
    return { x: Y.cx + springAt(pl, pl.sx, s) * snap, y: Y.cy + springAt(pl, pl.sy, s) * snap, r: r0, a: 1 }
}
function coreAt(Y, b, mark) { return coreWay(Y, b * T_OUT, mark, false) }
function coreBack(Y, tr, mark) { return coreWay(Y, tr, mark, true) }
// When the logo pulses as the core touches it (b).
function burstCorePulse(Y, mark) { var pl = corePlan(Y, mark); return (CORE_SINK[1] + pl.sc + pl.d - 0.6 * Math.min(CORE_FADE, pl.d)) / T_OUT }
// When the core is past each row: out, when each lands (rows LAND_LEAD
// behind it, going up); back, when it crosses each (half a row above it,
// going down), and each head's lane. Once per layout; xL: the core's edge.
var CORE_TIMES = { key: "" }
function coreTimes(Y, mark) {
    var pl = corePlan(Y, mark), m = pl.m
    if (CORE_TIMES.key === pl.key) return CORE_TIMES
    // (Bounded whatever the plan says: a layout not yet sized gives nonsense.)
    var outT = [], outY = [], backT = [], backY = [], end = Math.min(CORE_SINK[1] + pl.sc + pl.d, T_OUT)
    for (var t = CORE_SINK[1]; t <= end; t += 4) { outT.push(t); outY.push(coreWay(Y, t, m, false).y) }
    for (t = 0; t <= DROP_BOT; t += 4) { backT.push(t); backY.push(coreWay(Y, t, m, true).y) }
    var upPast = function(y) { for (var j = 0; j < outY.length; j++) if (outY[j] <= y) return outT[j]; return end }
    var downTo = function(y) { for (var j = 0; j < backY.length; j++) if (backY[j] >= y) return backT[j]; return DROP_BOT }
    var land = new Float32Array(RINGS.length), cross = new Float32Array(RINGS.length), heads = {}
    for (var i = 0; i < RINGS.length; i++) { land[i] = upPast(Y.rowY[i] - LAND_LEAD * Y.rh); cross[i] = downTo(Y.rowY[i] - 0.5 * Y.rh) }
    // (A head's line runs across the core's way: it goes when the core is
    // two rows above it.)
    CATS.forEach(function(cat) { heads[cat] = cat === "age" ? 0 : downTo(Y.heads[cat] - 2 * Y.rh) })
    // Out, when the core is WAKE[0] rows above each row and head: its words
    // light from then (WAKE[1]: the fade's length, ms).
    var wake = new Float32Array(RINGS.length), wakeH = {}
    for (i = 0; i < RINGS.length; i++) wake[i] = upPast(Y.rowY[i] - WAKE[0] * Y.rh)
    CATS.forEach(function(cat) { wakeH[cat] = upPast(Y.heads[cat] - WAKE[0] * Y.rh) })
    CORE_TIMES = { key: pl.key, land: land, cross: cross, heads: heads, xL: pl.xL, wake: wake, wakeH: wakeH }
    return CORE_TIMES
}
function coreOut(Y, mark) { return coreTimes(Y, mark) }
// A dot too near the core is pushed straight off it (o: [x, y, r, ...]),
// so the core never covers one, nor one the core.
// Smoothly: a dot d from the core is moved out to sqrt(d² + room²), never
// nearer than room and less the further it is (a hard push to room started
// and stopped it with a jolt as the core went by), easing off to nothing by
// 3 rooms (not reaching the rows the core rises by). core.w, if set, scales
// the push (the burst's fast core).
function wakeOff(o, core) {
    if (core.a <= 0.02) return
    var ex = o[0] - core.x, ey = o[1] - core.y, e2 = ex * ex + ey * ey, room = core.r + o[2] + 1.5
    if (e2 > 9 * room * room || e2 < 1e-6) return
    var el = Math.sqrt(e2), push = (Math.sqrt(e2 + room * room) - el) * (1 - smooth(clamp((el - room) / (2 * room), 0, 1))) * (core.w === undefined ? 1 : core.w)
    o[0] += ex / el * push; o[1] += ey / el * push
}
// The core (o), and its streak back to where it was a frame ago (prev), when
// it moves fast enough to show one.
function paintCore(c, o, s, prev) {
    if (o.a < 0.01) return
    c.fillStyle = s.pal.fg
    var sx = prev ? prev.x - o.x : 0, sy = prev ? prev.y - o.y : 0, sl = Math.sqrt(sx * sx + sy * sy), cap = 3 * o.r
    if (sl > 0.15 * 16.7) {
        if (sl > cap) { sx *= cap / sl; sy *= cap / sl; sl = cap }
        c.globalAlpha = o.a * clamp(2 * o.r / (2 * o.r + sl), 0.45, 1)
        for (var q = 0; q < 3; q++) { c.beginPath(); c.arc(o.x + sx * q / 2, o.y + sy * q / 2, o.r, 0, TAU, false); c.fill() }
    }
    else { c.globalAlpha = o.a; c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU, false); c.fill() }
    c.globalAlpha = 1
}

// ------------------------------------------------------------------ suck-in

// As it winds up, the sigil reels the list in, a row at a time, faster and
// faster: each row is caught by the rim (which glints there) and carried
// off with it as it fades, the last gone before the tear. The rows only
// ever touch the rim from outside (R_E sigil radii), never the rings, and
// never each other (see suckPlan). Back to the sigil, each comes off the
// rim and back out into its place.
var SUCK0 = 0.05, ROW_STAG = 0.0055     // the first row's start, and each next row's (b), beside
var A_DUR = 0.07                        // the pull, to the rim (beside)
var CARRY_DUR = 0.05                    // carried round, fading, for at most this
var CARRY_W = 70                        // ... or this far round (degrees)
var R_E = 1.1
var PULL_SC = 0.75, CARRY_SC = 0.35     // its size as it's caught, and as it's gone
var GLINT = 0.03, GLINT_A = 0.6, GLINT_W = 12   // how long (b), how bright, how wide (px)
var HEAD_REEL = 0.35                    // a head's line reels in over this much of its pull
var CLUTCH = 0.015                      // the rim takes a caught item up to its speed over this (b)

// An item it: { x, y (centre at rest), w, h, j (its list row) }: a head,
// or a whole row (icon, name and value).
//
// Beside the sigil each row keeps to its own band: it slides in at its
// height until its near end touches the rim (at R_E), which then turns it
// with itself, as if part of it, about its centre. The rows go in from the
// bottom up, so each one caught is turned further than the one above it,
// down and away from it: no two rows ever meet. Carried until the card
// ends, or CARRY_W at most.
//
// Below the sigil the list rises into the rim as one, creeping and then
// pulled faster and faster as the rings speed up, and each row is
// swallowed where it touches the rim's bottom: it shrinks into that point,
// by how far it has risen past it, as the rim carries the point off (left,
// and so up, away from the next row, which never comes closer than a
// row's height).
var RISE_END = 0.255                    // below: the last row is gone by then
// Plans depend on the layout and the item only: kept, as every frame asks
// for each several times.
var PLANS = {}, PLAN_N = 0
function suckPlan(Y, it) {
    var key = [Y.w, Y.h, Y.R, Y.unit, it.j, it.x, it.y, it.w].join()
    if (PLANS[key]) return PLANS[key]
    if (++PLAN_N > 400) { PLANS = {}; PLAN_N = 1 }
    return (PLANS[key] = planOf(Y, it))
}
function planOf(Y, it) {
    var N = LIST.length, re = R_E * Y.R
    if (Y.narrow) {
        // The rise D·x^1.5 over SUCK0..RISE_END, D: past the last row by a row.
        var top = Y.cy + re, D = Y.yI(N - 1) - it.h / 2 - top + Y.ih, L = clamp(it.y - it.h / 2 - top, 0, D)
        return { start: SUCK0, bc: SUCK0 + (RISE_END - SUCK0) * Math.pow(L / D, 2 / 3), L: L, D: D }
    }
    var start = SUCK0 + ROW_STAG * (N - 1 - it.j), pl = { start: start, bc: start + A_DUR, rot: 0 }
    // Its near end (px, py), caught on the rim; its centre (ex, ey).
    var dy = clamp(it.y - Y.cy, -0.97 * re, 0.97 * re)
    pl.px = Y.cx + Math.sqrt(re * re - dy * dy); pl.py = it.y
    pl.ex = pl.px + it.w * PULL_SC / 2; pl.ey = it.y
    // How far round before any corner would leave the card.
    var cmax = CARRY_W * Math.PI / 180
    for (var dp = 0.035; dp <= cmax; dp += 0.035) {
        var o = carried(Y, pl, it, dp, PULL_SC), hw = it.w * PULL_SC / 2, hh = it.h * PULL_SC / 2, c = Math.cos(o.r), sn = Math.sin(o.r), out = false
        for (var q = 0; q < 4; q++) {
            var qx = o.x + (q & 1 ? hw : -hw) * c - (q & 2 ? hh : -hh) * sn, qy = o.y + (q & 1 ? hw : -hw) * sn + (q & 2 ? hh : -hh) * c
            if (qx < 2 || qx > Y.w - 2 || qy < 2 || qy > Y.h - 2) out = true
        }
        if (out) { cmax = Math.max(0.1, dp - 0.035); break }
    }
    pl.cmax = cmax
    return pl
}
function riseAt(pl, b) { return pl.D * Math.pow(clamp((b - pl.start) / (RISE_END - pl.start), 0, 1), 1.5) }

// Beside the sigil: its centre { x, y } and turn r (radians), carried dp
// round, at scale sc: turned about the sigil's centre, its near end on the
// rim as it shrinks.
function carried(Y, pl, it, dp, sc) {
    var c = Math.cos(dp), sn = Math.sin(dp), dx = pl.px - Y.cx, dy = pl.py - Y.cy
    return { x: Y.cx + dx * c - dy * sn + c * it.w * sc / 2, y: Y.cy + dx * sn + dy * c + sn * it.w * sc / 2, r: dp }
}

// The item at b: { x, y } its centre, rot (degrees, clockwise), sc, a, s
// (how far into its pull, 0 at rest, 1 caught).
function suckAt(Y, b, it) {
    if (b < 0) return throwAt(Y, -b, it)
    var pl = suckPlan(Y, it)
    if (b <= pl.start) return { x: it.x, y: it.y, rot: 0, sc: 1, a: 1, s: 0 }
    if (Y.narrow) {
        if (b < pl.bc) return { x: it.x, y: it.y - riseAt(pl, b), rot: 0, sc: 1, a: 1, s: pl.L > 0 ? riseAt(pl, b) / pl.L : 1 }
        // Swallowed at the point it touched, which the rim carries off.
        var tau = clamp((riseAt(pl, b) - pl.L) / Y.ih, 0, 1), sc = 1 - tau, ph = Math.PI / 2 + TAU * (spinAt(b) - spinAt(pl.bc))
        var re = R_E * Y.R, kx = Y.cx + re * Math.cos(ph), ky = Y.cy + re * Math.sin(ph)
        return { x: kx + (it.x - Y.cx) * sc, y: ky + it.h / 2 * sc, rot: 0, sc: sc, a: 1 - smooth(tau), s: 1 }
    }
    var s = clamp((b - pl.start) / A_DUR, 0, 1)
    if (b < pl.bc) {
        var e = s * s * (3 - 2 * s)   // (eased to the touch: the rim takes it from there)
        return { x: lerp(it.x, pl.ex, e), y: it.y, rot: 0, sc: lerp(1, PULL_SC, e), a: 1, s: s }
    }
    // Turned with the rim, which takes it up to its own speed over CLUTCH
    // (as smooth(x)): the spin since the catch, less the way that lags.
    var x = Math.min(1, (b - pl.bc) / CLUTCH), dp = TAU * (spinAt(b) - spinAt(pl.bc) - spinRateAt(pl.bc) * CLUTCH * (x - x * x * x + x * x * x * x / 2))
    // It fades and shrinks over CARRY_DUR, whatever; carried no further than
    // cmax (it slips on the rim as it nears that: no corner leaves the card).
    var u = smooth(clamp((b - pl.bc) / CARRY_DUR, 0, 1))
    dp = pl.cmax * tanh(dp / pl.cmax)
    var scc = lerp(PULL_SC, CARRY_SC, u), o = carried(Y, pl, it, dp, scc)
    return { x: o.x, y: o.y, rot: o.r * 180 / Math.PI, sc: scc, a: 1 - u, s: 1 }
}

// Back to the sigil the list is thrown out of the rim, on a way of its own
// (u: 0 in the rim, 1 at rest; listB gives it as -u): beside, each item
// leaves the rim at its own height, the top one first, and glides along
// its row to its place, easing to a stop as it grows to its size; below,
// the whole list slides down out of the rim's foot.
var THROW_STAG = 0.4, THROW_SC = 0.6, THROW_IN = 0.3
function throwAt(Y, u, it) {
    if (u >= 1) return { x: it.x, y: it.y, rot: 0, sc: 1, a: 1, s: 0 }
    var N = LIST.length
    if (Y.narrow) {
        var top = Y.cy + R_E * Y.R, D = Y.yI(N - 1) - it.h / 2 - top + Y.ih, e = 1 - Math.pow(1 - u, 3), y = it.y - D * (1 - e)
        return { x: it.x, y: y, rot: 0, sc: 1, a: smooth(clamp((y - it.h / 2 - top) / Y.ih, 0, 1)), s: 1 - e }
    }
    var pl = suckPlan(Y, it), v = throwV(u, it.j, N), ev = 1 - Math.pow(1 - v, 3), x0 = Math.min(pl.px + it.w * THROW_SC / 2, it.x)
    return { x: lerp(x0, it.x, ev), y: it.y, rot: 0, sc: lerp(THROW_SC, 1, ev), a: smooth(clamp(v / THROW_IN, 0, 1)), s: 1 - ev }
}
function throwV(u, j, N) { return clamp((u - THROW_STAG * j / Math.max(1, N - 1)) / (1 - THROW_STAG), 0, 1) }

// Where it touches the rim, at b (for the glints).
function suckTouch(Y, pl, b) {
    if (Y.narrow) return Math.PI / 2 + TAU * (spinAt(b) - spinAt(pl.bc))
    return Math.atan2(pl.py - Y.cy, pl.px - Y.cx) + TAU * (spinAt(b) - spinAt(pl.bc))
}

// Where a part of an item, (dx, dy) from its centre at rest, is now.
function suckPart(sk, dx, dy) {
    var t = sk.rot * Math.PI / 180, c = Math.cos(t) * sk.sc, sn = Math.sin(t) * sk.sc
    return { x: sk.x + dx * c - dy * sn, y: sk.y + dx * sn + dy * c }
}

// The list's items, as they rest: a head, and a row (its icon, name and
// value: suckLabel, suckValue give the same). nw, vw: the name's and the
// value's widths.
function suckHead(Y, cat, tw) {
    var j = LIST_AT["h:" + cat]
    return { x: Y.ix + 6 + tw / 2, y: Y.yI(j), w: tw, h: 16, j: j }
}
function suckLabel(Y, i, nw, vw) {
    var p = textPos(Y, i, 1, Y.unit || 13, 0), x0 = Y.ix + 6, x1 = vw > 0 ? p.valueX + vw : p.nameX + nw
    return { x: (x0 + x1) / 2, y: p.y, w: x1 - x0, h: 16, j: LIST_AT[i] }
}
function suckValue(Y, i, nw, vw) { return suckLabel(Y, i, nw, vw) }
function suckItems(Y, s) {
    var out = [], W = s.wordW || {}
    CATS.forEach(function(cat) { out.push(suckHead(Y, cat, s.headW ? s.headW[cat] || 0 : 0)) })
    for (var i = 0; i < RINGS.length; i++) {
        var nw = W.names ? W.names[i] || 0 : 0, vw = W.vals ? W.vals[i] || 0 : 0
        out.push(suckLabel(Y, i, nw, vw))
    }
    return out
}

// The rim's glints at b, where it catches each item: [angle, strength, ...];
// back to the sigil (b: the mode's listB, B_SUCK..0), where it lets each go.
function glintsAt(Y, b, s, back) {
    var out = [], items = suckItems(Y, s)
    if (back) {
        var u = 1 - clamp(b / B_SUCK, 0, 1)
        for (var q = 0; q < items.length; q++) {
            var g0 = 1 - Math.abs(throwV(u, items[q].j, LIST.length) - 0.06) / 0.12
            if (g0 > 0) out.push(Y.narrow ? Math.PI / 2 : Math.atan2(items[q].y - Y.cy, suckPlan(Y, items[q]).px - Y.cx), smooth(g0))
        }
        return out
    }
    for (var i = 0; i < items.length; i++) {
        var pl = suckPlan(Y, items[i]), g = 1 - Math.abs(b - pl.bc) / (GLINT / 2)
        if (g > 0) out.push(suckTouch(Y, pl, b), smooth(g))
    }
    return out
}

// Hover dimming, eased away while a knead runs, so a stray pointer never
// dims anything in flight.
function hiDim(on, shape, dim) {
    if (on) return 1
    return lerp(dim, 1, smooth(clamp(Math.min(shape, 1 - shape) / 0.04, 0, 1)))
}

// -------------------------------------------------------------------- modes

// The ways a knead can go (the burst is one). A mode is { title, T_OUT, T_R
// (its two lengths, ms), paint(c, Y, t, s) (the dots and the core, for
// shape s.cur, going back if s.back; the background and the list's icons
// and lines are drawn around it), and optionally: prepare(Y, t, s) (as a
// knead starts), wordAlpha(k, Y, id, w, part) (a word's alpha, both sides:
// k > 0.5 is the list), listB(b, back) (the list's words' place in the
// suck-in: 0 keeps them where they are), corePulse(Y, mark) (b at which
// the logo pulses going out; < 0: never), pulseBack (the logo pulses as a
// way back starts) }. A mode file registers itself (register) when the
// card imports it.
var MODES = {}, MODE_ORDER = []
function register(name, m) { if (!MODES[name]) MODE_ORDER.push(name); MODES[name] = m }
function modeOf(name) { return MODES[name] || MODES.burst }
function modeNames() { return MODE_ORDER.slice() }
function durOut(mode) { return modeOf(mode).T_OUT }
function durBack(mode) { return modeOf(mode).T_R }
function prepare(Y, t, s) { var m = modeOf(s.mode); if (m.prepare) m.prepare(Y, t, s) }
function wordAlpha(k, Y, id, w, part) { var m = modeOf(w && w.mode); return (m.wordAlpha || burstWordAlpha)(k, Y, id, w, part) }
function listB(b, back, mode) {
    var m = modeOf(mode), v = m.listB ? m.listB(b, back) : 0
    // Back, the mode's suck-in (B_SUCK..0) is the throw-out's clock: -u.
    return back ? -Math.max(1e-6, 1 - clamp(v / B_SUCK, 0, 1)) : v
}
function corePulse(Y, mark, mode) { var m = modeOf(mode); return m.corePulse ? m.corePulse(Y, mark) : -1 }

// ------------------------------------------------------------------- return

// Back to the sigil, an animation of its own, forwards in time (tr, ms):
// the logo pulses and lets the core go, falling back down its way (see
// coreWay), and each row bursts as it reaches it, from its left end out to
// its right (a fuse), its words going out in place just before. The debris settles into the burst's own cloud, never
// falling into a row still whole below, and the core comes to rest in the
// middle of it. Then every dot flies in onto its ring, its distance from
// the centre first (so it never cuts across a ring once there is one) and
// round after, arriving as fast as its ring turns: the sigil forms
// spinning, throws the list back out from its rim, and coasts to rest just
// where its own slow turn takes over.
var T_R = 4550
var V_FUSE = 2.2, PUSH_LEAD = 0.25              // the fuse along a row (px per ms); its debris lifts this much
var OUT_R = 700                                // a dot's flight into the cloud
var HOLD = [0.4, 1.6], HOLD_T = 500            // the debris hangs this many rows above its own (so above every row still whole); let go over this
var DEP0 = 2300, DEP_AFTER = 0.6, DEP_J = 40   // a dot leaves the cloud (not before DEP0, nor its flight's DEP_AFTER)
var ARR0 = 3000, ARR_J = 120                   // and is on its ring
var RHO_LEAD = 0.75                            // at its ring's distance this far into its flight
var PW_MAX = 4                                 // with less way round than its speed needs (1/PW_MAX), once more round
var DEP_BLEND = 0.2, BACK_FP = new Float32Array(7)   // its flight into the cloud dies away over this much of it
var OMEGA = 0.0012, COAST_END = 4500           // the rings' speed as they form (turns per ms); at rest by then
var LIST_R = [3100, 4400], B_SUCK = 0.26       // the list thrown back out

// The spin, in turns: how far it still has to turn back (counterclockwise)
// before it rests, and its rate (turns per ms, negative). Steady until the
// rings form, then coasting.
function spinPsi(t) {
    var c = COAST_END - ARR0
    if (t <= ARR0) return OMEGA * t
    var u = Math.min(1, (t - ARR0) / c)
    return OMEGA * (ARR0 + c * (1 - (1 - u) * (1 - u) * (1 - u)) / 3)
}
var PSI_END = spinPsi(COAST_END)
function backTurn(t) { return PSI_END - spinPsi(t) }
function backRate(t) {
    if (t >= COAST_END) return 0
    if (t <= ARR0) return -OMEGA
    var u = (t - ARR0) / (COAST_END - ARR0)
    return -OMEGA * (1 - u) * (1 - u)
}
// A ring's turn at rest, at (absolute) time t, in turns.
function restTurns(i, t, s) { return (RINGS[i].fixed ? 0 : s.geo.offC[i]) + t * layerRate(i, s) }
// The suck-in's b for the list at b: out, on the burst's own clock; back,
// on the return's.
function burstListB(b, back) {
    if (!back) return b * T_OUT / T_MS
    return B_SUCK * (1 - clamp(((1 - b) * T_R - LIST_R[0]) / (LIST_R[1] - LIST_R[0]), 0, 1))
}
function wrapA(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI }

// The way back, once per return (t0: when it started, mark: the logo).
// Per particle: { tb (when the fuse reaches it), qx, qy (its kick: away
// from the row's left end, lifting, never faster than the fuse), eh
// (how high it hangs until the last row has burst),
// dep, arr (its flight onto its ring), sx0, sy0 (where it leaves the
// cloud), rs, fs, df, pw (that flight: from where, how far round, how its
// angle eases: u^pw, or 0 for a plain ease), ax, ay, rc, dupC (its place
// on its ring, in the ring's frame) }; release (when no row is left whole).
function returnOf(Y, P, t0, s, mark) {
    var mc = s.markCache || (s.markCache = {}), key = "ret" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    burstWork(P, Y, Infinity)
    var n = P.n, F = function() { return new Float32Array(n) }, nr = RINGS.length, cx = Y.cx, cy = Y.cy, CT = coreTimes(Y, mark), xL = CT.xL
    var Q = { tb: F(), qx: F(), qy: F(), eh: F(), dep: F(), arr: F(), sx0: F(), sy0: F(), rs: F(), fs: F(), df: F(), pw: F(), ax: F(), ay: F(), rc: F(), dupC: new Uint8Array(n), t0: t0 }
    Q.release = Math.max.apply(null, Array.prototype.slice.call(CT.cross))
    var groups = {}
    for (var k = 0; k < n; k++) {
        if (P.flags[k] & SEP) continue
        var rn = rngN(hash32(k * 2654435761 + 7), 4), s1 = rn[0], s2 = rn[1], s3 = rn[2], s4h = rn[3]
        var Sx = P.tx[k], Sy = P.ty[k], i = P.ring[k]
        Q.tb[k] = CT.cross[i] + Math.max(0, Sx - xL) / V_FUSE + 15 * s1
        var ux = Sx - xL, uy = Sy - Y.rowY[i], ul = Math.sqrt(ux * ux + uy * uy) || 1
        var dx = ux / ul, dy = Math.min(0, uy / ul) - PUSH_LEAD, dl = Math.sqrt(dx * dx + dy * dy) || 1
        var L = Math.sqrt((P.ex[k] - Sx) * (P.ex[k] - Sx) + (P.ey[k] - Sy) * (P.ey[k] - Sy))
        var push = Math.min(0.5 * L, 0.8 * V_FUSE * OUT_R / (2 * P.k[k] * P.inv[k]))
        Q.qx[k] = Sx + dx / dl * push; Q.qy[k] = Sy + dy / dl * push
        Q.eh[k] = Math.min(P.ey[k], Sy - (HOLD[0] + HOLD[1] * s4h) * Y.rh)
        Q.dep[k] = Math.max(DEP0, Q.tb[k] + DEP_AFTER * OUT_R) + DEP_J * s2
        Q.arr[k] = ARR0 + ARR_J * s3
        var g = i + "/" + P.style[k]
        ;(groups[g] = groups[g] || []).push(k)
    }
    Q.groups = groups; Q.groupKeys = Object.keys(groups); Q.gi = 0; Q.ready = false
    mc[key] = Q
    return Q
}

// The way back's flights onto the rings, for up to `budget` ms (Infinity:
// all; they are needed from DEP0 on). Where each dot leaves the cloud, and
// which place on its ring it takes: per ring and look, the dots and the
// places taken in order round the centre, matched with the turn that keeps
// them closest; then its flight, distance first, then round, the spin's
// way only if it can arrive as fast as the ring turns (else plainly eased).
function returnWork(Q, Y, P, s, budget) {
    if (Q.ready) return Q
    var until = Date.now() + budget, cx = Y.cx, cy = Y.cy, t0 = Q.t0, core0 = { a: 0 }, o = new Float32Array(7)
    var match = function(from, to) {
        // (Angles in (-π, π], so a difference needs one turn at most.)
        var m = from.length, step = Math.max(1, m >> 6), cost = function(sh) {
            var c = 0
            for (var j = 0; j < m; j += step) { var a = to[(j + sh) % m].a - from[j].a; c += Math.abs(a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a) }
            return c
        }
        var stride = Math.max(1, Math.ceil(m / 48)), best = 0, bc = Infinity, sh
        for (sh = 0; sh < m; sh += stride) { var c0 = cost(sh); if (c0 < bc) { bc = c0; best = sh } }
        for (sh = best - stride; sh <= best + stride; sh++) { var sm = ((sh % m) + m) % m, c1 = cost(sm); if (c1 < bc) { bc = c1; best = sm } }
        return best
    }
    while (Q.gi < Q.groupKeys.length) {
        var ks = Q.groups[Q.groupKeys[Q.gi++]], m = ks.length, ring = P.ring[ks[0]]
        var turn = TAU * (restTurns(ring, t0 + ARR0 + ARR_J / 2, s) + backTurn(ARR0 + ARR_J / 2))
        var from = ks.map(function(k) {
            flingBack(Y, P, Q, k, Q.dep[k], core0, o)
            Q.sx0[k] = o[0]; Q.sy0[k] = o[1]
            // (Matched from where it would land if it came up to its ring's
            // speed evenly: half that speed's way round, the spin's way.)
            var wa = TAU * (layerRate(ring, s) + backRate(Q.arr[k]))
            return { k: k, a: wrapA(Math.atan2(o[1] - cy, o[0] - cx) + wa * (Q.arr[k] - Q.dep[k]) / 2) }
        })
        var to = ks.map(function(k) { return { lx: P.lx[k], ly: P.ly[k], rc: P.rc[k], dupC: P.flags[k] & DUP_C, a: wrapA(Math.atan2(P.ly[k], P.lx[k]) + turn) } })
        from.sort(function(p, q) { return p.a - q.a }); to.sort(function(p, q) { return p.a - q.a })
        var sh = match(from, to)
        for (var j = 0; j < m; j++) {
            var k = from[j].k, tt = to[(j + sh) % m]
            Q.ax[k] = tt.lx; Q.ay[k] = tt.ly; Q.rc[k] = tt.rc; Q.dupC[k] = tt.dupC
            var arr = Q.arr[k], d = arr - Q.dep[k], X = Q.sx0[k] - cx, Yy = Q.sy0[k] - cy
            Q.rs[k] = Math.sqrt(X * X + Yy * Yy); Q.fs[k] = Math.atan2(Yy, X)
            var df = wrapA(Math.atan2(tt.ly, tt.lx) + TAU * (restTurns(ring, t0 + arr, s) + backTurn(arr)) - Q.fs[k])
            // Round the spin's way, so it lands as fast as its ring turns
            // (df·u^pw arrives at pw·df/d). Eased plainly against it, or with
            // pw held to 2-4, most dots stopped on their ring and then jumped
            // to its speed, all within ARR_J: the sigil formed with a snap.
            var wa = TAU * (layerRate(ring, s) + backRate(arr)), need = Math.abs(wa) * d
            if (df * wa < 0) df += wa > 0 ? TAU : -TAU
            // (Too little way to come up to speed without a whip at the end: once more round.)
            if (need > PW_MAX * Math.abs(df)) df += wa > 0 ? TAU : -TAU
            Q.df[k] = df; Q.pw[k] = need / Math.max(1e-6, Math.abs(df))
        }
        if (Date.now() > until) return Q
    }
    Q.ready = true
    return Q
}


// Particle k flung from its row at tr: o = [x, y, r, sx, sy, alpha factor,
// 1]. Its kick, then on its curve into its place in the cloud (the burst's
// own, ex, ey), hanging no lower than a little above its own row (so never
// in a row still whole below) until the core has crossed the last one;
// then it settles.
var flingBack = (function() {
    var _BLUR = BLUR, _DUP_L = DUP_L, _HOLD_T = HOLD_T, _OUT_R = OUT_R, _SHRINK = SHRINK
    return function flingBack(Y, P, Q, k, tr, core, o) {
    var tau = clamp((tr - Q.tb[k]) / _OUT_R, 0, 1), K = P.k[k], ek = Math.exp(-K * tau), f = (1 - ek) * P.inv[k], g = 1 - f
    var Sx = P.tx[k], Sy = P.ty[k], DB = 16.7 * _BLUR, eh = Q.eh[k]
    var x = g * g * Sx + 2 * g * f * Q.qx[k] + f * f * P.ex[k], y = g * g * Sy + 2 * g * f * Q.qy[k] + f * f * eh
    // (By how far it has flown, so a dot that leaves after the release
    // starts from where it was.)
    y += f * f * (P.ey[k] - eh) * smooth(clamp((tr - Q.release) / _HOLD_T, 0, 1))
    o[0] = softBox(x, 0, Y.w); o[1] = softBox(y, 0, Y.h)
    var fv = K * P.inv[k] * ek / _OUT_R * DB
    o[3] = -fv * 2 * (g * (Q.qx[k] - Sx) + f * (P.ex[k] - Q.qx[k])); o[4] = -fv * 2 * (g * (Q.qy[k] - Sy) + f * (eh - Q.qy[k]))
    o[2] = lerp(P.rl[k], P.rc[k] * (1 - _SHRINK), f)
    o[5] = P.flags[k] & _DUP_L ? smooth(clamp((tr - Q.tb[k]) / 100, 0, 1)) : 1   // (a twin splits off over 100 ms, however hard it is kicked)
    o[6] = 1
    return o
}})()


// Particle k on the way back at tr (t: the absolute time now): o = [x, y,
// r, sx, sy (its streak, a frame back), alpha factor, state (0 in its row,
// 1 flung, 4 flying onto its ring, 2 on it)]; core: the core (coreBack);
// w: the spin's rate (radians per ms). RCOS/RSIN: the rings' turns now.
var HP = new Float32Array(7)
var backAt = (function() {
    var _ARR0 = ARR0, _BLUR = BLUR, _DUP_L = DUP_L, _RCOS = RCOS, _RHO_LEAD = RHO_LEAD, _RINGS = RINGS, _RSIN = RSIN, _SEP = SEP, _SHRINK = SHRINK
    return function backAt(Y, P, Q, k, tr, t, s, o, core, w) {
    var cx = Y.cx, cy = Y.cy, ring = P.ring[k], DB = 16.7 * _BLUR
    if (P.flags[k] & _SEP) {
        // A divider shows as the rings form.
        var rl = _RINGS.length
        o[0] = cx + P.lx[k] * _RCOS[rl] - P.ly[k] * _RSIN[rl]; o[1] = cy + P.lx[k] * _RSIN[rl] + P.ly[k] * _RCOS[rl]
        o[2] = P.rc[k]; o[3] = 0; o[4] = 0; o[5] = smooth(clamp((tr - _ARR0) / 200, 0, 1)); o[6] = 2
        return o
    }
    var dupC = Q.dupC[k]
    if (tr <= Q.tb[k]) {
        o[0] = P.tx[k]; o[1] = P.ty[k]; o[2] = P.rl[k]; o[3] = 0; o[4] = 0; o[5] = P.flags[k] & _DUP_L ? 0 : 1; o[6] = 0
        return o
    }
    if (tr < Q.dep[k]) { flingBack(Y, P, Q, k, tr, core, o); var wf = (tr - Q.tb[k]) / 80; if (wf > 0) { var fx0 = o[0], fy0 = o[1]; wakeOff(o, core); if (wf < 1) { wf *= wf * (3 - 2 * wf); o[0] = fx0 + (o[0] - fx0) * wf; o[1] = fy0 + (o[1] - fy0) * wf } } return o }
    var arr = Q.arr[k]
    if (tr >= arr) {
        var ax = Q.ax[k] * _RCOS[ring] - Q.ay[k] * _RSIN[ring], ay = Q.ax[k] * _RSIN[ring] + Q.ay[k] * _RCOS[ring]
        o[0] = cx + ax; o[1] = cy + ay; o[2] = Q.rc[k]; o[3] = ay * w * DB; o[4] = -ax * w * DB; o[5] = dupC ? 0 : 1; o[6] = 2
        return o
    }
    // Onto its ring (see returnOf).
    // (Its distance is done before the first ring is there.)
    var d = arr - Q.dep[k], u = (tr - Q.dep[k]) / d, rd = Math.max(1, Math.min(_RHO_LEAD * d, _ARR0 - 20 - Q.dep[k]))
    var ul = Math.min(1, (tr - Q.dep[k]) / rd), rs = Q.rs[k], dr = Math.sqrt(Q.ax[k] * Q.ax[k] + Q.ay[k] * Q.ay[k]) - rs, pw = Q.pw[k]
    var rho = rs + dr * ul * ul * (3 - 2 * ul), drho = ul < 1 ? dr * 6 * ul * (1 - ul) / rd : 0
    // (u^pw, or below pw 2, where that would start too fast, the cubic that
    // starts as still and ends as fast: both arrive at pw·df/d.)
    var c3 = pw - 2, gg = pw >= 2 ? Math.pow(u, pw) : u * u * (1 - c3 + c3 * u), dg = (pw >= 2 ? pw * Math.pow(u, pw - 1) : u * (2 - 2 * c3 + 3 * c3 * u)) / d
    var phi = Q.fs[k] + Q.df[k] * gg, dphi = Q.df[k] * dg, cp = Math.cos(phi), sp = Math.sin(phi)
    var x = cx + rho * cp, y = cy + rho * sp
    // Leaving the cloud: what is left of its flight into the cloud carries on
    // and dies away, so it doesn't set off from a standstill.
    if (u < DEP_BLEND) {
        flingBack(Y, P, Q, k, tr, core, BACK_FP)
        var carry = 1 - smooth(u / DEP_BLEND)
        x += (BACK_FP[0] - Q.sx0[k]) * carry; y += (BACK_FP[1] - Q.sy0[k]) * carry
    }
    o[0] = softBox(x, 0, Y.w); o[1] = softBox(y, 0, Y.h)
    o[3] = -(drho * cp - rho * dphi * sp) * DB; o[4] = -(drho * sp + rho * dphi * cp) * DB
    o[2] = lerp(P.rc[k] * (1 - _SHRINK), Q.rc[k], smooth(u))
    o[5] = dupC ? 1 - smooth(clamp((u - 0.75) / 0.25, 0, 1)) : 1
    o[6] = 4
    // The core's wake, eased in after the fuse's kick and out before it
    // lands (a branch change: no jump). Inlined: it runs for every flying
    // dot, every frame.
    var w1 = (tr - Q.tb[k]) / 80, w2 = (arr - tr) / 80
    w1 = w1 >= 1 ? 1 : w1 <= 0 ? 0 : w1 * w1 * (3 - 2 * w1); w2 = w2 >= 1 ? 1 : w2 <= 0 ? 0 : w2 * w2 * (3 - 2 * w2)
    var we = w1 * w2
    if (we > 0) { var wx0 = o[0], wy0 = o[1]; wakeOff(o, core); if (we < 1) { o[0] = wx0 + (o[0] - wx0) * we; o[1] = wy0 + (o[1] - wy0) * we } }
    return o
}})()


// The rings' turns on the way back (RCOS, RSIN; RA their alphas): at rest,
// plus what the spin has still to go; the dividers, that alone.
function returnRings(t, D, s) {
    for (var i = 0; i < RINGS.length; i++) {
        var ang = (restTurns(i, t, s) + D) * TAU
        RCOS[i] = Math.cos(ang); RSIN[i] = Math.sin(ang)
        RA[i] = ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
    }
    RCOS[RINGS.length] = Math.cos(D * TAU); RSIN[RINGS.length] = Math.sin(D * TAU)
}

function paintReturn(c, Y, t, s) {
    var _DEP0 = DEP0, _STK43 = STK43, _GLINT_A = GLINT_A, _GLINT_W = GLINT_W, _HP = HP, _RA = RA, _RINGS = RINGS, _R_E = R_E, _SUCK0 = SUCK0, _TAU = TAU, _T_R = T_R
    var P = burstOf(Y, t, s), tr = average(s.cur) * _T_R, Q = returnOf(Y, P, t - tr, s, s.mark), ga = c.globalAlpha
    if (!Q.ready) returnWork(Q, Y, P, s, tr > _DEP0 - 300 ? Infinity : 3)
    var core = coreBack(Y, tr, s.mark), w = _TAU * backRate(tr)
    returnRings(t, backTurn(tr), s)
    // The rim glints where it lets a row go.
    var bs = burstListB(1 - average(s.cur), true), GL = bs > _SUCK0 ? glintsAt(Y, bs, s, true) : [], rim = _RINGS.length - 2, gw = _GLINT_W / (Y.R * _R_E)
    var st = -1, cur = -1, o = _HP
    for (var k = 0; k < P.n; k++) {
        backAt(Y, P, Q, k, tr, t, s, o, core, w)
        var ring = P.ring[k], a = (ring >= 0 ? _RA[ring] : 1) * o[5], x = o[0], y = o[1], r = o[2], sx = o[3], sy = o[4]
        if (a < 0.01) continue
        var boost = 0
        if (GL.length && ring >= rim && o[6] === 2) {
            var at = Math.atan2(y - Y.cy, x - Y.cx)
            for (var g = 0; g < GL.length; g += 2) {
                var d = Math.abs(at - GL[g]); if (d > Math.PI) d = _TAU - d
                if (d < gw) boost = Math.max(boost, GL[g + 1] * (1 - d / gw))
            }
            r *= 1 + 0.25 * boost
        }
        var sty = P.style[k], sl = Math.sqrt(sx * sx + sy * sy)
        a *= ga * P.styles[sty].a
        if (boost > 0) a = Math.min(1, a * (1 + _GLINT_A * boost))
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK43[sj] + _STK43[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = P.styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        // Shorter, lighter streaks than the burst's: here nearly every dot
        // moves at once.
        drawPart(c, x, y, r, sx, sy, sl, (o[6] === 0 || o[6] === 2) && sl <= 2, 4, 3)
    }
    c.globalAlpha = ga
    paintCore(c, core, s, coreBack(Y, tr - 16.7, s.mark))
}


// The burst, as a mode.
register("burst", {
    title: "Burst",
    T_OUT: T_OUT, T_R: T_R,
    prepare: burstPrepare,
    paint: function(c, Y, t, s) { if (s.back) paintReturn(c, Y, t, s); else paintBurst(c, Y, t, s) },
    wordAlpha: burstWordAlpha,
    listB: burstListB,
    corePulse: burstCorePulse,
    pulseBack: true
})
