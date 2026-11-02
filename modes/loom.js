.pragma library
.import "../Sigil.js" as S

// Loom: the core is a shuttle that weaves the strip, two rows a pass, and
// the sigil is its spool.
//
// Out: the list fades in place and the rings stop. The core drops out of
// the centre into the strip's foot and runs a serpentine up it: along the
// lane between two rows, an eased U-turn just past the track's end, back
// along the next lane up. Each pass pays out two rings, inner first: a ring
// spins up and lets its dots go from one point on its lower side, and each
// slides down the thread to the shuttle and is laid just behind it, gliding
// to a stop in its place (so a row fills behind the shuttle, never ahead of
// it). The spool keeps above the rows being laid: it lifts and, as the room
// above shrinks, tips back (flattens). A row's words light once it is
// whole and the shuttle is clear of them. After the top pass the shuttle
// runs back along the top lane and up into the logo, which pulses.
//
// Back: the same weave run backwards (the shuttle leaves the logo and
// unweaves top-down, each row lifted as thread and wound back onto its
// ring, outer rings first, the spool opening as it fills), its rings
// spinning down onto their rest angles, and the list thrown back out.
//
// Everything is a closed-form function of time, worked out once per knead
// (prepare): the core's way and the spool's shape once per layout, each
// dot's flight once per knead.

var T_OUT = 6300
var CODA = 900                       // back: after the weave, the list goes out
var T_R = T_OUT + CODA
var LIST_FADE = 320                  // out: the list fades in place
var SEP_FADE = 300                   // the section dividers fade with it
var BRAKE = 300                      // the rings' drift stops over this
var CORE_GO = 260, CORE_HOME = T_OUT - 170   // the core's way, from the centre into the logo
var C_FADE = 110                     // it fades into the logo over this
var V_TURN = 0.42, V_EXIT = 1.25     // speeds (of a lane's top speed): in a turn, along the top lane
var V_FALL = 0.6                     // and dropping out of the centre (on top of the turn's)
var E_END = 4                        // a lane runs this far past the track's ends
var TURN_A = [22, 30]                // a turn's bulge past them, at most (wide, narrow)
var D_A = [820, 380]                 // a dot's slide down the thread to the shuttle: a ring's first, its last
var D_A0 = 260                       // (the first ring's first goes no sooner than this)
var D_MIN = 300                      // and none slides for less than this
var FLING = 200                      // its run on off the spinning ring dies away over this
var G = 110                          // and its glide into its place
var D_B = 11, H_LAY = 4              // where it leaves the shuttle: behind it, to the side the thread comes from
var LEAD_T = 0.35, LEAD_MIN = 0.12   // a ring turns this far (turns) before its first dot goes
var GAP = 6, TOP_MIN = 4, SOFT = 10  // the spool keeps this far above the rows being laid, below the top
var WORD_FADE = 170, WORD_STAG = 45, VALUE_AFTER = 50
var CLEAR = 10                       // a word lights only with the core this far off it
var LIST_R = [T_OUT - 300, T_R - 40] // back: the list thrown out
var BLUR = 1
var SM_W = 20                        // the way's smoothing, ms either side
var WAKE_F = 3                       // a dot is parted over at least this many frames of the core's way
var M_LAY = 160                      // the lay tables' resolution

// ------------------------------------------------------------- the core's way

function smin(a, b, k) {
    var h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k))
    return b + (a - b) * h - k * h * (1 - h)
}
function smax(a, b, k) { return -smin(-a, -b, k) }

// The lanes: [lower ring, upper ring, y, direction].
function lanes(Y) {
    var out = []
    for (var p = 0; p < 7; p++) {
        var a = 2 * p, b = 2 * p + 1
        out.push({ lo: a, hi: b, y: (Y.rowY[a] + Y.rowY[b]) / 2, dir: p % 2 ? -1 : 1 })
    }
    return out
}

// The core's way, once per layout and logo: a polyline (a point every 2
// px or so) with a speed at each point, timed so it leaves the centre at
// CORE_GO and lands in the logo at CORE_HOME; then tables per ms.
var WAYS = {}, WAY_N = 0
function wayOf(Y, mark) {
    var m = mark || { x: 30, y: -30 }
    var key = [Y.w, Y.h, Y.cx, Y.cy, Y.R, Y.tx0, Y.tx1, Y.rh, m.x, m.y].join()
    if (WAYS[key]) return WAYS[key]
    if (++WAY_N > 8) { WAYS = {}; WAY_N = 1 }
    return (WAYS[key] = buildWay(Y, m, key))
}

