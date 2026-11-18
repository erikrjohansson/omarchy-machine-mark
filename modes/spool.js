.pragma library
.import "../Sigil.js" as S

// Spool: the sigil spins up like a pulley (the burst's wind-up) and drops,
// shrinking, into the bottom-left corner, where it sits on the floor like a
// reel of tape. Each ring is then cut at its seam and pays out as a belt, the
// outer ring first: off the reel's left side (where a clockwise reel moves
// up), straight up the margin, round an elbow and into its row from the left
// end, which it runs along until its tail is in. A belt leaves the reel at
// the reel's own speed, stretches to the row's length on the way, and glides
// to a stop. The belts keep the rings' order everywhere (the outer ring's
// riser is the leftmost, its elbow the outermost, its row the top one), so
// they never cross. As the reel gives out rings it gets smaller and sinks,
// and its hub, the core, rises up the names column into the header's logo
// last, which pulses; the names light in its wake.
// Back to the sigil is the same machine run backwards: the core drops out of
// the logo, the rows are reeled in, the inner one first, onto a reel spinning
// the other way, which rises, grows and coasts to rest at the rings' exact
// rest angles.

var T = 5000                  // both ways (ms)
var T_MS = 3800               // the burst's clock, for its suck-in of the list (listB)
var SPIN = 1102               // the spin-up: the burst's (x³ to its top speed by its tear)...
var OMEGA = 0.95 * 3 / 0.29 / T_MS   // ... OMEGA turns per ms
var SLOW = [0.3, 0.6], SLOW_W = [1300, 3300]   // (and slows over these ms, to within these of it: so a long row doesn't get its belt too fast)
var ROW_V = 0.9               // ... the speed (px per ms) the last rows come in at, at most
var DROP = [760, 1300]        // then the drop into the corner; the first ring pays out as it lands
var STAG = 110                // each next ring starts paying out this much later (outer first)
var TE = [800, 1300]          // a ring's payout, from its seam leaving to its row at rest: by its length, within these
var BRAKE = 300               // the rings' own drift stops over this
var SINK_T = 110              // the reel settles onto its next ring's size over this
var SEAM0 = 300               // the seams are nudged to 9 o'clock from this ms on
var C_GAP = 28                // the reel's centre, this far left of the track
var PR_MAX = 80               // the reel's radius (px) at most
var SEP_FADE = [150, 700]     // the dividers fade out
var TCR = [560, 800]          // the core's rise into the logo, as long as there is time for
var DUP_IN = 0.25             // a twin splits off over this much of its stretch
// How far each ring's marks reach across it (|w|), so how wide its belt is in its row.
var WMAX = [0.55, 1, 0, 0, 0, 0.6, 1, 0, 0, 0, 0, 0, 0.7, 1]
var WAKE = [0.6, 180]         // a name lights once the core is this far past it (rows), over this (ms)

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x) }
function smooth5(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10) }

// The reel's shared spin, in turns: x³ up to OMEGA (C1), then on at OMEGA,
// slowing to `slow` of it as it empties (over SLOW_W).
function spinAt(ms, slow) {
    var x = ms / SPIN
    if (x <= 1) return OMEGA * SPIN * x * x * x / 3
    var u = clamp((ms - SLOW_W[0]) / (SLOW_W[1] - SLOW_W[0]), 0, 1), D = SLOW_W[1] - SLOW_W[0]
    return OMEGA * (SPIN / 3 + ms - SPIN - (1 - slow) * (D * (u * u * u - u * u * u * u / 2) + Math.max(0, ms - SLOW_W[1])))
}
function spinRate(ms, slow) {
    var x = Math.min(1, Math.max(0, ms / SPIN))
    return OMEGA * x * x * (1 - (1 - slow) * smooth((ms - SLOW_W[0]) / (SLOW_W[1] - SLOW_W[0])))
}
// The rings' own drift, braked: the integral of (1 - smooth) over ms.
function driftInt(ms) { var x = Math.min(1, Math.max(0, ms / BRAKE)); return BRAKE * (x - (x * x * x - x * x * x * x / 2)) }

