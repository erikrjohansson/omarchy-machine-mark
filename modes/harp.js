.pragma library
.import "../Sigil.js" as S

// Harp: the rings are rubber bands. Each turns its seam to the bottom while
// the sigil is pulled wide, slowly, harder and harder, and held there a
// moment; then they all snap at once: every band springs open, unbending
// (the burst's unbend: arcs round one shared centre sinking away below, so
// no two ever cross) into a taut string across its row, past flat, bowing
// a little the other way, and back. Each string rings out, one hump,
// damped, the rows one after another from the bottom up, like a strum; a
// row's words light once it is still. The snap pings the core up and over
// into the header's logo, which pulses.
//
// Back: the logo pulses and lets the core fall, through the middle of every
// string, plucking each as it passes, to rest under the last row. Then the
// strings slip their ends and contract round it, lifting it to the centre,
// into rings that land with a small damped overshoot, wind on to the rest
// angles and throw the list back out from the rim.
//
// Everything is a closed-form function of time, from tables made once per
// knead (prepare).

var TAU = Math.PI * 2
var T_OUT = 4900, T_R = 4500

// Out (ms of the knead)
var TURN = [0, 1250]          // each ring turns its seam to the bottom
var STRETCH = [100, 1600]     // and is pulled wide, slowing as the tension builds, then held still
var SX_MAX = 1.32, SY_K = 0.22   // the pull (x, at most: kept inside the card), and the bands thinning under it
var T_SNAP = 1750             // all snap
var SNAP_Z = 0.6636, SNAP_X = 330   // the recoil: an underdamped spring step (damping), flat first this long after the snap
var SNAP_OS = 1               // past flat, the bow the other way, of the spring's overshoot
var LIST_FADE = 400           // the list fades in place
var V_ON = 330, STRUM = 35    // the bottom string rings from this long after the snap (as the strings first go flat), each row up this much later
var VIB_A = 0.28, VIB_CAP = 0.045, VIB_F = 2, VIB_TAU = 700, VIB_RISE = 35   // its hump (rows; of the track at most), Hz, decay and onset (ms)
var STILL = 1, WORD_FADE = 180   // a row's words light once its hump is under this (px)
var FINAL = [T_OUT - 150, T_OUT]
var CORE_OUT = [T_SNAP + 10, T_SNAP + 910], CORE_K = 3, PULSE_TAU = 0.9   // the ping into the logo
var CORE_ON = 0.02            // its speed comes up over this much of CORE_OUT (18 ms): released, not kicked
var DUP_W = 0.15              // a twin splits off or merges over this much of the unbend

// Back (ms since it started)
var FALL = 1500               // the core falls from the logo to under the last row (see fallOf)
var T_REL = 1600, CON = 1050, K_CON = 7   // the strings let go and contract
var VIB_B = 0.22              // a pluck's hump (rows) at the core's top speed (as its speed squared)
var OVER = 0.045, OVER_F = 1.6, OVER_Z = 0.5, OVER_ON = 0.55   // the landing's overshoot (of the radius), Hz, damping; from this far into the contraction
var TURN_B = [0.4, 2.4]     // the rings wind on to their rest angles (of CON, from T_REL)
var LIST_R = [T_REL + 0.75 * CON, T_REL + 0.75 * CON + 1200], B_SUCK = 0.26   // the list thrown out from the rim
var WORD_OUT = 260            // a row's words go out before the core reaches it

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x) }
function lerp(a, b, k) { return a + (b - a) * k }

// The whip: 0 → 1 over x in 0..1, from rest, top speed at 1/K, eased to
// rest exactly at 1 (critically damped, less a little x² so f'(1) = 0).
function whip(x, K) {
    if (x <= 0) return 0
    if (x >= 1) return 1
    var c = K * K * Math.exp(-K) / 2, g1 = 1 - (1 + K) * Math.exp(-K)
    return (1 - (1 + K * x) * Math.exp(-K * x) - c * x * x) / (g1 - c)
}
// The recoil: a spring's step from rest (0 → 1, overshooting), flat
// (= 1) first at SNAP_X.
var SNAP_WD = (Math.PI - Math.atan2(Math.sqrt(1 - SNAP_Z * SNAP_Z), SNAP_Z)) / SNAP_X, SNAP_ZW = SNAP_Z * SNAP_WD / Math.sqrt(1 - SNAP_Z * SNAP_Z)
function spring(t) {
    if (t <= 0) return 0
    return 1 - Math.exp(-SNAP_ZW * t) * (Math.cos(SNAP_WD * t) + SNAP_ZW / SNAP_WD * Math.sin(SNAP_WD * t))
}
// The tension: from rest, quickest early, slowing to a hold (12x(1-x)²).
function tension(x) { x = clamp(x, 0, 1); var y = 1 - x; return 1 - y * y * y * (1 + 3 * x) }