function buildWay(Y, m, key) {
    var L = lanes(Y), xL = Y.tx0 - E_END, xR = Y.tx1 + E_END, aMax = Y.narrow ? TURN_A[1] : TURN_A[0]
    // (Behind it far enough that the core's parting never reaches there.)
    var r0 = Math.max(2, Y.R * 0.014), db = Math.max(D_B, 2 * (r0 * (1 + SHUTTLE) + 1.5) + 4)
    // Points, each with its class (0 the drop, 1 a lane, 2 a turn, 3 the
    // top lane, 4 the climb into the logo) and how far along its piece.
    var PX = [], PY = [], CL = [], FR = []
    var push = function(x, y, cl, f) { PX.push(x); PY.push(y); CL.push(cl); FR.push(f) }
    var bez = function(x0, y0, x1, y1, x2, y2, x3, y3, cl) {
        var n = 400, len = 0, px = x0, py = y0, pts = []
        for (var i = 0; i <= n; i++) {
            var u = i / n, g = 1 - u
            var x = g * g * g * x0 + 3 * g * g * u * x1 + 3 * g * u * u * x2 + u * u * u * x3
            var y = g * g * g * y0 + 3 * g * g * u * y1 + 3 * g * u * u * y2 + u * u * u * y3
            len += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)); px = x; py = y
            pts.push([x, y, len])
        }
        var k = Math.max(2, Math.ceil(len / 2)), j = 0
        for (var q = (PX.length ? 1 : 0); q <= k; q++) {
            var sl = len * q / k
            while (j < n && pts[j + 1][2] < sl) j++
            var a = pts[j], b = pts[Math.min(n, j + 1)], f = b[2] > a[2] ? (sl - a[2]) / (b[2] - a[2]) : 0
            push(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, cl, q / k)
        }
    }
    var line = function(x0, y0, x1, y1, cl) {
        var len = Math.abs(x1 - x0) + Math.abs(y1 - y0), k = Math.max(2, Math.ceil(len / 2))
        for (var q = 1; q <= k; q++) push(x0 + (x1 - x0) * q / k, y0 + (y1 - y0) * q / k, cl, q / k)
    }
    var turn = function(x, y0, y1, side) {
        var b = (y0 - y1) / 2, a = Math.min(b, aMax), yc = (y0 + y1) / 2
        var len = Math.PI * Math.sqrt((a * a + b * b) / 2), k = Math.max(4, Math.ceil(len / 2))
        for (var q = 1; q <= k; q++) { var ph = Math.PI * q / k; push(x + side * a * Math.sin(ph), yc + b * Math.cos(ph), 2, q / k) }
    }
    // Out of the centre, falling, and round into the first lane heading
    // right (a quarter circle, just left of the track).
    var y1 = L[0].y, ra = Math.min(40, (y1 - Y.cy) / 3, xL - 12), Ax = xL - ra, Ay = y1 - ra
    bez(Y.cx, Y.cy, Y.cx, Y.cy + 0.5 * (Ay - Y.cy), Ax, Ay - 0.45 * (Ay - Y.cy), Ax, Ay, 0)
    var ka = Math.max(4, Math.ceil(Math.PI * ra / 4))
    for (var qa = 1; qa <= ka; qa++) { var th = Math.PI - Math.PI / 2 * qa / ka; push(xL + ra * Math.cos(th), Ay + ra * Math.sin(th), 2, qa / ka) }
    var laneT = []
    for (var p = 0; p < L.length; p++) {
        var ln = L[p], from = ln.dir > 0 ? xL : xR, to = ln.dir > 0 ? xR : xL
        laneT.push({ i0: PX.length - 1 })
        line(from, ln.y, to, ln.y, 1)
        laneT[p].i1 = PX.length - 1
        var ny = p + 1 < L.length ? L[p + 1].y : Y.heads.age
        turn(to, ln.y, ny, ln.dir)
    }
    // Back along the top lane, and up into the logo.
    var yE = Y.heads.age, xX = Math.max(m.x + 30, Y.tx0)
    line(xR, yE, xX, yE, 3)
    var iF = PX.length - 1
    bez(xX, yE, xX - 0.6 * (xX - m.x), yE, m.x, m.y + 0.6 * (yE - m.y), m.x, m.y, 4)

    // Speeds (a lane's top speed 1), and the time to each point.
    var n = PX.length, V = new Float64Array(n), TT = new Float64Array(n), CS = new Float64Array(n), Ls = 0
    for (var ic = 1; ic < n; ic++) CS[ic] = CS[ic - 1] + Math.sqrt((PX[ic] - PX[ic - 1]) * (PX[ic] - PX[ic - 1]) + (PY[ic] - PY[ic - 1]) * (PY[ic] - PY[ic - 1]))
    for (var i = 1; i < n; i++) if (CL[i] === 0) Ls += CS[i] - CS[i - 1]
    var s0 = 0
    for (i = 0; i < n; i++) {
        var cl = CL[i], f = FR[i]
        if (cl === 0) { if (i) s0 += CS[i] - CS[i - 1]; var fs = Math.min(1, s0 / Ls), sf = Math.sin(Math.PI * fs); V[i] = V_TURN * Math.sqrt(fs) + V_FALL * sf * sf }
        else if (cl === 1) { var sn = Math.sin(Math.PI * f); V[i] = V_TURN + (1 - V_TURN) * sn * sn }
        else if (cl === 2) V[i] = V_TURN
        else if (cl === 3) { var se = Math.sin(Math.PI * f / 2); V[i] = V_TURN + (V_EXIT - V_TURN) * se * se }
        else V[i] = V_EXIT * Math.sqrt(Math.max(0, 1 - f))
    }
    for (i = 1; i < n; i++) {
        var ds = Math.sqrt((PX[i] - PX[i - 1]) * (PX[i] - PX[i - 1]) + (PY[i] - PY[i - 1]) * (PY[i] - PY[i - 1])), vm = Math.max(1e-3, (V[i] + V[i - 1]) / 2)
        TT[i] = TT[i - 1] + ds / vm
    }
    var sc = (CORE_HOME - CORE_GO) / TT[n - 1]
    for (i = 0; i < n; i++) TT[i] = CORE_GO + TT[i] * sc
    // Per ms, 0..T_OUT: position, velocity (px per ms).
    var N = T_OUT + 1, X = new Float32Array(N), Yv = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N), SA = new Float64Array(N), j = 0
    for (var t = 0; t < N; t++) {
        if (t <= CORE_GO) { X[t] = PX[0]; Yv[t] = PY[0]; SA[t] = 0; continue }
        if (t >= CORE_HOME) { X[t] = m.x; Yv[t] = m.y; SA[t] = CS[n - 1]; continue }
        while (j < n - 2 && TT[j + 1] < t) j++
        var fa = (t - TT[j]) / Math.max(1e-6, TT[j + 1] - TT[j])
        X[t] = PX[j] + (PX[j + 1] - PX[j]) * fa; Yv[t] = PY[j] + (PY[j + 1] - PY[j]) * fa; SA[t] = CS[j] + (CS[j + 1] - CS[j]) * fa
    }
    // (Then averaged over 41 ms, twice: where a turn's arc meets a straight,
    // and into the logo, its pull eases in and out instead of starting at
    // once. Its bulge past the track shrinks 1.5 px.)
    for (var sp2 = 0; sp2 < 2; sp2++) {
        var X2 = X.slice(), Y2 = Yv.slice(), sm = SM_W, ta2 = CORE_GO - 2 * sm, tb2 = Math.min(N - 1 - sm, CORE_HOME + 2 * sm), sx2 = 0, sy2 = 0
        for (var d2 = -sm; d2 <= sm; d2++) { sx2 += X2[ta2 + d2]; sy2 += Y2[ta2 + d2] }
        for (t = ta2; t < tb2; t++) {
            X[t] = sx2 / (2 * sm + 1); Yv[t] = sy2 / (2 * sm + 1)
            sx2 += X2[t + sm + 1] - X2[t - sm]; sy2 += Y2[t + sm + 1] - Y2[t - sm]
        }
    }
    // (Over 6 ms: the polyline's 2 px chords would show in a turn.)
    for (t = 1; t < N - 1; t++) { var ta3 = Math.max(0, t - 3), tb3 = Math.min(N - 1, t + 3); VX[t] = (X[tb3] - X[ta3]) / (tb3 - ta3); VY[t] = (Yv[tb3] - Yv[ta3]) / (tb3 - ta3) }
    var W = { key: key, m: m, X: X, Y: Yv, VX: VX, VY: VY, L: L, tF: TT[iF], r0: r0, db: db, tOut: T_OUT }
    // (When it is first 40 px out of the centre: full size from then on, even
    // where a lane passes the centre again.)
    for (t = CORE_GO; t < N; t++) if ((X[t] - X[0]) * (X[t] - X[0]) + (Yv[t] - Yv[0]) * (Yv[t] - Yv[0]) >= 1600) { W.tOut = t; break }
    W.tPulse = W.tF + 0.9 * (CORE_HOME - W.tF)
    // Each lane: when the core is on its straight, and when the dot for
    // each x along it (lay[p][j], x = tx0 + j / M_LAY of the track) leaves
    // the shuttle, so that gliding G to a stop it ends at x.
    W.lay = []; W.dep = []; W.t0 = []; W.t1 = []
    for (p = 0; p < L.length; p++) {
        var ta = Math.ceil(TT[laneT[p].i0]), tb = Math.floor(TT[laneT[p].i1]), dir = L[p].dir, tab = new Float32Array(M_LAY + 1)
        W.t0.push(ta); W.t1.push(tb)
        // (By the way's length from the lane's start, which runs on through
        // the turns either side, so the first and last dots are laid as the
        // shuttle turns in and out.)
        var sL = CS[laneT[p].i0], xs = dir > 0 ? xL : xR
        var sa = function(tt) { var k0 = Math.max(0, Math.min(N - 2, Math.floor(tt))), f0 = tt - k0; return SA[k0] + (SA[k0 + 1] - SA[k0]) * f0 }
        var spd = function(tt) {
            var k0 = Math.max(0, Math.min(N - 2, Math.floor(tt))), f0 = tt - k0
            var vx = VX[k0] + (VX[k0 + 1] - VX[k0]) * f0, vy = VY[k0] + (VY[k0 + 1] - VY[k0]) * f0
            return Math.sqrt(vx * vx + vy * vy)
        }
        // (g rises with t: one sweep forward, a ms at a time, for the x's
        // in their order along the lane. Not before the lane: the first few
        // are laid together as it straightens, each gliding a little less.)
        var tl0 = TT[laneT[p].i0], tg = tl0, gPrev = 0
        var g = function(tt, x) { return sa(tt) - sL + dir * (xs - x) - db + spd(tt) * G / 2 }
        for (var qi = 0; qi <= M_LAY; qi++) {
            var q = dir > 0 ? qi : M_LAY - qi, x = Y.tx0 + (Y.tx1 - Y.tx0) * q / M_LAY
            if (g(tl0, x) >= 0) { tab[q] = tl0; continue }
            gPrev = g(tg, x)
            while (tg < CORE_HOME - 1) { var gn = g(tg + 1, x); if (gn >= 0) { tab[q] = tg + (gPrev < 0 ? -gPrev / (gn - gPrev) : 0); break } gPrev = gn; tg += 1 }
            if (tg >= CORE_HOME - 1) tab[q] = tg
        }
        W.lay.push(tab)
        // When each dot goes from the spool (dep[p][j]): the first of a
        // lane's rings the longest before it is laid, the last the shortest,
        // evenly between, so a ring pays out at a steady rate over more than
        // the shuttle's run (and turns slower); but each slides D_MIN at least.
        var first = dir > 0 ? tab[0] : tab[M_LAY], last = dir > 0 ? tab[M_LAY] : tab[0]
        var da1 = Math.max(D_A[1], Math.min(D_A[0], first - D_A0)), d0 = first - da1, d1 = last - D_A[1], dep = new Float32Array(M_LAY + 1)
        for (q = 0; q <= M_LAY; q++) { var qq = dir > 0 ? q / M_LAY : 1 - q / M_LAY; dep[q] = smin(d0 + (d1 - d0) * qq, tab[q] - D_MIN, 40) }
        W.dep.push(dep)
    }
    // The spool: its bottom no lower than the top of the rows being laid
    // from when their first dot is laid (eased through those points, so it
    // rises steadily), its top no higher than TOP_MIN. Lifted first, then
    // flattened.
    var Rm = Y.R * 0.995 + 2.6, pts = [[0, Y.cy + Rm + 3 * SOFT]]
    for (p = 0; p < L.length; p++) {
        var first = L[p].dir > 0 ? W.lay[p][0] : W.lay[p][M_LAY]
        pts.push([first, Y.rowY[L[p].hi] - 0.36 * Y.rh - 2.6 - GAP])
    }
    W.front = monotone(pts)
    W.Rm = Rm
    // (Per ms: its centre and flattening.)
    var SC = new Float32Array(N), SG = new Float32Array(N), so = [0, 0], sa0 = 0, sb0 = 0
    for (t = 0; t < N; t += 4) {
        spoolCalc(Y, W, t, so)
        // (Worked out every 4 ms, and in between drawn straight.)
        if (t) for (var tq = t - 3; tq < t; tq++) { var fq = (tq - t + 4) / 4; SC[tq] = sa0 + (so[0] - sa0) * fq; SG[tq] = sb0 + (so[1] - sb0) * fq }
        SC[t] = sa0 = so[0]; SG[t] = sb0 = so[1]
    }
    for (t = (N - 1) - (N - 1) % 4 + 1; t < N; t++) { SC[t] = sa0; SG[t] = sb0 }
    W.SC = SC; W.SG = SG
    // When each row is whole (its end slot laid), and when each word may
    // light: its row whole (a head: the rows next to it), the core clear of
    // it for good, not before the strip's words show (half way), and the
    // rows that would light at once at that point staggered from the bottom.
    var close = new Float32Array(14)
    for (p = 0; p < L.length; p++) {
        var tEnd = (L[p].dir > 0 ? W.lay[p][M_LAY] : W.lay[p][0]) + G
        close[L[p].lo] = tEnd; close[L[p].hi] = tEnd
    }
    W.close = close
    var clearOf = function(x0, x1, y0, y1) {
        var last = 0, r = W.r0 + CLEAR, r2 = r * r, ya = y0 - r, yb = y1 + r
        for (var tt = CORE_HOME; tt >= CORE_GO; tt -= 2) {
            var cy = Yv[tt]
            if (cy < ya || cy > yb) continue
            var cx = X[tt], nx = cx < x0 ? x0 : cx > x1 ? x1 : cx, ny = cy < y0 ? y0 : cy > y1 ? y1 : cy
            if ((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r2) return tt
        }
        return last
    }
    var half = T_OUT / 2 + 20, lit = {}, early = []
    for (i = 0; i < 14; i++) {
        var y = Y.rowY[i]
        var tn = Math.max(close[i], clearOf(Y.x0, Y.tx0 - 3, y - 9, y + 9))
        var tv = Math.max(close[i], clearOf(Y.tx1 + 3, Y.xv, y - 9, y + 9))
        lit[i] = [tn, tv]
        if (Math.min(tn, tv) < half) early.push(i)
    }
    var heads = ["hw", "sw", "age"]
    heads.forEach(function(cat) {
        var y = Y.heads[cat], tc = 0
        for (var r = 0; r < 14; r++) if (Math.abs(Y.rowY[r] - y) < 1.05 * Y.rh) tc = Math.max(tc, close[r])
        lit["h:" + cat] = [Math.max(tc, clearOf(Y.x0, Y.xv, y - 9, y + 9))]
    })
    // (Bottom-up, the rows waiting for half way.)
    early.sort(function(a, b) { return Y.rowY[b] - Y.rowY[a] })
    early.forEach(function(i, k) { lit[i][0] = Math.max(lit[i][0], half + WORD_STAG * k) })
    // (Never before the row below: the strip lights bottom-up.)
    var order = []
    for (i = 0; i < 14; i++) order.push(i)
    order.sort(function(a, b) { return Y.rowY[b] - Y.rowY[a] })
    for (var oi = 1; oi < order.length; oi++) lit[order[oi]][0] = Math.max(lit[order[oi]][0], lit[order[oi - 1]][0] + WORD_STAG)
    for (var id in lit) {
        var a2 = lit[id]
        a2[0] = Math.max(a2[0], half)
        if (a2.length > 1) a2[1] = Math.max(a2[1], half, a2[0] + VALUE_AFTER)
    }
    W.lit = lit
    return W
}