// A ring's payout, tau ms after its seam reached the reel's 9 o'clock:
// turns paid out. Hermite from speed OMEGA (m0 = OMEGA·te) to rest at pend by te.
function payP(tau, pend, m0, te) {
    if (tau <= 0) return tau * OMEGA
    if (tau >= te) return pend
    var x = tau / te
    return (x * x * x - 2 * x * x + x) * m0 + (3 * x * x - 2 * x * x * x) * pend
}
function payV(tau, pend, m0, te) {
    if (tau <= 0) return OMEGA
    if (tau >= te) return 0
    var x = tau / te
    return ((3 * x * x - 4 * x + 1) * m0 + (6 * x - 6 * x * x) * pend) / te
}

// Monotone cubic through knots (Fritsch-Carlson), for the reel's size.
function pchip(xs, ys) {
    var n = xs.length, d = [], m = []
    for (var i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]))
    m.push(0)
    for (i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : 3 * (xs[i + 1] - xs[i - 1]) / ((2 * xs[i + 1] - xs[i] - xs[i - 1]) / d[i - 1] + (xs[i + 1] + xs[i] - 2 * xs[i - 1]) / d[i]))
    m.push(0)
    return { xs: xs, ys: ys, m: m }
}
function pchipAt(p, x) {
    var xs = p.xs, n = xs.length
    if (x <= xs[0]) return p.ys[0]
    if (x >= xs[n - 1]) return p.ys[n - 1]
    var i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    var h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * p.ys[i] + (t3 - 2 * t2 + t) * h * p.m[i] + (3 * t2 - 2 * t3) * p.ys[i + 1] + (t3 - t2) * h * p.m[i + 1]
}

// ------------------------------------------------------------------ the plan