// ----------------------------------------------------------------- tables

// Per knead and layout: one particle per dot of the sigil or the strip,
// whichever has more (as the burst's), each with its place on its mark at
// both ends, (uc, wc) and (ul, wl). A ring is unbent as a whole, so a dot
// keeps its place along it. g: its band (a ring, or nR + i: a divider).
function tableOf(Y, t, s, back) {
    var mc = s.markCache || (s.markCache = {}), key = "harp:" + (back ? "b:" : "o:") + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var nR = S.RINGS.length, nG = nR + S.SEPS.length, R = Y.R, zc = R / 200, zl = Y.rh / 24
    var list = [], styles = [], styleAt = {}, BEAD = S.BEAD
    var styleOf = function(col, a) {
        var k = col + "@" + a
        if (styleAt[k] === undefined) { styleAt[k] = styles.length; styles.push({ col: col, a: a }) }
        return styleAt[k]
    }
    var add = function(g, uc, wc, ul, wl, rc, rl, style, flags) { list.push([g, uc, wc, ul, wl, rc, rl, style, flags]) }
    for (var i = 0; i < nR; i++) {
        var K = { PC: S.projC(Y.cx, Y.cy, R, i, 0, s), PL: S.projL(Y.tx0, Y.tx1, Y.rowY[i], Y.rh), zc: zc, zl: zl, key: "harp" + Y.w + "x" + Y.h }
        var ms = S.marksOf(S.RINGS[i].k, s)
        for (var mi = 0; mi < ms.length; mi++) {
            var mk = ms[mi], style = styleOf(mk.col, (mk.a === undefined ? 1 : mk.a) * (mk.dash ? BEAD.dashAlpha : 1))
            if (mk.d === "dot") { add(i, mk.u, mk.w, mk.u, mk.w, Math.max(0.9, mk.s * zc * 0.8), Math.max(0.9, mk.s * zl * 0.8), style, 0); continue }
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
    // The section dividers: rings of small dots, unbending towards their
    // heads, gone as they open.
    S.SEPS.forEach(function(sp, si) {
        var n = Math.round(TAU * R * sp[1] / (BEAD.gap * 1.8)), dr = s.pal.light ? 1.05 : 0.8
        var style = styleOf(S.alpha(s.pal.cat[sp[0]], s.pal.light ? 0.7 : 0.45), 1)
        for (var j = 0; j < n; j++) add(nR + si, j / n, 0, j / n, 0, dr, dr, style, S.SEP)
    })
    list.sort(function(p, q) { return p[7] - q[7] })
    var n = list.length, F = function() { return new Float32Array(n) }
    var H = { n: n, styles: styles, g: new Int16Array(n), style: new Int16Array(n), flags: new Uint8Array(n),
              uc: new Float64Array(n), wc: F(), ul: new Float64Array(n), wl: F(), rc: F(), rl: F(), hump: F(), nR: nR, nG: nG }
    for (var k = 0; k < n; k++) {
        var q = list[k]
        H.g[k] = q[0]; H.uc[k] = q[1]; H.wc[k] = q[2]; H.ul[k] = q[3]; H.wl[k] = q[4]; H.rc[k] = q[5]; H.rl[k] = q[6]; H.style[k] = q[7]; H.flags[k] = q[8]
        H.hump[k] = q[0] < nR ? Math.sin(Math.PI * clamp(q[3], 0, 1)) : 0
    }
    // Per band: its radii in the sigil (rm, its middle; dW, half its width),
    // its row (and half the row's band), its strum order.
    var G = { rm: new Float64Array(nG), dW: new Float64Array(nG), row: new Float64Array(nG), k: new Float64Array(nG), order: new Float64Array(nG) }
    for (var gi = 0; gi < nG; gi++) {
        if (gi < nR) {
            var r = S.RINGS[gi].r
            G.rm[gi] = R * (r[0] + r[1]) / 2; G.dW[gi] = R * (r[1] - r[0]) / 2; G.row[gi] = Y.rowY[gi]; G.k[gi] = Y.rh * 0.36; G.order[gi] = gi
        }
        else {
            var sp = S.SEPS[gi - nR]
            G.rm[gi] = R * sp[1]; G.dW[gi] = 0; G.row[gi] = Y.heads[sp[0]]; G.k[gi] = 0; G.order[gi] = 0
        }
    }
    H.G = G
    // The rings' turns over this knead (started at t0): rest = a0 + ar·ms
    // turns; the seam's target (the bottom, ≡ 0.5), and what is left to it.
    var t0 = t - (back ? S.average(s.cur) * T_R : (1 - S.average(s.cur)) * T_OUT)
    H.t0 = t0; H.d0 = new Float64Array(nG); H.ar = new Float64Array(nG)
    for (gi = 0; gi < nR; gi++) {
        var a0 = S.restTurns(gi, t0, s), ar = (S.restTurns(gi, t0 + 1000, s) - a0) / 1000
        // Out: the seam is turned down by TURN[1]; back: from down, onto
        // where rest has it by the end of the wind.
        var at = back ? T_REL + TURN_B[1] * CON : TURN[1], tgt = Math.round(a0 + ar * at - 0.5) + 0.5
        H.d0[gi] = a0 - tgt; H.ar[gi] = ar
    }
    // Per frame: the bands' shapes (now, and a frame back for the streaks).
    var mkF = function() { return { Bx: 0, Sx: 1, Sy: 1, m: 0, M: 1, p: 0, apex: new Float64Array(nG), kap: new Float64Array(nG), L: new Float64Array(nG),
                                     wf: new Float64Array(nG), phi: new Float64Array(nG), V: new Float64Array(nG), A: new Float64Array(nG) } }
    H.F0 = mkF(); H.F1 = mkF()
    H.SX = Math.min(SX_MAX, (Math.min(Y.cx, Y.w - Y.cx) - 22) / (0.995 * R)); H.eRest = 0.995 * R * H.SX + 1
    H.lowRest = Math.max(Y.cy + 0.995 * R, Math.max.apply(null, Y.rowY) + 0.36 * Y.rh) + 3
    mc[key] = H
    return H
}

// ------------------------------------------------------------------ shapes

// The unbend at p (0 ring, 1 row), into F: the burst's (bendOf, arcP)
// written with the curvature, so it is exact and stable at both ends: per
// band its apex (u = 0.5, mid band), curvature kap, length L (kept inside
// the card), and wf (a band's offset per unit of w).
// e2 = (1 - p)²: below 0 it carries on past flat, each band bowing the
// other way (its centre above), still round the one centre.
function shapeAt(Y, H, e2, F) {
    var G = H.G, nG = H.nG, R = Y.R, q = 1 - e2, pl = e2 > 0 ? 1 - e2 * Math.sqrt(e2) : 1, mid = (Y.tx0 + Y.tx1) / 2, track = Y.tx1 - Y.tx0
    var D = e2 >= 1 ? 0 : e2 === 0 ? Infinity : R * (1 - e2) / e2, ext = 0, low = -1e9, top = 1e9
    F.Bx = lerp(Y.cx, mid, pl); F.m = pl; F.p = e2 > 0 ? 1 - Math.sqrt(e2) : 1
    for (var g = 0; g < nG; g++) {
        var c = lerp(G.rm[g], Y.yb - G.row[g], q), kap = D === Infinity ? 0 : 1 / (D + c), wf = lerp(G.dW[g], G.k[g], q)
        var L = lerp(TAU * G.rm[g], track, pl)
        if (L * Math.abs(kap) > TAU) L = TAU / Math.abs(kap)
        F.kap[g] = kap; F.L[g] = L; F.wf[g] = wf
        F.apex[g] = lerp(Y.cy - G.rm[g], G.row[g], q)
        // How far it reaches either side of the centre line.
        var ak = Math.abs(kap), hth = L * ak / 2, e = ak > 0 ? (hth >= Math.PI / 2 ? 1 / ak + wf : (1 / ak + wf) * Math.sin(hth)) : L / 2
        if (e > ext) ext = e
        // and how low (its legs, or its apex bowed down) and how high.
        var leg = ak > 0 ? (hth >= Math.PI ? 2 / ak : (1 - Math.cos(hth)) / ak) : 0
        var lo = F.apex[g] + (kap > 0 ? leg : 0) + wf, hi = F.apex[g] - (kap < 0 ? leg : 0) - wf
        if (lo > low) low = lo
        if (hi < top) top = hi
    }
    F.ext = ext; F.low = low; F.top = top
}
// The unbends' squash: where the bands would reach past the card's sides
// (a narrow card), all are pressed in alike (so none crosses another), softly.
function squash(Y, F, H) {
    var half = Math.min(F.Bx, Y.w - F.Bx) - 8, e0 = Math.max(0.85 * half, H.eRest), e = F.ext * F.Sx
    if (e <= e0 || half <= e0) return 1
    return (e0 + (half - e0) * Math.tanh((e - e0) / (half - e0))) / e
}
// And where their legs would reach below the card: pressed up alike, about
// their top (F.qy, F.yT). Out, the press comes and goes as sin⁴: no
// knee that rises fast and stops dead as the snap ends.
function squashY(Y, F, H, out) {
    var yT = F.top, lo = yT + (F.low - yT) * (F.Sy || 1), hi = Y.h - 4, sp = Math.sin(Math.PI * F.p), k2 = sp * sp, e0 = Math.min(H.lowRest, hi - 4) - 0.2 * Y.h * (out ? k2 * k2 : k2)
    F.yT = yT; F.qy = 1
    if (lo <= e0 || hi <= e0 || lo - yT < 1) return
    F.qy = (e0 - yT + (hi - e0) * Math.tanh((lo - e0) / (hi - e0))) / (lo - yT)
}

function vibA(Y) { return Math.min(VIB_A * Y.rh, VIB_CAP * (Y.tx1 - Y.tx0)) }
// A plucked string's hump at θ ms after its pluck (px per unit of amplitude).
var OMEGA = TAU * VIB_F / 1000
function ring(th) {
    if (th <= 0) return 0
    return (1 - Math.exp(-th / VIB_RISE)) * Math.exp(-th / VIB_TAU) * Math.sin(OMEGA * th)
}

// Out, at ms: F filled; the alphas of the dividers in RA.
function outAt(Y, H, ms, F, RA) {
    var nR = H.nR, nG = H.nG, G = H.G, sp = spring(ms - T_SNAP)
    // (what is left of the spring by the end goes, so it ends exactly flat)
    sp += (1 - sp) * smooth((ms - T_OUT + 400) / 400)
    var e2 = sp <= 1 ? 1 - sp : -SNAP_OS * (sp - 1)
    shapeAt(Y, H, e2, F)
    // The pull, let go with the snap.
    var e = tension((ms - STRETCH[0]) / (STRETCH[1] - STRETCH[0])), E = 1 - F.p, rel = E * E * E
    F.Sx = 1 + (H.SX - 1) * e * rel; F.Sy = 1 - (H.SX - 1) * SY_K * e * rel
    F.Sx *= squash(Y, F, H); squashY(Y, F, H, true)
    var gt = smooth((ms - TURN[0]) / (TURN[1] - TURN[0])), A = vibA(Y), fin = 1 - smooth((ms - T_OUT + 400) / 400)
    for (var g = 0; g < nG; g++) {
        F.phi[g] = g < nR ? TAU * (H.d0[g] + H.ar[g] * ms) * (1 - gt) : 0
        F.V[g] = g < nR ? A * ring(ms - T_SNAP - V_ON - STRUM * G.order[g]) * fin : 0
        if (g >= nR) RA[g] = E * E
    }
}

// Back, at tr (the rings' drift at tw, ms on the clock since it started).
function backAt(Y, H, tr, F, RA, tw) {
    var nR = H.nR, nG = H.nG, G = H.G, x = (tr - T_REL) / CON, p = 1 - whip(x, K_CON)
    shapeAt(Y, H, (1 - p) * (1 - p), F)
    F.Sx = 1; F.Sy = 1
    F.Sx *= squash(Y, F, H); squashY(Y, F, H)
    // The landing's overshoot: the rings contract past their size and spring back.
    var wd = TAU * OVER_F / 1000, th = (x - OVER_ON) * CON, M = 0
    if (th > 0) M = (1 - Math.exp(-th / 60)) * Math.exp(-OVER_Z * wd * th / Math.sqrt(1 - OVER_Z * OVER_Z)) * Math.sin(wd * th)
    F.M = 1 - OVER * M * (1 - smooth((tr - T_R + 300) / 300))
    var gt = tension((x - TURN_B[0]) / (TURN_B[1] - TURN_B[0])), fade = 1 - smooth(x / 0.25), PL = plucks(Y, H)
    for (var g = 0; g < nG; g++) {
        F.phi[g] = g < nR ? TAU * (H.d0[g] + H.ar[g] * tw) * gt : 0
        F.V[g] = g < nR ? PL.A[g] * ring(tr - PL.t[g]) * fade : 0
        if (g >= nR) RA[g] = (1 - p) * (1 - p)
    }
}

// ------------------------------------------------------------------ the core

function r0Of(Y) { return Math.max(2, Y.R * 0.014) }
function markOf(mark) { return mark || { x: 30, y: -30 } }
// Out: pinged up by the snap, over and into the logo, slowing (a cubic, its
// impulse dying away to nothing at the logo).
function coreOutAt(Y, ms, mark, o) {
    var m = markOf(mark), r0 = r0Of(Y)
    o = o || {}
    o.x = Y.cx; o.y = Y.cy; o.r = r0; o.a = 1
    if (ms <= CORE_OUT[0]) return o
    var tau = Math.min(1, (ms - CORE_OUT[0]) / (CORE_OUT[1] - CORE_OUT[0])), K = CORE_K, ce = K * Math.exp(-K)
    var te = (tau - CORE_ON * (1 - Math.exp(-tau / CORE_ON))) / (1 - CORE_ON * (1 - Math.exp(-1 / CORE_ON)))
    var f = (1 - Math.exp(-K * te) - te * ce) / (1 - Math.exp(-K) - ce), g = 1 - f
    var dy = Y.cy - m.y, p1x = Y.cx, p1y = Y.cy - 0.75 * dy, p2x = m.x + 0.1 * (Y.cx - m.x), p2y = m.y + 0.5 * dy
    o.x = g * g * g * Y.cx + 3 * g * g * f * p1x + 3 * g * f * f * p2x + f * f * f * m.x
    o.y = g * g * g * Y.cy + 3 * g * g * f * p1y + 3 * g * f * f * p2y + f * f * f * m.y
    o.r = lerp(r0, 2.5, tau); o.a = 1 - smooth((tau - PULSE_TAU) / (1 - PULSE_TAU))
    return o
}
// Back: the fall's way, once per layout: down out of the logo into the
// stage, along under its top edge to over the strings' middle, and down
// through them all to under the last row (each leg eased, overlapping, so
// the corners are round).
var DROP = [0, 350], ACROSS = [200, 750], DOWN = 600
var FALLW = { key: "" }
function fallOf(Y, mark) {
    var m = markOf(mark), key = [Y.w, Y.h, Y.cx, Y.cy, Y.R, Y.tx0, Y.tx1, Y.rh, m.x, m.y].join()
    if (FALLW.key === key) return FALLW
    var r0 = r0Of(Y), last = Math.max.apply(null, Y.rowY)
    FALLW = { key: key, m: m, r0: r0, mid: (Y.tx0 + Y.tx1) / 2, yA: Math.min(12, Y.heads.age - 0.36 * Y.rh - r0 - 2),
              yLow: Math.min(Y.h - r0 - 2, last + 0.36 * Y.rh + r0 + 4) }
    return FALLW
}
function fallY(W, t) { return W.m.y + (W.yA - W.m.y) * smooth((t - DROP[0]) / (DROP[1] - DROP[0])) + (W.yLow - W.yA) * smooth((t - DOWN) / (FALL - DOWN)) }
function coreBackAt(Y, tr, mark, H, o) {
    var W = fallOf(Y, mark)
    o = o || {}
    o.r = W.r0; o.a = 1
    if (tr < T_REL) {
        o.y = fallY(W, tr); o.x = W.m.x + (W.mid - W.m.x) * smooth((tr - ACROSS[0]) / (ACROSS[1] - ACROSS[0]))
        o.r = lerp(2.5, W.r0, smooth(tr / 300)); o.a = smooth(tr / 100)
        return o
    }
    // Held in the strings as they contract: under the innermost one's apex,
    // and with it into the centre.
    var p = 1 - whip((tr - T_REL) / CON, K_CON), E = 1 - p, q = 1 - E * E, pl = 1 - E * E * E
    o.x = lerp(Y.cx, W.mid, pl); o.y = lerp(Y.cy, W.yLow, q)
    return o
}
// When the core falls through each row (its centre), and how hard it plucks
// it: as its speed there, squared. Per layout.
var PLUCK = { key: "" }
function plucks(Y, H) {
    var W = FALLW, key = W.key + "|" + Y.rh
    if (PLUCK.key === key) return PLUCK
    var nR = S.RINGS.length, t = new Float64Array(nR), A = new Float64Array(nR), heads = {}, vTop = 1.5 * (W.yLow - W.yA) / (FALL - DOWN)
    var when = function(y) {
        var lo = 0, hi = FALL
        for (var n = 0; n < 40; n++) { var md = (lo + hi) / 2; if (fallY(W, md) < y) lo = md; else hi = md }
        return lo
    }
    for (var i = 0; i < nR; i++) {
        t[i] = when(Y.rowY[i])
        var v = (fallY(W, t[i] + 1) - fallY(W, t[i] - 1)) / 2 / vTop
        A[i] = VIB_B * Y.rh * v * v
    }
    S.CATS.forEach(function(cat) { heads[cat] = cat === "age" ? 0 : when(Y.heads[cat]) })
    PLUCK = { key: key, t: t, A: A, heads: heads }
    return PLUCK
}

// ------------------------------------------------------------------- paint

// Past EM from an edge (only in flight: nothing rests that near), a
// position eases into it and never reaches it.
var EM = 6
function softEdge(v, hi) {
    if (v > hi - EM) return hi - EM + EM * Math.tanh((v - hi + EM) / EM)
    if (v < EM) return EM - EM * Math.tanh((EM - v) / EM)
    return v
}

var RA = new Float32Array(S.RINGS.length + 2), WO = new Float32Array(3), CO = {}, CP = {}

function ringsAlpha(t, s, shape, H) {
    for (var i = 0; i < H.nR; i++)
        RA[i] = S.hiDim(s.hi < 0 || s.hi === i, shape, S.DIM_RING) * S.ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
}

// The particles at F (and F1 a frame back, for streaks, if given).
function drawAll(c, Y, H, F, F1, core, s, back, GL) {
    var ga = c.globalAlpha, probe = s.probe || null
    var Hg = H.g, Huc = H.uc, Hwc = H.wc, Hul = H.ul, Hwl = H.wl, Hrc = H.rc, Hrl = H.rl, Hh = H.hump, Hf = H.flags, Hs = H.style, styles = H.styles
    var nR = H.nR, cx = Y.cx, cy = Y.cy, W = Y.w, Hh2 = Y.h, _RA = RA, _WO = WO, DUP_C = S.DUP_C, DUP_L = S.DUP_L, SEP = S.SEP, DUP_W_ = DUP_W
    var drawPart = S.drawPart, _STK43 = S.STK43, em = EM
    var ccx = core.x, ccy = core.y, cr = core.r, ca = core.a, st = -1, cur = -1
    var m = F.m, Bx = F.Bx, Sx = F.Sx, Sy = F.Sy, M = F.M, ap = F.apex, kp = F.kap, Lp = F.L, wp = F.wf, php = F.phi, Vp = F.V
    var stretch = Sx !== 1 || Sy !== 1, scale = M !== 1, qy = F.qy, yT = F.yT
    var m1 = F1 ? F1.m : 0, Bx1 = F1 ? F1.Bx : 0, Sx1 = F1 ? F1.Sx : 1, Sy1 = F1 ? F1.Sy : 1, M1 = F1 ? F1.M : 1
    var ap1 = F1 ? F1.apex : null, kp1 = F1 ? F1.kap : null, Lp1 = F1 ? F1.L : null, wp1 = F1 ? F1.wf : null, php1 = F1 ? F1.phi : null, Vp1 = F1 ? F1.V : null
    var SK = F.sk === undefined ? 1 : F.sk
    var exactC = m <= 0 && !stretch && !scale, exactL = m >= 1
    var rim = nR - 2, gw = GL ? S.GLINT_W / (Y.R * S.R_E) : 0, GLA = S.GLINT_A
    for (var k = 0, n = H.n; k < n; k++) {
        var g = Hg[k], flags = Hf[k], uc = Huc[k], ul = Hul[k], wc = Hwc[k], wl = Hwl[k]
        var u = uc + (ul - uc) * m, w = wc + (wl - wc) * m
        var kap = kp[g], s0 = (u - 0.5) * Lp[g], D = w * wp[g], x, y
        if (kap > 1e-12 || kap < -1e-12) {
            var psi = s0 * kap + php[g], sp = Math.sin(psi), cp = Math.cos(psi)
            x = Bx + sp / kap + D * sp; y = ap[g] + (1 - cp) / kap - D * cp
        }
        else { x = Bx + s0; y = ap[g] - D }
        y += Vp[g] * Hh[k]
        if (stretch) { x = Bx + (x - Bx) * Sx; y = cy + (y - cy) * Sy }
        if (qy !== 1) y = yT + (y - yT) * qy
        if (scale) { x = cx + (x - cx) * M; y = cy + (y - cy) * M }
        var sx = 0, sy = 0
        if (F1) {
            var u1 = uc + (ul - uc) * m1, w1 = wc + (wl - wc) * m1, k1 = kp1[g], s1 = (u1 - 0.5) * Lp1[g], D1 = w1 * wp1[g], x1, y1
            if (k1 > 1e-12 || k1 < -1e-12) {
                var psi1 = s1 * k1 + php1[g], sp1 = Math.sin(psi1), cp1 = Math.cos(psi1)
                x1 = Bx1 + sp1 / k1 + D1 * sp1; y1 = ap1[g] + (1 - cp1) / k1 - D1 * cp1
            }
            else { x1 = Bx1 + s1; y1 = ap1[g] - D1 }
            y1 += Vp1[g] * Hh[k]
            if (Sx1 !== 1 || Sy1 !== 1) { x1 = Bx1 + (x1 - Bx1) * Sx1; y1 = cy + (y1 - cy) * Sy1 }
            if (F1.qy !== 1) y1 = F1.yT + (y1 - F1.yT) * F1.qy
            if (M1 !== 1) { x1 = cx + (x1 - cx) * M1; y1 = cy + (y1 - cy) * M1 }
            sx = (x1 - x) * SK; sy = (y1 - y) * SK
        }
        if (x < em || x > W - em) x = softEdge(x, W)
        if (y < em || y > Hh2 - em) y = softEdge(y, Hh2)
        var r = Hrc[k] + (Hrl[k] - Hrc[k]) * m, a = g < nR ? _RA[g] : _RA[g]
        if (flags & SEP) { if (a < 0.01 && !probe) continue }
        else {
            if (flags & DUP_C) a *= smooth(m / DUP_W_)
            if (flags & DUP_L) a *= 1 - smooth((m - 1 + DUP_W_) / DUP_W_)
        }
        var exact = (exactC && !(flags & DUP_C)) || exactL
        // The core is in front: a dot it touches is hidden.
        if (ca > 0.02) {
            var wx = x - ccx, wy = y - ccy, rr = cr + r + 1.5
            if (wx * wx + wy * wy < rr * rr) {
                var oc = (Math.sqrt(wx * wx + wy * wy) - cr - r) / 1.5
                a *= oc <= 0 ? 0 : oc * oc * (3 - 2 * oc); exact = false
            }
        }
        var boost = 0
        if (GL && g >= rim && g < nR && m < 0.15) {
            var at = Math.atan2(y - cy, x - cx)
            for (var gi = 0; gi < GL.length; gi += 2) {
                var da = Math.abs(at - GL[gi]); if (da > Math.PI) da = TAU - da
                if (da < gw) boost = Math.max(boost, GL[gi + 1] * (1 - da / gw))
            }
            r *= 1 + 0.25 * boost
        }
        if (probe) { probe[4 * k] = x; probe[4 * k + 1] = y; probe[4 * k + 2] = r; probe[4 * k + 3] = a; continue }
        if (a < 0.01) continue
        var sty = Hs[k], sl = Math.sqrt(sx * sx + sy * sy)
        a *= ga * styles[sty].a
        if (boost > 0) a = Math.min(1, a * (1 + GLA * boost))
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK43[sj] + _STK43[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        drawPart(c, x, y, r, sx, sy, sl, exact && sl <= 2, 4, 3)
    }
    c.globalAlpha = ga
}

function paintOut(c, Y, t, s) {
    var H = tableOf(Y, t, s, false), ms = (1 - S.average(s.cur)) * T_OUT
    ringsAlpha(t, s, 1 - ms / T_OUT, H)
    outAt(Y, H, ms, H.F0, RA)
    var fast = ms > T_SNAP && ms < T_SNAP + 500
    H.F0.sk = 1 - smooth((ms - T_SNAP - 380) / 120)   // (the streaks shrink away before they stop)
    if (fast) outAt(Y, H, ms - 16.7, H.F1, RA), outAt(Y, H, ms, H.F0, RA)
    var core = coreOutAt(Y, ms, s.mark, CO)
    if (s.probe) s.probe.core = { x: core.x, y: core.y, r: core.r, a: core.a }
    drawAll(c, Y, H, H.F0, fast ? H.F1 : null, core, s, false, null)
    if (s.probe) return
    S.paintCore(c, core, s, coreOutAt(Y, ms - 16.7, s.mark, CP))
}

function paintBack(c, Y, t, s) {
    var H = tableOf(Y, t, s, true), tr = S.average(s.cur) * T_R
    fallOf(Y, s.mark)
    ringsAlpha(t, s, tr / T_R, H)
    // (The rings' drift on the clock (tw), not on tr: tr stops at T_R, and the
    // canvas is still up over the turning layers a moment after.)
    var tw = t - H.t0
    backAt(Y, H, tr, H.F0, RA, tw)
    var x = (tr - T_REL) / CON, fast = x > 0.05 && x < 0.9
    H.F0.sk = 1 - smooth((x - 0.72) / 0.18)
    if (fast) backAt(Y, H, tr - 16.7, H.F1, RA, tw - 16.7), backAt(Y, H, tr, H.F0, RA, tw)
    var core = coreBackAt(Y, tr, s.mark, H, CO)
    if (s.probe) s.probe.core = { x: core.x, y: core.y, r: core.r, a: core.a }
    var bs = listB(1 - tr / T_R, true), GL = bs > S.SUCK0 ? S.glintsAt(Y, bs, s, true) : null
    drawAll(c, Y, H, H.F0, fast ? H.F1 : null, core, s, true, GL && GL.length ? GL : null)
    if (s.probe) return
    S.paintCore(c, core, s, coreBackAt(Y, tr - 16.7, s.mark, H, CP))
}

// ------------------------------------------------------------------- words

// Out: the list fades in place as the tension builds; a row's words light
// once its string is still (its hump under STILL px), a head once the rows
// either side of it are. Back: each row's words go out before the core
// falls to it; the list is thrown out from the rim (listB).
var LIT = { key: "" }
function litOf(Y) {
    var key = [Y.w, Y.h, Y.rh].join()
    if (LIT.key === key) return LIT
    var nR = S.RINGS.length, A = vibA(Y), rows = new Float64Array(nR), heads = {}
    for (var i = 0; i < nR; i++) {
        var t0 = T_SNAP + V_ON + STRUM * i, th = VIB_TAU * Math.log(Math.max(1.01, A / STILL))
        // (the envelope, with its onset, falls under STILL a little later)
        while (th < 6000 && A * (1 - Math.exp(-th / VIB_RISE)) * Math.exp(-th / VIB_TAU) > STILL) th += 5
        rows[i] = Math.max(t0 + th, T_SNAP + 700)
    }
    // A head: between its first ring and the ring above it.
    S.CATS.forEach(function(cat) {
        var j = S.LIST_AT["h:" + cat], below = S.LIST[j + 1], above = j > 0 ? S.LIST[j - 1] : null
        heads[cat] = Math.max(below && below.i !== undefined ? rows[below.i] : 0, above && above.i !== undefined ? rows[above.i] : 0)
    })
    LIT = { key: key, rows: rows, heads: heads }
    return LIT
}
function wordAlpha(k, Y, id, w, part) {
    var back = !!(w && w.back), head = typeof id === "string"
    if (k > 0.5) return back ? 1 : 1 - smooth((1 - k) * T_OUT / LIST_FADE)
    if (back) {
        fallOf(Y, w ? w.mark : null)
        var PL = plucks(Y, null), tc = head ? PL.heads[id.slice(2)] : PL.t[id]
        return 1 - smooth((k * T_R - Math.max(0, tc - WORD_OUT)) / (tc > 0 ? 180 : 120))
    }
    var ms = (1 - k) * T_OUT, fin = smooth((ms - FINAL[0]) / (FINAL[1] - FINAL[0])), L = litOf(Y)
    var tl = head ? L.heads[id.slice(2)] : L.rows[id]
    return Math.max(fin, smooth((ms - tl) / WORD_FADE))
}

// Out the list stays in place (it fades); back it is thrown out from the
// rim, on the burst's suck-in run backwards.
function listB(b, back) {
    if (!back) return 0
    return B_SUCK * (1 - clamp(((1 - b) * T_R - LIST_R[0]) / (LIST_R[1] - LIST_R[0]), 0, 1))
}

function prepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    tableOf(Y, t, s, !!s.back)
    if (s.back) { fallOf(Y, s.mark); plucks(Y, null) }
    else litOf(Y)
}

S.register("harp", {
    title: "Harp",
    T_OUT: T_OUT, T_R: T_R,
    prepare: prepare,
    paint: function(c, Y, t, s) {
        if (!Y || Y.w < 100 || Y.h < 100) return
        if (s.back) paintBack(c, Y, t, s); else paintOut(c, Y, t, s)
    },
    wordAlpha: wordAlpha,
    listB: listB,
    corePulse: function(Y, mark) { return (CORE_OUT[0] + PULSE_TAU * (CORE_OUT[1] - CORE_OUT[0])) / T_OUT },
    pulseBack: true
})