// A monotone cubic through points [t, v] (Fritsch-Carlson), flat at both
// ends and past them: { t, v, d }.
function monotone(pts) {
    var n = pts.length, t = [], v = [], d = [], dl = []
    for (var i = 0; i < n; i++) { t.push(pts[i][0]); v.push(Math.min(pts[i][1], i ? v[i - 1] : Infinity)) }
    for (i = 0; i < n - 1; i++) dl.push((v[i + 1] - v[i]) / Math.max(1e-6, t[i + 1] - t[i]))
    for (i = 0; i < n; i++) {
        if (i === 0 || i === n - 1) { d.push(0); continue }
        d.push(dl[i - 1] * dl[i] <= 0 ? 0 : 2 / (1 / dl[i - 1] + 1 / dl[i]))
    }
    return { t: t, v: v, d: d }
}
function monoAt(M, x) {
    var t = M.t, n = t.length
    if (x <= t[0]) return M.v[0]
    if (x >= t[n - 1]) return M.v[n - 1]
    var i = 0
    while (i < n - 2 && t[i + 1] < x) i++
    var h = t[i + 1] - t[i], u = (x - t[i]) / h, u2 = u * u, u3 = u2 * u
    return (2 * u3 - 3 * u2 + 1) * M.v[i] + (u3 - 2 * u2 + u) * h * M.d[i] + (-2 * u3 + 3 * u2) * M.v[i + 1] + (u3 - u2) * h * M.d[i + 1]
}