// Everything that depends on the layout only (and the logo): the reel's
// place and size, each ring's start, belt path and payout. Kept per layout.
var PLAN = { key: "" }
function planOf(Y, mark) {
    var m = mark || { x: 30, y: -30 }
    var key = [Y.w, Y.h, Y.R, Y.cx, Y.cy, Y.tx0, Y.tx1, Y.rh, m.x, m.y].join()
    if (PLAN.key === key) return PLAN
    var nr = S.RINGS.length, L = { key: key, m: m }
    L.cxp = Y.tx0 - C_GAP
    L.Lrow = Y.tx1 - Y.tx0
    L.slow = clamp(ROW_V / (L.Lrow * OMEGA), SLOW[0], SLOW[1])
    L.r0 = Math.max(2, Y.R * 0.014)
    // The reel sits on the floor; the last ring must still be below its row
    // as it starts (rmin: the least its belt can turn in), which bounds its size.
    L.FLOOR = Y.h - 3.5
    L.rmin = new Float64Array(nr)
    for (var i = 0; i < nr; i++) L.rmin[i] = WMAX[i] * 0.36 * Y.rh + 2.5
    L.PR = Math.max(10, Math.min(PR_MAX, (L.cxp - 10) / 0.995, Y.R * 0.6, (L.FLOOR - Y.rowY[0] - L.rmin[0]) / S.RINGS[0].r[1]))
    L.sc = L.PR / Y.R
    // (The core, at the hub, stays inside the innermost ring's dots.)
    L.rHub = Math.min(L.r0 * 0.8, Math.max(1.5, 0.032 * L.PR))
    L.T = new Float64Array(nr); L.rmid = new Float64Array(nr); L.X = new Float64Array(nr); L.rho = new Float64Array(nr)
    L.hseg = new Float64Array(nr); L.Lc = new Float64Array(nr); L.E = new Float64Array(nr); L.Fref = new Float64Array(nr)
    L.pend = new Float64Array(nr); L.m0 = new Float64Array(nr); L.w0 = new Float64Array(nr); L.t1 = new Float64Array(nr); L.t75 = new Float64Array(nr); L.te = new Float64Array(nr)
    for (i = 0; i < nr; i++) {
        L.T[i] = DROP[1] + (nr - 1 - i) * STAG
        L.rmid[i] = (S.RINGS[i].r[0] + S.RINGS[i].r[1]) / 2
        L.X[i] = L.cxp - L.rmid[i] * L.PR
        L.Lc[i] = 2 * Math.PI * L.rmid[i] * L.PR
        L.te[i] = TE[1]; L.t1[i] = 0.6 * TE[1]; L.t75[i] = 0.4 * TE[1]
    }
    // The reel's size (the lowest ring still on it), so its height, depends
    // on when each ring's bottom has paid out, which depends on the belts'
    // lengths, which depend on its height; and a ring starts only once the
    // reel is low enough for its belt. Settled in a few rounds.
    for (var round = 0; round < 6; round++) {
        // (Ring i's bottom stays till three quarters of it are off; then the
        // reel settles onto the next ring's over SINK_T, or less if that one
        // is off sooner.)
        var xs = [DROP[1] - 1], ys = [0.995]
        for (i = nr - 1; i >= 0; i--) {
            var e = Math.max(xs[xs.length - 1] + 1, L.T[i] + L.t75[i]), en = i > 0 ? L.T[i - 1] + L.t75[i - 1] : Infinity
            xs.push(e); ys.push(S.RINGS[i].r[1])
            // (Only before a long hold: rings that leave close together make one
            // steady sink, not a stair that stops every 110 ms.)
            if (i > 0 && e + SINK_T < en - 1 && en - e > 3 * SINK_T) { xs.push(e + SINK_T); ys.push(S.RINGS[i - 1].r[1]) }
        }
        L.rrem = pchip(xs, ys)
        for (i = nr - 2; i >= 0; i--) {
            L.T[i] = Math.max(L.T[i], L.T[i + 1] + STAG)
            for (var g = 0; g < 400 && cypAt(L, L.T[i]) < Y.rowY[i] + L.rmin[i]; g++) L.T[i] += 5
        }
        for (i = 0; i < nr; i++) {
            var room = cypAt(L, L.T[i]) - Y.rowY[i]
            L.rho[i] = Math.max(2, Math.min(C_GAP + L.rmid[i] * L.PR, room))
            L.hseg[i] = Y.tx0 - (L.X[i] + L.rho[i])
            L.Fref[i] = freeLen(L, Y, i, L.T[i] + L.te[i])
            L.E[i] = 2 * L.Fref[i] / (L.Lc[i] + L.Lrow)
            L.pend[i] = 1 + L.E[i]
            L.w0[i] = spinRate(L.T[i], L.slow)
            // (Short enough that the last is clear of the hub when the core must go.)
            L.te[i] = Math.max(600, Math.min(clamp(2.2 * L.pend[i] / L.w0[i], TE[0], TE[1]), (T - TCR[0] - 40 - L.T[i]) / 0.92))
            L.m0[i] = Math.min(L.w0[i] * L.te[i], 3 * L.pend[i])
            L.t1[i] = payWhen(L, i, 1); L.t75[i] = payWhen(L, i, 0.75)
        }
    }
    // The core: at the reel's hub, then up the names column into the logo.
    // (It goes once the last belt's tail is clear of the hub.)
    L.TC0 = Math.max(T - TCR[1] - 40, Math.min(T - TCR[0] - 40, L.T[0] + 0.92 * L.te[0]))
    L.TCR = T - 40 - L.TC0
    L.cyEnd = cypAt(L, L.TC0)
    L.xc = Math.max(Y.x0 + 10, Math.min(L.cxp - 30, (Y.x0 + Y.tx0) / 2 - 6))
    // When it is at the logo (b), for the pulse.
    var q = 0
    for (var n = 0; n < 200; n++) { q = n / 200; if (coreE(q) >= 0.96) break }
    L.pulse = (L.TC0 + q * L.TCR) / T
    PLAN = L
    return L
}
// The reel's centre height at ms (it sits on the floor as it shrinks).
function payWhen(L, i, p) {
    var lo = 0, hi = L.te[i]
    for (var n = 0; n < 40; n++) { var mid = (lo + hi) / 2; if (payP(mid, L.pend[i], L.m0[i], L.te[i]) < p) lo = mid; else hi = mid }
    return hi
}
function cypAt(L, ms) { return L.FLOOR - L.PR * pchipAt(L.rrem, ms) }
function cypRate(L, ms) { return (cypAt(L, ms + 0.5) - cypAt(L, ms - 0.5)) }
// A belt's free path at ms: up from the reel's 9 o'clock, round its elbow,
// along to the row's left end.
function freeLen(L, Y, i, ms) { return Math.max(0, cypAt(L, ms) - Y.rowY[i] - L.rho[i]) + Math.PI / 2 * L.rho[i] + L.hseg[i] }

// The drop into the corner (0 → 1).
function dropAt(ms) { var x = clamp((ms - DROP[0]) / (DROP[1] - DROP[0]), 0, 1); return x * x * x * (x * (6 * x - 15) + 10) }

// The core at ms: { x, y, r, a }.
function coreAt(Y, L, ms) {
    var m = L.m
    if (ms < L.TC0) {
        var d = dropAt(ms)
        return { x: S.lerp(Y.cx, L.cxp, d), y: S.lerp(Y.cy, cypAt(L, ms), d), r: S.lerp(L.r0, L.rHub, d), a: 1 }
    }
    var q = clamp((ms - L.TC0) / L.TCR, 0, 1), e = coreE(q), y0 = L.cyEnd
    var y = y0 + (m.y - y0) * e
    // (Its sideways jogs C2: they ease out to nothing, not brake hardest at the end.)
    var x = L.cxp + (L.xc - L.cxp) * smooth5(e / 0.35) + (m.x - L.xc) * smooth5((e - 0.72) / 0.28)
    // (It pulses at the glyph's edge, and fades inside the flash: over its
    // last 110 ms, not the last 4% of its way, which went in a few frames.)
    var r = S.lerp(L.rHub, 2.5, smooth((e - 0.8) / 0.2)), a = 1 - smooth((ms - L.TC0 - L.TCR + 110) / 110)
    return { x: x, y: y, r: r, a: a }
}
// The rise: buoyant (it picks up speed quickly) and caught into the logo.
function coreE(q) { return smooth(q) }

// ------------------------------------------------------------- the particles