// The spool at plan time t: o = [centre y, its flattening].
function spoolAt(Y, W, t, o) {
    var i = t < 0 ? 0 : t >= T_OUT ? T_OUT - 1 : Math.floor(t), f = t - i
    f = f < 0 ? 0 : f > 1 ? 1 : f
    o[0] = W.SC[i] + (W.SC[i + 1] - W.SC[i]) * f; o[1] = W.SG[i] + (W.SG[i + 1] - W.SG[i]) * f
    return o
}
function spoolCalc(Y, W, t, o) {
    var F = monoAt(W.front, t), Rm = W.Rm
    var kt = Math.max(1, Math.min(SOFT, Y.cy - Rm - TOP_MIN))
    var B = smin(Y.cy + Rm, F, SOFT), top = smax(TOP_MIN, B - 2 * Rm, kt)
    o[0] = (B + top) / 2; o[1] = Math.max(0.02, (B - top) / (2 * Rm))
    return o
}

// Where the shuttle lets its dots go at plan time t (o = [x, y]): W.db
// behind it (by its heading across; in a turn, as it heads up or down, right
// over it), H_LAY above it (the side its thread comes from).
function layPoint(W, t, o) {
    var i = t < 0 ? 0 : t >= T_OUT ? T_OUT - 1 : Math.floor(t), f = t - i
    f = f < 0 ? 0 : f > 1 ? 1 : f
    var vx = W.VX[i] + (W.VX[i + 1] - W.VX[i]) * f, vy = W.VY[i] + (W.VY[i + 1] - W.VY[i]) * f, vl = Math.sqrt(vx * vx + vy * vy)
    o[0] = W.X[i] + (W.X[i + 1] - W.X[i]) * f - (vl > 1e-6 ? vx / vl : 0) * W.db; o[1] = W.Y[i] + (W.Y[i + 1] - W.Y[i]) * f - H_LAY
    return o
}

// The time on lane p at which a dot for x is laid (it leaves the shuttle).
function layAt(W, p, x, Y, tab) {
    tab = tab || W.lay[p]
    var f = (x - Y.tx0) / (Y.tx1 - Y.tx0) * M_LAY
    f = Math.max(0, Math.min(M_LAY, f))
    var i = Math.min(M_LAY - 1, Math.floor(f)), a = f - i
    return tab[i] + (tab[i + 1] - tab[i]) * a
}
// Which u of lane p's rows is at the peel at time t (its dot leaves then),
// clamped to 0..1, and how fast it moves (per ms).
var UP = [0, 0]
function uPeel(W, p, t, o) {
    var tab = W.dep[p], dir = W.L[p].dir, n = M_LAY, td = t
    // tab rises with j (left to right) or falls (right to left).
    var lo = 0, hi = n
    // (Outside the table: at its ends, at their rates.)
    if (dir > 0) {
        if (td <= tab[0]) { o[0] = 0; o[1] = 1 / (n * (tab[1] - tab[0])); return o }
        if (td >= tab[n]) { o[0] = 1; o[1] = 1 / (n * (tab[n] - tab[n - 1])); return o }
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (tab[mid] <= td) lo = mid; else hi = mid }
    }
    else {
        if (td <= tab[n]) { o[0] = 1; o[1] = 1 / (n * (tab[n] - tab[n - 1])); return o }
        if (td >= tab[0]) { o[0] = 0; o[1] = 1 / (n * (tab[1] - tab[0])); return o }
        while (hi - lo > 1) { var md = (lo + hi) >> 1; if (tab[md] >= td) lo = md; else hi = md }
    }
    // (A cubic through the table, so the rate runs on smoothly: Catmull-Rom
    // slopes, du/dt, at both ends of the step.)
    var dt = tab[hi] - tab[lo]
    if (Math.abs(dt) < 1e-6) { o[0] = lo / n; o[1] = 0; return o }
    var m0 = lo > 0 ? 2 / (n * (tab[hi] - tab[lo - 1])) : 1 / (n * dt)
    var m1 = hi < n ? 2 / (n * (tab[hi + 1] - tab[lo])) : 1 / (n * dt)
    var f = (td - tab[lo]) / dt, f2 = f * f, f3 = f2 * f, u0 = lo / n, u1 = hi / n
    o[0] = (2 * f3 - 3 * f2 + 1) * u0 + (f3 - 2 * f2 + f) * dt * m0 + (-2 * f3 + 3 * f2) * u1 + (f3 - f2) * dt * m1
    o[1] = ((6 * f2 - 6 * f) * u0 + (3 * f2 - 4 * f + 1) * dt * m0 + (-6 * f2 + 6 * f) * u1 + (3 * f2 - 2 * f) * dt * m1) / dt
    return o
}

// --------------------------------------------------------------- per knead

// The dots, once per knead: one per dot of the sigil or the strip, as the
// burst makes them (see Sigil.burstOf; copied, so the burst's own, which it
// re-pairs, is never touched), with where each lies along its ring (uc)
// and its row (ul).
function dotsOf(Y, s) {
    var RINGS = S.RINGS, zc = Y.R / 200, zl = Y.rh / 24, list = [], styles = [], styleAt = {}, key = Y.w + "x" + Y.h
    var styleOf = function(col, a) {
        var k = col + "@" + a
        if (styleAt[k] === undefined) { styleAt[k] = styles.length; styles.push({ col: col, a: a }) }
        return styleAt[k]
    }
    var add = function(ring, lx, ly, tx, ty, rc, rl, style, flags, uc, ul) {
        list.push({ ring: ring, lx: lx, ly: ly, tx: tx, ty: ty, rc: rc, rl: rl, style: style, flags: flags, uc: uc, ul: ul })
    }
    for (var i = 0; i < RINGS.length; i++) {
        var a = RINGS[i].r[0], bb = RINGS[i].r[1]
        var loc = function(u, w) {
            var r = Y.R * (a + (bb - a) * (w + 1) / 2), th = -Math.PI / 2 + S.TAU * u
            return [Math.cos(th) * r, Math.sin(th) * r]
        }
        var PL = S.projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh)
        var K = { PC: S.projC(Y.cx, Y.cy, Y.R, i, 0, s), PL: PL, zc: zc, zl: zl, key: key }
        var ms = S.marksOf(RINGS[i].k, s)
        for (var mi = 0; mi < ms.length; mi++) {
            var mk = ms[mi], style = styleOf(mk.col, (mk.a === undefined ? 1 : mk.a) * (mk.dash ? S.BEAD.dashAlpha : 1)), l, o
            if (mk.d === "dot") {
                l = loc(mk.u, mk.w); o = PL(mk.u, mk.w)
                add(i, l[0], l[1], o[0], o[1], Math.max(0.9, mk.s * zc * 0.8), Math.max(0.9, mk.s * zl * 0.8), style, 0, mk.u, mk.u)
                continue
            }
            var ns = S.runCounts(mk, K)
            var rc = S.clamp(mk.lw * zc * 0.5, 0.8, 2.6), rl = S.clamp(mk.lw * zl * 0.5, 0.8, 2.6)
            var runs = mk.d === "tick" ? [[mk.u, mk.w0, mk.u, mk.w1]]
                     : mk.d === "seg" ? [[mk.u0, mk.w, mk.u1, mk.w]]
                     : mk.pts.slice(1).map(function(pt, q) { return [mk.pts[q][0], mk.pts[q][1], pt[0], pt[1]] })
            for (var ri = 0; ri < runs.length; ri++) {
                var e = runs[ri], nc = ns[ri][0], nl = ns[ri][1], N = Math.max(nc, nl), pc = 0, pl = 0
                for (var j = ri > 0 ? 1 : 0; j <= N; j++) {
                    var ic = N ? Math.round(j * nc / N) : 0, il = N ? Math.round(j * nl / N) : 0
                    var fc = nc ? ic / nc : 0.5, fl = nl ? il / nl : 0.5, flags = 0
                    if (j > 0 && ic === pc) flags |= S.DUP_C
                    if (j > 0 && il === pl) flags |= S.DUP_L
                    if (mk.shut && ri === runs.length - 1 && nc && ic === nc) flags |= S.DUP_C
                    pc = ic; pl = il
                    var uc = e[0] + (e[2] - e[0]) * fc, ul = e[0] + (e[2] - e[0]) * fl
                    l = loc(uc, e[1] + (e[3] - e[1]) * fc)
                    o = PL(ul, e[1] + (e[3] - e[1]) * fl)
                    add(i, l[0], l[1], o[0], o[1], rc, rl, style, flags, uc, ul)
                }
            }
        }
    }
    // The section dividers: they fade where they are (on the spool).
    S.SEPS.forEach(function(sp) {
        var r = Y.R * sp[1], n = Math.round(S.TAU * r / (S.BEAD.gap * 1.8)), dr = s.pal.light ? 1.05 : 0.8
        var style = styleOf(S.alpha(s.pal.cat[sp[0]], s.pal.light ? 0.7 : 0.45), 1)
        for (var j = 0; j < n; j++) {
            var psi = (j / n - 0.5) * S.TAU
            add(-1, Math.sin(psi) * r, -Math.cos(psi) * r, 0, 0, dr, dr, style, S.SEP, 0, 0)
        }
    })
    list.sort(function(p, q) { return p.style - q.style })
    return { list: list, styles: styles }
}