// One per dot of the sigil or the strip, whichever has more (as the burst's,
// with twins at either end), each with its place on the ring (uc, wc) and
// in the row (ul, wl). Per knead and layout (s.markCache).
function partsOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "spool:" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var L = planOf(Y, s.mark), zc = Y.R / 200, zl = Y.rh / 24, list = [], styles = [], styleAt = {}
    var styleOf = function(col, a) {
        var k = col + "@" + a
        if (styleAt[k] === undefined) { styleAt[k] = styles.length; styles.push({ col: col, a: a }) }
        return styleAt[k]
    }
    var add = function(ring, uc, wc, ul, wl, rc, rl, style, flags) { list.push([ring, uc, wc, ul, wl, rc, rl, style, flags]) }
    var ckey = "spool" + Y.w + "x" + Y.h
    for (var i = 0; i < S.RINGS.length; i++) {
        var PL = S.projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh)
        var K = { PC: S.projC(Y.cx, Y.cy, Y.R, i, 0, s), PL: PL, zc: zc, zl: zl, key: ckey }
        var ms = S.marksOf(S.RINGS[i].k, s)
        for (var mi = 0; mi < ms.length; mi++) {
            var mk = ms[mi], style = styleOf(mk.col, (mk.a === undefined ? 1 : mk.a) * (mk.dash ? S.BEAD.dashAlpha : 1))
            if (mk.d === "dot") {
                add(i, mk.u, mk.w, mk.u, mk.w, Math.max(0.9, mk.s * zc * 0.8), Math.max(0.9, mk.s * zl * 0.8), style, 0)
                continue
            }
            var ns = S.runCounts(mk, K)
            var rc = clamp(mk.lw * zc * 0.5, 0.8, 2.6), rl = clamp(mk.lw * zl * 0.5, 0.8, 2.6)
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
                    add(i, e[0] + (e[2] - e[0]) * fc, e[1] + (e[3] - e[1]) * fc, e[0] + (e[2] - e[0]) * fl, e[1] + (e[3] - e[1]) * fl, rc, rl, style, flags)
                }
            }
        }
    }
    // The section dividers: on the reel, they fade as it drops.
    S.SEPS.forEach(function(sp, si) {
        var r = Y.R * sp[1], n = Math.round(2 * Math.PI * r / (S.BEAD.gap * 1.8)), dr = s.pal.light ? 1.05 : 0.8
        var style = styleOf(S.alpha(s.pal.cat[sp[0]], s.pal.light ? 0.7 : 0.45), 1)
        for (var j = 0; j < n; j++) add(-1 - si, j / n, 0, 0, 0, dr, dr, style, S.SEP)
    })
    list.sort(function(p, q) { return p[7] - q[7] })
    var n = list.length, F = function() { return new Float32Array(n) }
    var P = { n: n, styles: styles, ring: new Int16Array(n), style: new Int16Array(n), flags: new Uint8Array(n),
              lx: F(), ly: F(), uc: F(), ul: F(), qc: F(), ql: F(), rc: F(), rl: F() }
    for (var k = 0; k < n; k++) {
        var q = list[k], ring = q[0], rr, th = -Math.PI / 2 + 2 * Math.PI * q[1]
        if (ring >= 0) {
            var a = S.RINGS[ring].r[0], bb = S.RINGS[ring].r[1], rf = a + (bb - a) * (q[2] + 1) / 2
            rr = Y.R * rf
            P.qc[k] = (rf - L.rmid[ring]) * L.PR
            P.ql[k] = q[4] * Y.rh * 0.36
        }
        // (A divider's dots start at the bottom, as the rest drawing's do: with
        // an odd count, from the top they sat half a spacing round.)
        else { rr = Y.R * S.SEPS[-1 - ring][1]; th += Math.PI }
        P.ring[k] = ring < 0 ? -1 : ring; P.style[k] = q[7]; P.flags[k] = q[8]
        P.lx[k] = Math.cos(th) * rr; P.ly[k] = Math.sin(th) * rr
        P.uc[k] = q[1]; P.ul[k] = q[3]; P.rc[k] = q[5]; P.rl[k] = q[6]
    }
    mc[key] = P
    return P
}

// ------------------------------------------------------------------- frames

// Per ring, this frame: its turn, how far it has paid out, and its belt.
// (nR follows the rings: see reset.)
var nR = S.RINGS.length, MR = S.MAX_RINGS
var RCS = new Float64Array(MR + 1), RSN = new Float64Array(MR + 1), RDL = new Float64Array(MR + 1)
var RP = new Float64Array(MR), RV = new Float64Array(MR), RFT = new Float64Array(MR), RRL = new Float64Array(MR), RAL = new Float64Array(MR)

// Ring i's turn at ms (turns) and its rate (turns per ms). A: where it
// points at rest (out: as the knead starts; back: as it ends), sg: +1 out,
// -1 back (ms runs backwards then).
function ringTurn(L, i, ms, A, rate, sg, o) {
    var Ti = L.T[i], cI = corrOf(L, i, A, rate, sg)
    if (ms < Ti) {
        // (Once it blurs, from SEAM0 to its payout, C2, never faster than the
        // spin itself: no ring ever turns back against it.)
        var u = clamp((ms - SEAM0) / (Ti - SEAM0), 0, 1), k = u * u * u * (u * (6 * u - 15) + 10), kd = 30 * u * u * (1 - u) * (1 - u) / (Ti - SEAM0)
        var x = Math.min(1, Math.max(0, ms / BRAKE)), dr = 1 - x * x * (3 - 2 * x)
        o[0] = A + sg * rate * driftInt(ms) + spinAt(ms, L.slow) + cI * k
        o[1] = sg * rate * dr + spinRate(ms, L.slow) + cI * kd
        o[2] = -1; o[3] = 0
        return o
    }
    var tau = ms - Ti, p = payP(tau, L.pend[i], L.m0[i], L.te[i])
    o[0] = 0.75 + p; o[1] = payV(tau, L.pend[i], L.m0[i], L.te[i]); o[2] = p; o[3] = o[1]
    return o
}
// The nudge that brings ring i's seam to the reel's 9 o'clock as its turn
// to pay out comes (spread from SEAM0 to then, while it blurs).
function corrOf(L, i, A, rate, sg) {
    var d = 0.75 - (A + sg * rate * driftInt(L.T[i]) + spinAt(L.T[i], L.slow))
    d -= Math.round(d)
    return d
}