// A ring's turn (in turns, as projC's off) at plan time t, before its dots
// go, as they go, and after (empty, so it no longer matters).
function ringTurn(R, W, t, o) {
    if (t < R.ta) {
        var x = Math.min(1, t / BRAKE), bk = t >= BRAKE ? BRAKE / 2 : BRAKE * (x - x * x * x + x * x * x * x / 2)
        o[0] = R.base + R.sign * R.rate * bk; o[1] = R.sign * R.rate * (t >= BRAKE ? 0 : 1 - x * x * (3 - 2 * x))
        return o
    }
    if (t < R.tb) {
        var h = R.tb - R.ta, u = (t - R.ta) / h, u2 = u * u, u3 = u2 * u
        o[0] = (2 * u3 - 3 * u2 + 1) * R.A0 + (u3 - 2 * u2 + u) * h * R.r0 + (-2 * u3 + 3 * u2) * R.A1 + (u3 - u2) * h * R.r1
        o[1] = ((6 * u2 - 6 * u) * R.A0 + (3 * u2 - 4 * u + 1) * h * R.r0 + (-6 * u2 + 6 * u) * R.A1 + (3 * u2 - 2 * u) * h * R.r1) / h
        return o
    }
    uPeel(W, R.p, t, UP)
    o[0] = R.P - UP[0]; o[1] = -UP[1]
    return o
}

// The dots' flights (Q), pass by pass in the order the knead needs them:
// any pass needed by plan time pt (or soon after) at once, then up to
// `budget` ms more. Each: where it is on its ring as it goes (qx, qy,
// round the spool's centre, not yet flattened) and how fast it goes round
// (vx, vy); where it leaves the shuttle (bx, by) and how fast (bvx, bvy).
var FW = [0, 0], FS = [0, 0]
function flightWork(Q, Y, pt, budget) {
    var W = Q.W, until = Date.now() + budget, TAU = S.TAU, o2 = FW, sp = FS
    while (Q.next < 7) {
        var p = Q.order[Q.next], list = Q.byPass[p]
        var need = Q.back ? pt <= Q.maxArr[p] + 500 : pt >= Q.minDep[p] - 500
        while (Q.at < list.length) {
            var k = list[Q.at++], Rg = Q.rings[Q.ring[k]], td = Q.tdep[k], tl = Q.tlay[k], lx = Q.lx[k], ly = Q.ly[k]
            ringTurn(Rg, W, td, o2)
            var ang = o2[0] * TAU, cs = Math.cos(ang), sn = Math.sin(ang), qx = lx * cs - ly * sn, qy = lx * sn + ly * cs
            spoolAt(Y, W, td, sp)
            Q.qx[k] = qx; Q.qy[k] = qy
            Q.vx[k] = -qy * TAU * o2[1]; Q.vy[k] = qx * TAU * o2[1] * sp[1]
            layPoint(W, tl, o2); Q.bx[k] = o2[0]; Q.by[k] = o2[1]
            layPoint(W, tl + 0.5, o2); Q.bvx[k] = o2[0]; Q.bvy[k] = o2[1]
            layPoint(W, tl - 0.5, o2); Q.bvx[k] -= o2[0]; Q.bvy[k] -= o2[1]
            if (!need && (Q.at & 31) === 0 && Date.now() > until) return
        }
        Q.next++; Q.at = 0
        if (!need && Date.now() > until) return
    }
}

// The plan for this knead (s.markCache): the dots, each ring's turns and
// each dot's times and flight. back: the knead back (the same plan, run
// backwards, its rings ending on their rest angles at T_OUT).
function planOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), W = wayOf(Y, s.mark)
    var key = "loom:" + W.key + (s.back ? ":b" : ":o")
    if (mc[key]) return mc[key]
    var RINGS = S.RINGS, back = !!s.back, ms = back ? S.clamp(average(s.cur), 0, 1) * T_R : (1 - S.clamp(average(s.cur), 0, 1)) * T_OUT
    var t0 = t - ms, D = dotsOf(Y, s), list = D.list, n = list.length, L = W.L, TAU = S.TAU
    // The rings: out, from their angles as the knead starts; back, onto
    // their angles at T_OUT (the coda turns on at their rest rate).
    var rings = []
    for (var i = 0; i < RINGS.length; i++) {
        var p = i >> 1, ln = L[p], rate = S.layerRate(i, s)
        var base = back ? S.restTurns(i, t0 + T_OUT, s) : S.restTurns(i, t0, s)
        var R = { p: p, dir: ln.dir, rate: rate, sign: back ? -1 : 1, base: base }
        // Its dots go from u = 0 (left to right) or 1; the first when.
        var uS = ln.dir > 0 ? 0 : 1
        R.tb = layAt(W, p, Y.tx0 + uS * (Y.tx1 - Y.tx0), Y, W.dep[p])
        uPeel(W, p, R.tb + 0.5, UP)
        var w = Math.max(1e-5, Math.abs(UP[1]))
        // Where they go from: on its lower half, so that first it turns about
        // LEAD_T (less if there's no time), the way it then pays out (u runs
        // on: the turn goes down left to right, up right to left), speeding
        // up evenly to the pay-out's rate.
        var tgt = Math.min(LEAD_T, 0.5 * w * Math.max(0, R.tb)), lmin = Math.min(LEAD_MIN, 0.5 * tgt)
        var Ta = { base: base, sign: R.sign, rate: rate, ta: Infinity }, o = [0, 0]
        ringTurn(Ta, W, Math.max(0, R.tb - 2 * tgt / w), o)
        var A0 = o[0], best = null
        // (The first pass's from its upper side: the core is still dropping
        // out through the middle, and the thread comes down onto it.)
        for (var ph = 0.05; ph <= 0.95; ph += 0.005) {
            var phi = (p ? ph : -ph) * Math.PI, P = (phi + Math.PI / 2) / TAU, A1 = P - uS
            var d = ln.dir > 0 ? A0 - A1 : A1 - A0
            d -= Math.floor(d - lmin)
            var cost = Math.abs(d - tgt)
            if (!best || cost < best.cost) best = { cost: cost, phi: phi, d: d }
        }
        R.phi = best.phi
        R.ta = Math.max(0, R.tb - 2 * best.d / w)
        ringTurn(Ta, W, R.ta, o)
        R.A0 = o[0]; R.r0 = o[1]
        R.A1 = ln.dir > 0 ? A0 - best.d : A0 + best.d
        R.P = R.A1 + uS
        R.r1 = -ln.dir * w
        rings.push(R)
    }
    // Each dot: when it goes (tdep), leaves the shuttle (tlay) and is home
    // (tarr); the rest of its flight: see flightWork.
    var F = function() { return new Float32Array(n) }
    var Q = { n: n, styles: D.styles, ring: new Int16Array(n), style: new Int16Array(n), flags: new Uint8Array(n), wsg: new Int8Array(n),
              lx: F(), ly: F(), tx: F(), ty: F(), rc: F(), rl: F(), tdep: F(), tlay: F(), tarr: F(),
              qx: F(), qy: F(), vx: F(), vy: F(), bx: F(), by: F(), bvx: F(), bvy: F(),
              rings: rings, W: W, back: back, t0: t0 }
    // (Their times now; their flights pass by pass, the next needed
    // first, over the knead's first frames: see flightWork.)
    var byPass = [[], [], [], [], [], [], []], minDep = [], maxArr = []
    for (var k = 0; k < n; k++) {
        var q = list[k], ring = q.ring
        Q.ring[k] = ring; Q.style[k] = q.style; Q.flags[k] = q.flags
        Q.lx[k] = q.lx; Q.ly[k] = q.ly; Q.tx[k] = q.tx; Q.ty[k] = q.ty; Q.rc[k] = q.rc; Q.rl[k] = q.rl
        if (ring < 0) { Q.tdep[k] = Infinity; Q.tlay[k] = Infinity; Q.tarr[k] = Infinity; continue }
        var pp = ring >> 1, tl = layAt(W, pp, q.tx, Y), td = layAt(W, pp, q.tx, Y, W.dep[pp])
        Q.tlay[k] = tl; Q.tdep[k] = td; Q.tarr[k] = tl + G
        byPass[pp].push(k)
        minDep[pp] = Math.min(minDep[pp] === undefined ? Infinity : minDep[pp], td); maxArr[pp] = Math.max(maxArr[pp] || 0, tl + G)
    }
    Q.byPass = byPass; Q.minDep = minDep; Q.maxArr = maxArr
    Q.order = back ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6]; Q.next = 0; Q.at = 0
    flightWork(Q, Y, back ? T_OUT : 0, 0)
    mc[key] = Q
    return Q
}

function average(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t / a.length }

function prepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    planOf(Y, t, s)
}

// --------------------------------------------------------------------- paint

// The core, at plan time t: { x, y, r, a }.
function coreAt(W, t) {
    var i = Math.max(0, Math.min(T_OUT, Math.round(t))), r = W.r0, a = 1
    var x = W.X[i], y = W.Y[i]
    // (Between ms, interpolated: the way is per ms.)
    var f = t - Math.floor(t), i0 = Math.max(0, Math.min(T_OUT, Math.floor(t))), i1 = Math.min(T_OUT, i0 + 1)
    if (t > 0 && t < T_OUT) { x = W.X[i0] + (W.X[i1] - W.X[i0]) * f; y = W.Y[i0] + (W.Y[i1] - W.Y[i0]) * f }
    // (Fuller once out of the centre: the size it is at rest there, exactly.)
    var dc = Math.sqrt((x - W.X[0]) * (x - W.X[0]) + (y - W.Y[0]) * (y - W.Y[0]))
    r = W.r0 * (1 + SHUTTLE * (t >= W.tOut ? 1 : S.smooth(S.clamp(dc / 40, 0, 1))))
    if (t > W.tF) {
        var q = Math.min(1, (t - W.tF) / (CORE_HOME - W.tF))
        r = S.lerp(r, 2.5, q); a = 1 - S.smooth(S.clamp((t - CORE_HOME + C_FADE) / C_FADE, 0, 1))
    }
    return { x: x, y: y, r: r, a: a }
}

// Past SOFT_M from an edge (EDGE in), a position eases towards it and
// never reaches it.
var EDGE = 3, SOFT_M = 14
function soft(v, lo, hi) {
    var m = SOFT_M, e
    if (v > hi - m) { e = Math.exp(-2 * (v - hi + m) / m); return hi - m + m * (1 - e) / (1 + e) }
    if (v < lo + m) { e = Math.exp(-2 * (lo + m - v) / m); return lo + m - m * (1 - e) / (1 + e) }
    return v
}

// The shuttle (the core): a little fuller than at rest while it travels,
// and drawn along where it went in the last frame as a soft capsule (dots
// of its own size, close together), so it reads as one fast body.
var SHUTTLE = 0.3
function paintShuttle(c, o, s, prev) {
    if (o.a < 0.01) return
    c.fillStyle = s.pal.fg
    var sx = prev ? prev.x - o.x : 0, sy = prev ? prev.y - o.y : 0, sl = Math.sqrt(sx * sx + sy * sy), cap = 4 * o.r
    if (sl > cap) { sx *= cap / sl; sy *= cap / sl; sl = cap }
    var n = Math.max(1, Math.min(8, Math.ceil(sl / (0.6 * o.r)) + 1))
    for (var q = n - 1; q >= 0; q--) {
        var u = n > 1 ? q / (n - 1) : 0
        c.globalAlpha = o.a * (q === 0 ? 1 : 0.55 * (1 - u) + 0.1)
        c.beginPath(); c.arc(o.x + sx * u, o.y + sy * u, o.r * (1 - 0.25 * u), 0, 6.283185307179586, false); c.fill()
    }
    c.globalAlpha = 1
}

// Copies of Sigil's beadDot and the burst's drawPart (a call into Sigil per
// dot costs too much), their constants held as locals.
var dot = (function() {
    var _SQ = S.BEAD.square, _RD = S.BEAD.round, _OCT = S.OCT
    return function dot(c, x, y, r) {
    if (r <= _SQ) { var h = r * 0.886; c.fillRect(x - h, y - h, 2 * h, 2 * h); return }
    c.beginPath()
    if (r > _RD) c.arc(x, y, r, 0, 6.283185307179586, false)
    else {
        c.moveTo(x + r, y)
        for (var k = 2; k < 16; k += 2) c.lineTo(x + _OCT[k] * r, y + _OCT[k + 1] * r)
    }
    c.fill()
}})()
var part = (function() {
    var BEAD_RD = S.BEAD.round, BEAD_SQ = S.BEAD.square, _dot = dot
    return function part(c, x, y, r, sx, sy, sl, exact) {
    if (sl > 2) {
        var cap = 4 * r
        if (sl > cap) { sx *= cap / sl; sy *= cap / sl; sl = cap }
        var ns = Math.min(3, Math.ceil(sl / (2 * r)) + 1), hh = r * (r > BEAD_SQ ? 0.841 : 0.886)
        for (var q = 0; q < ns; q++) {
            var u = q / (ns - 1)
            if (r > BEAD_RD) _dot(c, x + sx * u, y + sy * u, r)
            else c.fillRect(x + sx * u - hh, y + sy * u - hh, 2 * hh, 2 * hh)
        }
        return
    }
    if (exact || r > BEAD_RD) _dot(c, x, y, r)
    else { var h = r * (r > BEAD_SQ ? 0.841 : 0.886); c.fillRect(x - h, y - h, 2 * h, 2 * h) }
}})()