var TMP = new Float64Array(4)
function paintSpool(c, Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    var _S = S, _RCS = RCS, _RSN = RSN, _RDL = RDL, _RP = RP, _RV = RV, _RFT = RFT, _RRL = RRL, _RAL = RAL, _TMP = TMP
    var _DUP_C = S.DUP_C, _DUP_L = S.DUP_L, _DUP_IN = DUP_IN, _PI2 = Math.PI / 2, TAU = 2 * Math.PI, drawPart = S.drawPart, _STK43 = S.STK43
    var P = partsOf(Y, t, s), L = planOf(Y, s.mark), ga = c.globalAlpha
    var shape = _S.average(s.cur), ms = (1 - shape) * T, sg = s.back ? -1 : 1
    var tA = s.back ? t + ms : t - ms
    var d = dropAt(ms), sc = _S.lerp(1, L.sc, d), cxN = _S.lerp(Y.cx, L.cxp, d), cyN = _S.lerp(Y.cy, cypAt(L, ms), d)
    var dsc = _S.lerp(1, Math.max(0.45, Math.pow(L.sc, 0.75)), d)
    var DB = 16.7
    for (var i = 0; i < nR; i++) {
        var A = _S.restTurns(i, tA, s), rate = _S.layerRate(i, s)
        ringTurn(L, i, ms, A, rate, sg, _TMP)
        var ang = _TMP[0] * TAU
        _RCS[i] = Math.cos(ang) * sc; _RSN[i] = Math.sin(ang) * sc
        _RDL[i] = -sg * _TMP[1] * TAU * DB      // a frame back, in radians (signed by the way time runs)
        _RP[i] = _TMP[2]; _RV[i] = _TMP[3]
        if (_TMP[2] >= -0.5) { _RFT[i] = freeLen(L, Y, i, ms); _RRL[i] = Math.max(0, cypAt(L, ms) - Y.rowY[i] - L.rho[i]) }
        _RAL[i] = _S.hiDim(s.hi < 0 || s.hi === i, shape, _S.DIM_RING) * _S.ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
    }
    var sp = spinAt(ms, L.slow) * TAU
    _RCS[nR] = Math.cos(sp) * sc; _RSN[nR] = Math.sin(sp) * sc; _RDL[nR] = -sg * spinRate(ms, L.slow) * TAU * DB
    var sepA = 1 - smooth((ms - SEP_FADE[0]) / (SEP_FADE[1] - SEP_FADE[0]))
    var Pring = P.ring, Pflags = P.flags, Plx = P.lx, Ply = P.ly, Puc = P.uc, Pul = P.ul, Pqc = P.qc, Pql = P.ql, Prc = P.rc, Prl = P.rl, Pstyle = P.style, styles = P.styles
    var LX = L.X, Lrho = L.rho, LLc = L.Lc, LE = L.E, LFref = L.Fref, Lpend = L.pend, Lrow = L.Lrow, rowY = Y.rowY, tx0 = Y.tx0
    var cyp = cypAt(L, ms), cypV = cypRate(L, ms) * sg
    // The rim glints where it catches a word of the list (as the burst's).
    var bs = ms / T_MS, GL = bs > _S.SUCK0 && bs < _S.B_TEAR + _S.GLINT && d < 0.5 ? _S.glintsAt(Y, bs, s) : null, rim = nR - 2
    var gw = _S.GLINT_W / (Y.R * _S.R_E), GLA = _S.GLINT_A, nG = GL ? GL.length : 0
    var st = -1, cur = -1, probe = s.probe || null   // (probe: a checker's, gets every dot instead)
    for (var k = 0, n = P.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r, a = 1, sx = 0, sy = 0, exact = false, glint = 0
        var ri = ring < 0 ? nR : ring, age = -1
        if (ring >= 0 && _RP[ring] >= -0.5) age = _RP[ring] - (1 - Puc[k])
        if (age < 0) {
            // On the reel.
            var lx = Plx[k], ly = Ply[k], C = _RCS[ri], Sn = _RSN[ri]
            var ox = lx * C - ly * Sn, oy = lx * Sn + ly * C
            x = cxN + ox; y = cyN + oy
            var dl = _RDL[ri], dc = Math.cos(dl), ds = Math.sin(dl)
            sx = ox * dc - oy * ds - ox; sy = ox * ds + oy * dc - oy
            r = Prc[k] * dsc
            exact = ms <= 0
            if (nG && ring >= rim) {
                var at = Math.atan2(oy, ox), boost = 0
                for (var g = 0; g < nG; g += 2) {
                    var dg = Math.abs(at - GL[g]); if (dg > Math.PI) dg = TAU - dg
                    if (dg < gw && GL[g + 1] * (1 - dg / gw) > boost) boost = GL[g + 1] * (1 - dg / gw)
                }
                r *= 1 + 0.25 * boost; glint = boost
            }
            if (ring < 0) a = sepA
            else {
                a = _RAL[ring]
                if (flags & _DUP_C) a = 0
            }
        }
        else {
            // On its belt: age (turns since it left the reel) to its way
            // along: stretching from the reel's spacing to the row's, the
            // twins splitting off, until it is the row's.
            var E = LE[ring], Lc = LLc[ring], Fref = LFref[ring], wr, G, gp
            if (age < E) { var ae = age / E; G = Lc * age + (Lrow - Lc) * age * ae / 2; gp = Lc + (Lrow - Lc) * ae; wr = ae * ae * (3 - 2 * ae) }
            else { G = Fref + (age - E) * Lrow; gp = Lrow; wr = 1 }
            var Ft = _RFT[ring], sd = G + (Pul[k] - Puc[k]) * Lrow * wr - wr * (Fref - Ft)
            var rl0 = _RRL[ring], rho = Lrho[ring], arc = _PI2 * rho, q, v = gp * _RV[ring] * DB, ux, uy
            if (sd < rl0) {
                q = Pqc[k]
                x = LX[ring] - q; y = cyp - sd; ux = 0; uy = -1
            }
            else {
                var wq = (sd - rl0) / arc
                wq = wq >= 1 ? 1 : wq * wq * (3 - 2 * wq)
                q = Pqc[k] + (Pql[k] - Pqc[k]) * wq
                var yr = rowY[ring]
                if (sd < rl0 + arc) {
                    var ph = (sd - rl0) / rho, cph = Math.cos(ph), sph = Math.sin(ph), rr = rho + q
                    if (rr < 0.5) rr = 0.5
                    x = LX[ring] + rho - rr * cph; y = yr + rho - rr * sph; ux = sph; uy = -cph
                }
                else { x = LX[ring] + rho + (sd - rl0 - arc); y = yr - q; ux = 1; uy = 0 }
            }
            sx = -ux * v * sg; sy = -uy * v * sg
            r = Prc[k] * dsc + (Prl[k] - Prc[k] * dsc) * wr
            a = _RAL[ring]
            // (A twin splits off over 80 ms at least: on a short belt, DUP_IN of its stretch took a frame or two.)
            if (flags & _DUP_C) a *= smooth(age / Math.max(_DUP_IN * E, _RV[ring] * 80))
            if (flags & _DUP_L) a *= 1 - smooth((_RP[ring] - Lpend[ring] + 0.08) / 0.08)
            exact = _RP[ring] >= Lpend[ring]
        }
        if (probe) { probe.push(x, y, r, a, ring, age < 0 ? 0 : exact ? 2 : 1, sx, sy); continue }
        if (a < 0.01) continue
        var sl = Math.sqrt(sx * sx + sy * sy)
        var sty = Pstyle[k]
        a *= ga * styles[sty].a
        if (glint > 0) a = Math.min(1, a * (1 + GLA * glint))
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK43[sj] + _STK43[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        drawPart(c, x, y, r, sx, sy, sl, exact, 4, 3)
    }
    c.globalAlpha = ga
    if (probe) { s.probeCore = coreAt(Y, L, ms); return }
    _S.paintCore(c, coreAt(Y, L, ms), s, coreAt(Y, L, ms - sg * 16.7))
}

// ------------------------------------------------------------------- words

// The same either way (ms of the out-clock: back runs it backwards): the
// list's words go out as the reel spins up; a row's value lights once the
// row is at rest, its name once the core has risen past it; the heads
// behind the core too.
function spoolWordAlpha(k, Y, id, w, part) {
    var ms = (1 - k) * T
    if (k > 0.5) return 1   // (the suck-in fades them)
    var L = planOf(Y, w ? w.mark : null), head = typeof id === "string"
    if (!head && part === "value") return smooth((ms - (L.T[id] + L.te[id] + 30)) / 150)
    var y = head ? Y.heads[id.slice(2)] : Y.rowY[id]
    var closed = head ? 1 : smooth((ms - (L.T[id] + L.te[id])) / 60)
    if (closed <= 0 || ms < L.TC0) return 0
    // (In time, not in rows: the core passes a row in two or three frames.)
    var tc = wakeAt(L, y - WAKE[0] * Y.rh)
    return closed * smooth((ms - tc) / Math.max(1, Math.min(WAKE[1], T - 8 - tc)))
}
// When the rising core passes height y (ms), once per plan and height.
function wakeAt(L, y) {
    var w = L.wake || (L.wake = {}), key = Math.round(y * 4)
    if (w[key] === undefined) {
        var lo = L.TC0, hi = T, y0 = L.cyEnd, dy = L.m.y - y0
        for (var n = 0; n < 30; n++) { var mid = (lo + hi) / 2; if (y0 + dy * coreE(clamp((mid - L.TC0) / L.TCR, 0, 1)) > y) lo = mid; else hi = mid }
        w[key] = hi
    }
    return w[key]
}

function prepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    planOf(Y, s.mark)
    partsOf(Y, t, s)
}

S.register("spool", {
    title: "Spool",
    T_OUT: T, T_R: T,
    prepare: prepare,
    paint: paintSpool,
    wordAlpha: spoolWordAlpha,
    listB: function(b, back) { return b * T / T_MS },
    corePulse: function(Y, mark) { return planOf(Y, mark).pulse },
    pulseBack: true,
    // (The displays changed: the rows did, and how many rings there are.)
    reset: function() { PLAN = { key: "" }; nR = S.RINGS.length }
})