var RW = new Float32Array(15), RC = new Float32Array(15), RS = new Float32Array(15), RCp = new Float32Array(15), RSp = new Float32Array(15), RAl = new Float32Array(15)
var LPS = new Float32Array(4), LT = [0, 0], RT = [0, 0], SPN = [0, 0], SPP = [0, 0]
function paint(c, Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    var Q = planOf(Y, t, s), W = Q.W, back = !!s.back, shape = S.clamp(average(s.cur), 0, 1)
    if (Q.next < 7) flightWork(Q, Y, back ? Math.max(0, T_OUT - shape * T_R) : (1 - shape) * T_OUT, 2)
    var _RC = RC, _RS = RS, _RCp = RCp, _RSp = RSp, _RAl = RAl, _RW = RW, TAU = S.TAU, nR = S.RINGS.length
    // Plan time: out, the knead's ms; back, the out's run backwards, then the coda.
    var ms = back ? shape * T_R : (1 - shape) * T_OUT, pt = back ? Math.max(0, T_OUT - ms) : ms
    var dt = 16.7 * BLUR, ptp = back ? pt + dt : pt - dt   // a frame ago, for the streaks
    var ga = c.globalAlpha
    // The rings' turns, now and a frame ago; their alphas.
    for (var i = 0; i < nR; i++) {
        var R = Q.rings[i], a0
        // (On the clock, not the knead's ms: that stops at T_R, and the
        // canvas is still up over the turning layers a moment after.)
        if (back && ms > T_OUT) a0 = S.restTurns(i, t, s) * TAU
        else { ringTurn(R, W, pt, RT); a0 = RT[0] * TAU }
        _RW[i] = back && ms > T_OUT ? 0 : RT[1] * TAU * (back ? -1 : 1)
        _RC[i] = Math.cos(a0); _RS[i] = Math.sin(a0)
        ringTurn(R, W, ptp, RT); var a1 = (back && ms > T_OUT) ? a0 : RT[0] * TAU
        _RCp[i] = Math.cos(a1); _RSp[i] = Math.sin(a1)
        _RAl[i] = S.hiDim(s.hi < 0 || s.hi === i, shape, S.DIM_RING) * S.ease(S.clamp((t - s.builtAt - i * 45) / 420, 0, 1))
    }
    var sp = spoolAt(Y, W, pt, SPN), sp0 = sp[0], sg = sp[1], spp = spoolAt(Y, W, ptp, SPP), spp0 = spp[0], sgp = spp[1]
    var cx = Y.cx, core = coreAt(W, pt), coreP = coreAt(W, ptp), ccx = core.x, ccy = core.y
    // (The core parts the dots it passes; on the spool, only once it is out
    // of the centre, which is exactly where the rest draws it.)
    var wakeS = S.smooth(S.clamp(Math.sqrt((ccx - cx) * (ccx - cx) + (ccy - Y.cy) * (ccy - Y.cy)) / 2, 0, 1))
    var room0 = core.r + 1.5, coreOn = core.a > 0.02
    // (Its heading, from the way's own speed: steady even as it slows.)
    var ci = pt < 0 ? 0 : pt > T_OUT - 1 ? T_OUT - 1 : Math.floor(pt), cvx = W.VX[ci], cvy = W.VY[ci], cvl = Math.sqrt(cvx * cvx + cvy * cvy)
    var cux = cvl > 1e-6 ? cvx / cvl : 0, cuy = cvl > 1e-6 ? cvy / cvl : 1, tdir = back ? -1 : 1
    // (The wake reaches ahead and behind as far as the core goes in WAKE_F
    // frames: a fast pass parts a dot over several frames, not one.)
    var aw0 = 2 * room0 + 2, awK = aw0 + WAKE_F * 8.333 * cvl
    var sepA = 1 - S.smooth(S.clamp(pt / SEP_FADE, 0, 1))
    // The shuttle's laying point, now and a frame ago.
    var LP = LPS, EM = EDGE + SOFT_M, wHi = Y.w - EDGE, hHi = Y.h - EDGE, _EDGE = EDGE, _FLING = FLING, _G = G, _part = part, _soft = soft, _STK43 = S.STK43
    layPoint(W, pt, LT); LP[0] = LT[0]; LP[1] = LT[1]; layPoint(W, ptp, LT); LP[2] = LT[0]; LP[3] = LT[1]
    var Pring = Q.ring, Pflags = Q.flags, Plx = Q.lx, Ply = Q.ly, Ptx = Q.tx, Pty = Q.ty, Prc = Q.rc, Prl = Q.rl, Ptdep = Q.tdep, Ptlay = Q.tlay, Ptarr = Q.tarr
    var Pwsg = Q.wsg, Pqx = Q.qx, Pqy = Q.qy, Pvx = Q.vx, Pvy = Q.vy, Pbx = Q.bx, Pby = Q.by, Pbvx = Q.bvx, Pbvy = Q.bvy, Pstyle = Q.style, styles = Q.styles
    var DUP_C = S.DUP_C, DUP_L = S.DUP_L
    var st = -1, cur = -1, n = Q.n, exactEnds = pt <= 0 || pt >= T_OUT, probe = s.probe
    if (probe) probe.core = core
    for (var k = 0; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r, xp, yp, a = 1, moving = false
        if (ring < 0) {
            x = cx + Plx[k]; y = sp0 + Ply[k] * sg; xp = cx + Plx[k]; yp = spp0 + Ply[k] * sgp
            r = Prc[k]; a = sepA
        }
        else {
            var td = Ptdep[k]
            if (pt < td) {
                // On its ring, on the spool.
                var lx = Plx[k], ly = Ply[k]
                x = cx + lx * _RC[ring] - ly * _RS[ring]; y = sp0 + (lx * _RS[ring] + ly * _RC[ring]) * sg
                xp = cx + lx * _RCp[ring] - ly * _RSp[ring]; yp = spp0 + (lx * _RSp[ring] + ly * _RCp[ring]) * sgp
                r = Prc[k]
                a = flags & DUP_C ? 0 : _RAl[ring]
                if (wakeS > 0 && coreOn) moving = true
            }
            else if (pt >= Ptarr[k]) {
                x = Ptx[k]; y = Pty[k]; xp = x; yp = y; r = Prl[k]
                a = flags & DUP_L ? 0 : _RAl[ring]
            }
            else {
                // In flight: now and a frame ago.
                for (var pass = 0; pass < 2; pass++) {
                    var tt = pass ? ptp : pt, fx, fy
                    if (tt < td) {
                        var lx2 = Plx[k], ly2 = Ply[k]
                        fx = cx + lx2 * _RCp[ring] - ly2 * _RSp[ring]; fy = spp0 + (lx2 * _RSp[ring] + ly2 * _RCp[ring]) * sgp
                    }
                    else if (tt >= Ptarr[k]) { fx = Ptx[k]; fy = Pty[k] }
                    else {
                        var tl = Ptlay[k]
                        if (tt < tl) {
                            // Down the thread: from where it left its ring (on
                            // the spool as it is now) to the shuttle.
                            var u = (tt - td) / (tl - td), lam = u * u * (3 - 2 * u), uf = (tt - td) / _FLING, u1 = 1 - uf
                            var e = uf < 1 ? uf * u1 * u1 * _FLING : 0
                            var scy = pass ? spp0 : sp0, ssg = pass ? sgp : sg
                            var sx0 = cx + Pqx[k], sy0 = scy + Pqy[k] * ssg
                            var lxs = LP[pass ? 2 : 0], lys = LP[pass ? 3 : 1]
                            fx = sx0 + lam * (lxs - sx0) + Pvx[k] * e; fy = sy0 + lam * (lys - sy0) + Pvy[k] * e
                            // (Eased in short of the card's edges.)
                            if (fx < EM || fx > wHi - EM) fx = _soft(fx, _EDGE, wHi)
                            if (fy < EM || fy > hHi - EM) fy = _soft(fy, _EDGE, hHi)
                        }
                        else {
                            // Off the shuttle, gliding to a stop in its place.
                            var v = (tt - tl) / _G, v2 = v * v, v3 = v2 * v
                            var h00 = 2 * v3 - 3 * v2 + 1, h10 = (v3 - 2 * v2 + v) * _G, h01 = -2 * v3 + 3 * v2
                            fx = h00 * Pbx[k] + h10 * Pbvx[k] + h01 * Ptx[k]; fy = h00 * Pby[k] + h10 * Pbvy[k] + h01 * Pty[k]
                        }
                    }
                    if (pass) { xp = fx; yp = fy } else { x = fx; y = fy }
                }
                a = _RAl[ring]
                var fr = (pt - td) / (Ptarr[k] - td)
                r = Prc[k] + (Prl[k] - Prc[k]) * (fr * fr * (3 - 2 * fr))
                if (flags & DUP_C) { var ua = (pt - td) / 80; a *= ua >= 1 ? 1 : ua * ua * (3 - 2 * ua) }
                if (flags & DUP_L) { var ub = (pt - Ptlay[k]) / _G; ub = ub < 0.4 ? 0 : (ub - 0.4) / 0.6; a *= 1 - ub * ub * (3 - 2 * ub) }
                moving = true
            }
        }
        if (moving && coreOn && !(ring >= 0 && pt >= Ptlay[k])) {
            // The core parts the dots it passes, smoothly, most as it
            // passes: one still on the spool aside, square to its way past
            // the core; one on its way to the shuttle up, the side its
            // thread comes from (none once it has left the shuttle: those
            // are behind it, and moving away).
            var ex = x - ccx, ey = y - ccy, room = room0 + r, aw = awK, ws = ring >= 0 ? (pt - Ptdep[k]) / 100 : 1
            ws = ws <= 0 ? 0 : ws >= 1 ? 1 : ws * ws * (3 - 2 * ws)
            var dx = 0, dy = 0
            if (ws < 1) {
                // (On the spool, and as it leaves it, blending into the other:
                // across its way past the core, as it turns with its ring and
                // the core goes by.)
                var rx0 = x - cx, ry0 = (y - sp0) / (sg > 0.02 ? sg : 0.02), rwv = ring >= 0 ? _RW[ring] : 0
                var rvx = -rwv * ry0 - cvx * tdir, rvy = rwv * rx0 * sg - cvy * tdir, rvl = Math.sqrt(rvx * rvx + rvy * rvy)
                var ux = rvl > 1e-4 ? rvx / rvl : cux, uy = rvl > 1e-4 ? rvy / rvl : cuy
                var al = ex * ux + ey * uy, pp = ey * ux - ex * uy, ap = pp < 0 ? -pp : pp
                if (al < aw && al > -aw && ap < 3 * room) {
                    var ga2 = (al < 0 ? -al : al) / aw, gp = (ap - room) / (2 * room)
                    gp = gp < 0 ? 0 : gp
                    var gg = 1 - ga2 * ga2 * (3 - 2 * ga2)
                    // (Its side: the one it is on as the core first comes
                    // near, kept for the knead, so it never flips across.)
                    var sd = Pwsg[k]
                    if (!sd) sd = Pwsg[k] = pp < 0 ? -1 : 1
                    var push = (Math.sqrt(pp * pp + room * room * gg) - ap) * (1 - gp * gp * (3 - 2 * gp)) * wakeS * sd * (1 - ws)
                    dx -= uy * push; dy += ux * push
                }
            }
            if (ws > 0) {
                var al2 = ex, pp2 = -ey, ap2 = pp2 < 0 ? -pp2 : pp2
                if (al2 < aw0 && al2 > -aw0 && ap2 < 3 * room) {
                    var gb = (al2 < 0 ? -al2 : al2) / aw0, gq = (ap2 - room) / (2 * room)
                    gq = gq < 0 ? 0 : gq
                    var gh = 1 - gb * gb * (3 - 2 * gb)
                    dy -= (Math.sqrt(pp2 * pp2 + room * room * gh) - ap2) * (1 - gq * gq * (3 - 2 * gq)) * ws
                }
            }
            x += dx; y += dy
        }
        if (probe) { probe[4 * k] = x; probe[4 * k + 1] = y; probe[4 * k + 2] = r; probe[4 * k + 3] = a }
        if (a < 0.01) continue
        var sty = Pstyle[k], sxx = xp - x, syy = yp - y, sl = Math.sqrt(sxx * sxx + syy * syy)
        a *= ga * styles[sty].a
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK43[sj] + _STK43[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        _part(c, x, y, r, sxx, syy, sl, exactEnds || sl <= 0.01)
    }
    c.globalAlpha = ga
    paintShuttle(c, core, s, coreP)
}

// ------------------------------------------------------------------- words

// Out: the list fades in place; a strip word lights once its row is whole
// and the core clear of it (see buildWay). Back: the same run backwards
// (each goes out just before the core reaches it), the list thrown out.
function wordAlpha(k, Y, id, w, part) {
    var back = !!(w && w.back)
    if (k > 0.5) {
        if (back) return 1
        return 1 - S.smooth(S.clamp((1 - k) * T_OUT / LIST_FADE, 0, 1))
    }
    if (!Y || Y.w < 100 || Y.h < 100) return 1
    var W = wayOf(Y, w ? w.mark : null), L = W.lit[id]
    if (!L) return 1
    var at = part === "value" && L.length > 1 ? L[1] : L[0]
    var pt = back ? T_OUT - k * T_R : (1 - k) * T_OUT
    return S.smooth(S.clamp((pt - at) / WORD_FADE, 0, 1))
}

function listB(b, back) {
    if (!back) return 0
    var tr = (1 - b) * T_R
    return S.B_SUCK * (1 - S.clamp((tr - LIST_R[0]) / (LIST_R[1] - LIST_R[0]), 0, 1))
}

function corePulse(Y, mark) {
    if (!Y || Y.w < 100 || Y.h < 100) return -1
    return wayOf(Y, mark).tPulse / T_OUT
}

S.register("loom", {
    title: "Loom",
    T_OUT: T_OUT, T_R: T_R,
    prepare: prepare,
    paint: paint,
    wordAlpha: wordAlpha,
    listB: listB,
    corePulse: corePulse,
    pulseBack: true
})
