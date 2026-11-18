.pragma library
.import "../Sigil.js" as S

// Break shot: billiards. The sigil is the racked balls and the core the cue
// ball. The list fades in place while the core rolls quickly out of the rack
// along the line it will be shot on (towards the stage's top-left corner),
// swelling as it goes; it winds up for a beat and is shot back in, through
// the outer rings, into the dense inner rings. The break: a front sweeps
// out from the impact and every dot gets a hard kick (the shot's way and
// out from the impact, a quarter outwards from the centre) that dies within
// a few frames, while it rolls under friction (its speed dying as e^-t/τ)
// straight to its row's band, settled by T_SET. Then the rows zip closed
// into their places, from the top down and each from its left end, each
// row's words lighting as it closes. The cue ball draws back off the rack
// and rolls, slowing, into the header's logo: pocketed, it pulses.
//
// Back: the logo pulses and lets the core go; it drops out and is shot into
// the strip's top-left row end. A front runs from there through the strip:
// every dot is kicked away from the impact, towards the centre, and rolls
// in under the same friction (its distance from the centre first), then
// settles round onto its ring, the inner rings home first. The cue ball
// rolls on into the centre, and the rack forms round it, drifting as at
// rest; it throws the list back out from its rim.
//
// Everything is a closed-form function of time, worked out once per knead.

var TAU = Math.PI * 2
var T_OUT = 4400, T_R = 4200

// Out (ms of the knead)
var LIST_FADE = 300                  // the list fades in place
var BACKOUT = 460                    // the core rolls out of the rack to the cue spot
var CUE_K = 1.35, CUE_M = 14         // the cue spot: this many sigil radii out (at most: this far inside the stage, wound up)
var WIND = [500, 640], WIND_D = 12   // the wind-up: drawn back this far
var SHOT_TAU = 600                   // the shot rolls with light friction ...
var T_HIT = 850, HIT_K = 0.3         // ... into the inner rings, this many sigil radii from the centre
var GROW = 1.6                       // the core is this much bigger while it travels
var FRONT_T = 140, FRONT_J = 12      // the break's front: across 2R in this
var KICK_K = 9, KICK_D = 1080        // a dot's kick dies as e^-Kτ over this (τ = 120 ms) ...
var KICK_L = 0.35, RADIAL = 0.25, JIT_A = 0.3   // ... and carries it this far (sigil radii, less further out); its way: a quarter out from the centre, and its own within JIT_A (radians)
var ROLL_TAU = 500                   // it rolls to its band under friction (speed ∝ e^-t/τ) ...
var T_SET = T_HIT + 1500             // ... settled by then
var BAND_X = 36, BAND_Y = 0.55       // loosely: within this of its place (px across, rows deep)
var ZIP0 = T_SET + 600, ZIP_STAG = 50, ZIP_SWEEP = 200, ZIP_K = 3   // and drifting (friction, from the kick) into its place, locked by ZIP0 + ZIP_STAG·j
                                     // (row j) and its left end first: the rows zip shut from the top down
var SEP_FADE = 500, DUP_IN = 120, DUP_OUT = [0.35, 0.85]
var CORE_BACK = 1200, CORE_TAU = 700 // the cue ball's draw back into the logo (friction); then it is gone
var REB_H = 0.5, POCKET = [0.82, 1], PULSE_TAU = 0.9
var WORD_FADE = 200
var FINAL = [T_OUT - 150, T_OUT]

// Back (ms since it started)
var HEAD_OUT = 160, WORD_OUT = 200   // the strip's words go out in place (the heads first: the core passes them)
var TAP = 280, POP_V = 0.15          // the core drops out of the logo (setting off at POP_V of its mean speed) and strikes the strip
var CORE_END = TAP + 1700, CORE_K = 1.5   // then rolls on into the centre, slowing
var V_FB = 2.2, DEP_J = 25           // the strike's front through the strip (px per ms)
var BK_L = 0.32, BK_C = 0.7          // a dot's kick: this far (sigil radii, less further off), away from the impact and this much towards the centre
var RHO_K = 3, RHO_D = [1300, 1700]  // it rolls in under friction (K over this: τ ≈ 500 ms) ...
var PHI_LAG = 0.1                   // ... and settles round onto its ring from this far into its flight
var ARR0 = 2300, ARR_STAG = 45, ARR_J = 100   // ring i is home by ARR0 + ARR_STAG·i (+ jitter): the rack forms inside out
var RHO_IN = ARR0 - 60               // going outwards, its distance is done before any ring forms
var ARR_TC = 120                     // it takes on its ring's drift over its last this
var LIST_R = [2700, 4100], B_SUCK = 0.26      // the list thrown out from the rim
var SEP_IN = 300

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x) }
function smoother(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10) }
function wrapA(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI }

// The friction curve: f(τ) = (1 - e^-Kτ - τ·K·e^-K) / (1 - e^-K - K·e^-K),
// f(0) = 0, f(1) = 1, f'(1) = 0; its speed dies away from the start.
function fric(K) { var ce = K * Math.exp(-K); return { K: K, ce: ce, inv: 1 / (1 - Math.exp(-K) - ce) } }
var FK = fric(KICK_K), FC = fric(CORE_K), FRHO = fric(RHO_K)
function fricAt(F, tau) { return (1 - Math.exp(-F.K * tau) - tau * F.ce) * F.inv }

// The rings' turns over a knead that started at t0: a0 + rate·ms (radians;
// the dividers, index RINGS.length, never turn).
function ringLin(s, t0) {
    var nR = S.RINGS.length, L = { a0: new Float64Array(nR + 1), ar: new Float64Array(nR + 1) }
    for (var i = 0; i < nR; i++) {
        L.a0[i] = S.restTurns(i, t0, s) * TAU
        L.ar[i] = (S.restTurns(i, t0 + 1000, s) * TAU - L.a0[i]) / 1000
    }
    return L
}
// A rack point (lx, ly) of ring i (-1: a divider) at ms: o = [x, y].
function rackAt(Y, RL, i, lx, ly, ms, o) {
    var ri = i >= 0 ? i : RL.a0.length - 1, a = RL.a0[ri] + RL.ar[ri] * ms, c = Math.cos(a), sn = Math.sin(a)
    o[0] = Y.cx + lx * c - ly * sn; o[1] = Y.cy + lx * sn + ly * c
    return o
}
var PJ = [0, 0]

// ------------------------------------------------------------------ the core

// The cue's line, per layout and logo: from the centre towards the stage's
// top-left corner (d, unit), the cue spot (Ls out), the impact (hx, hy,
// HIT_K·R in), the shot's speed, and the draw back into the logo (a
// quadratic h → q → m). Back: the drop onto the strike (m → a → t) and the
// roll on into the centre (t → b → centre).
var PLAN = { key: "" }
function planOf(Y, mark) {
    var m = mark || { x: 30, y: -30 }, key = [Y.w, Y.h, Y.cx, Y.cy, Y.R, Y.tx0, Y.rh, m.x, m.y].join()
    if (PLAN.key === key) return PLAN
    var r0 = Math.max(2, Y.R * 0.014), cx = Y.cx, cy = Y.cy
    var dx = CUE_M - cx, dy = CUE_M - cy, dl = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= dl; dy /= dl
    var room = Math.min(dx < -1e-6 ? (CUE_M - cx) / dx : 1e9, dy < -1e-6 ? (CUE_M - cy) / dy : 1e9)
    var rim = Y.R * S.RINGS[S.RINGS.length - 1].r[1] + GROW * r0 + 1.5
    var Ls = Math.max(rim + 10, Math.min(CUE_K * Y.R, room - WIND_D))
    var P = { key: key, m: m, r0: r0, r1: GROW * r0, dx: dx, dy: dy, Ls: Ls }
    P.hx = cx + dx * HIT_K * Y.R; P.hy = cy + dy * HIT_K * Y.R
    P.shot = Ls + WIND_D - HIT_K * Y.R
    P.v0 = P.shot / (SHOT_TAU * (1 - Math.exp(-(T_HIT - WIND[1]) / SHOT_TAU)))
    var mx = m.x - P.hx, my = m.y - P.hy, ml = Math.sqrt(mx * mx + my * my) || 1
    P.qx = P.hx + dx * REB_H * ml; P.qy = P.hy + dy * REB_H * ml
    var top = S.RINGS.length - 1, fx = Y.tx0, fy = Y.rowY[top]
    var ax = fx - m.x, ay = fy - m.y, al = Math.sqrt(ax * ax + ay * ay) || 1
    P.tx = fx - ax / al * (P.r1 + 3); P.ty = fy - ay / al * (P.r1 + 3)
    P.ax = m.x + 0.3 * (P.tx - m.x); P.ay = m.y + 0.6 * (P.ty - m.y)
    // (Leaving the strike on the way it came, turning to the centre.)
    var ix = P.tx - P.ax, iy = P.ty - P.ay, il = Math.sqrt(ix * ix + iy * iy) || 1
    var ox = cx - P.tx, oy = cy - P.ty, ol = Math.sqrt(ox * ox + oy * oy) || 1
    var ux = ix / il + ox / ol, uy = iy / il + oy / ol, ul = Math.sqrt(ux * ux + uy * uy) || 1
    P.bx = P.tx + ux / ul * 0.4 * ol; P.by = P.ty + uy / ul * 0.4 * ol
    PLAN = P
    return P
}
function quad(x0, y0, x1, y1, x2, y2, k, o) {
    var g = 1 - k
    o.x = g * g * x0 + 2 * g * k * x1 + k * k * x2; o.y = g * g * y0 + 2 * g * k * y1 + k * k * y2
    return o
}
// Out: rolled out, wound up, shot; drawn back off the rack into the logo.
function coreOutAt(Y, ms, mark) {
    var P = planOf(Y, mark), o = { x: Y.cx, y: Y.cy, r: P.r0, a: 1 }
    if (ms <= 0) return o
    var e
    if (ms < WIND[0]) {
        e = smoother(ms / BACKOUT) * P.Ls; o.x = Y.cx + P.dx * e; o.y = Y.cy + P.dy * e
        o.r = P.r0 + (P.r1 - P.r0) * smooth(ms / BACKOUT)
        return o
    }
    o.r = P.r1
    if (ms < WIND[1]) { e = P.Ls + smooth((ms - WIND[0]) / (WIND[1] - WIND[0])) * WIND_D; o.x = Y.cx + P.dx * e; o.y = Y.cy + P.dy * e; return o }
    if (ms < T_HIT) {
        e = P.Ls + WIND_D - P.v0 * SHOT_TAU * (1 - Math.exp(-(ms - WIND[1]) / SHOT_TAU))
        o.x = Y.cx + P.dx * e; o.y = Y.cy + P.dy * e
        return o
    }
    var u = (ms - T_HIT) / CORE_BACK
    if (u >= 1) { o.x = P.m.x; o.y = P.m.y; o.r = 2.5; o.a = 0; return o }
    var k = (1 - Math.exp(-(ms - T_HIT) / CORE_TAU)) / (1 - Math.exp(-CORE_BACK / CORE_TAU))
    quad(P.hx, P.hy, P.qx, P.qy, P.m.x, P.m.y, k, o)
    o.r = P.r1 + (2.5 - P.r1) * k; o.a = 1 - smooth((u - POCKET[0]) / (POCKET[1] - POCKET[0]))
    return o
}
// Back: drops out of the logo, strikes the strip, rolls on into the centre.
function coreBackAt(Y, ms, mark) {
    var P = planOf(Y, mark), o = { x: Y.cx, y: Y.cy, r: P.r0, a: 1 }
    if (ms >= CORE_END) return o
    if (ms < TAP) {
        var u = Math.max(0, ms / TAP), k = (POP_V * u + (1 - POP_V) * u * u)
        quad(P.m.x, P.m.y, P.ax, P.ay, P.tx, P.ty, k, o)
        o.r = 2.5 + (P.r1 - 2.5) * smooth(u); o.a = smooth(ms / 130)
        return o
    }
    var f = fricAt(FC, (ms - TAP) / (CORE_END - TAP))
    quad(P.tx, P.ty, P.bx, P.by, Y.cx, Y.cy, f, o)
    o.r = P.r1 + (P.r0 - P.r1) * f
    return o
}

// ---------------------------------------------------------------- out: plan

// Per knead and layout (s.markCache): the burst's particles (one per dot of
// the sigil or the strip), each kicked as the break's front reaches it and
// given the strip place of its look whose order across its row it has
// where its kick takes it (so neighbours don't cross on the way in).
function outOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "breakshot:out:" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var B = S.burstOf(Y, t, s), n = B.n, t0 = t - (1 - S.average(s.cur)) * T_OUT
    var F = function() { return new Float32Array(n) }
    var O = { n: n, styles: B.styles, ring: B.ring, style: B.style, flags: new Uint8Array(n), lx: B.lx, ly: B.ly, rc: B.rc,
              tx: F(), ty: F(), rl: F(), rel: F(), iD: F(), px: F(), py: F(), ax: F(), ay: F(), bx: F(), by: F(), zs: F(), ex: F(), k2: F(), c2: F(), i2: F(), iZ: F(), k3: F(), c3: F(), i3: F(), t0: t0 }
    var C = { Y: Y, B: B, O: O, P: planOf(Y, s.mark), RL: ringLin(s, t0), keep: S.DUP_C | S.SEP, next: 0, gi: -1, fi: 0 }
    // Not kicked until worked out (outWork, over the first frames; needed by T_HIT).
    for (var k = 0; k < n; k++) { O.rel[k] = 1e9; O.flags[k] = B.flags[k] & C.keep; O.iD[k] = 1; O.iZ[k] = 1 }
    O.C = C; O.ready = false
    mc[key] = O
    return O
}
function outWork(C, budget) {
    var O = C.O, B = C.B, n = O.n, until = Date.now() + budget, k, i
    while (C.next < n) { outKick(C, C.next++); if ((C.next & 63) === 0 && Date.now() > until) return }
    if (C.gi < 0) {
        var groups = {}
        for (k = 0; k < n; k++) { i = B.ring[k]; if (i >= 0) { var gk = i + "/" + B.style[k]; (groups[gk] = groups[gk] || []).push(k) } }
        C.groups = groups; C.gkeys = Object.keys(groups); C.gi = 0
    }
    // The strip's places, by look, in order across the row.
    while (C.gi < C.gkeys.length) {
        var ks = C.groups[C.gkeys[C.gi++]]
        var to = ks.map(function(k) { return { tx: B.tx[k], ty: B.ty[k], rl: B.rl[k], dupL: B.flags[k] & S.DUP_L } })
        to.sort(function(a, b) { return a.tx - b.tx || a.ty - b.ty })
        ks.sort(function(a, b) { return O.ex[a] - O.ex[b] })
        for (var j = 0; j < ks.length; j++) { k = ks[j]; O.tx[k] = to[j].tx; O.ty[k] = to[j].ty; O.rl[k] = to[j].rl; O.flags[k] |= to[j].dupL }
        if (Date.now() > until) return
    }
    while (C.fi < n) { outRoll(C, C.fi++); if ((C.fi & 63) === 0 && Date.now() > until) return }
    O.ready = true
}
// Dot k's kick: when the front reaches it, where it is then, and where the
// kick alone would carry it (the shot's way and out from the impact, a
// quarter out from the centre, a way of its own within JIT_A).
function outKick(C, k) {
    var Y = C.Y, B = C.B, O = C.O, P = C.P, i = B.ring[k], R = Y.R
    rackAt(Y, C.RL, i, B.lx[k], B.ly[k], T_HIT, PJ)
    var hx = PJ[0] - P.hx, hy = PJ[1] - P.hy, hl = Math.sqrt(hx * hx + hy * hy) || 1
    var s1 = S.rngN(S.hash32(B.seed[k] * 7 + 5), 3)
    var rel = T_HIT + FRONT_T * Math.min(1.5, hl / (2 * R)) + FRONT_J * s1[0]
    rackAt(Y, C.RL, i, B.lx[k], B.ly[k], rel, PJ)
    O.rel[k] = rel; O.px[k] = PJ[0]; O.py[k] = PJ[1]
    var fx = -P.dx + hx / hl, fy = -P.dy + hy / hl, fl = Math.sqrt(fx * fx + fy * fy)
    if (fl < 0.2) { fx = hx / hl; fy = hy / hl; fl = 1 }
    var rx = PJ[0] - Y.cx, ry = PJ[1] - Y.cy, rl = Math.sqrt(rx * rx + ry * ry)
    if (rl < 1e-3) { rx = -P.dx; ry = -P.dy; rl = 1 }
    var bx = (1 - RADIAL) * fx / fl + RADIAL * rx / rl, by = (1 - RADIAL) * fy / fl + RADIAL * ry / rl, bl = Math.sqrt(bx * bx + by * by) || 1
    var ja = JIT_A * (2 * s1[2] - 1), jc = Math.cos(ja), js = Math.sin(ja)
    bx /= bl; by /= bl
    var len = KICK_L * R * (1 - 0.45 * Math.min(1, hl / (1.3 * R))) * (0.75 + 0.5 * s1[1])
    var ax = (bx * jc - by * js) * len, ay = (bx * js + by * jc) * len
    // (Inside the stage.)
    ax = clamp(PJ[0] + ax, 12, Y.w - 12) - PJ[0]; ay = clamp(PJ[1] + ay, 12, Y.h - 12) - PJ[1]
    O.ax[k] = ax; O.ay[k] = ay
    O.ex[k] = PJ[0] + ax
}
// Its roll: straight to a point loosely in its row's band (bx, by), and its
// zip: from there into its place, its row's turn, from the row's left end.
function outRoll(C, k) {
    var Y = C.Y, O = C.O, i = O.ring[k], D = T_SET - O.rel[k]
    O.iD[k] = 1 / Math.max(1, D)
    var F2 = fric(Math.max(1, D) / ROLL_TAU)
    O.k2[k] = F2.K; O.c2[k] = F2.ce; O.i2[k] = F2.inv
    if (i < 0) { O.bx[k] = O.px[k] + O.ax[k]; O.by[k] = O.py[k] + O.ay[k]; O.tx[k] = O.bx[k]; O.ty[k] = O.by[k]; O.rl[k] = O.rc[k]; return }
    var sr = S.rngN(S.hash32(C.B.seed[k] * 11 + 3), 2)
    O.bx[k] = clamp(O.tx[k] + BAND_X * (2 * sr[0] - 1), Y.tx0, Y.tx1)
    O.by[k] = clamp(O.ty[k] + BAND_Y * Y.rh * (2 * sr[1] - 1), 12, Y.h - 12)
    // (A kick against its way to its band would turn it round once the kick
    // dies: friction alone never does that. Only the kick's part across or
    // along its way is kept.)
    var gx = O.bx[k] - O.px[k], gy = O.by[k] - O.py[k], g2 = gx * gx + gy * gy, ag = O.ax[k] * gx + O.ay[k] * gy
    if (ag < 0 && g2 > 1) { O.ax[k] -= ag / g2 * gx; O.ay[k] -= ag / g2 * gy }
    var Dz = Math.max(D, ZIP0 + ZIP_STAG * S.LIST_AT[i] + ZIP_SWEEP * clamp((O.tx[k] - Y.tx0) / Math.max(1, Y.tx1 - Y.tx0), 0, 1) - O.rel[k])
    var F3 = fric(ZIP_K)
    O.iZ[k] = 1 / Dz; O.k3[k] = F3.K; O.c3[k] = F3.ce; O.i3[k] = F3.inv
}

// ---------------------------------------------------------------- back: plan

// Per knead and layout: each particle keeps its place in the sigil and takes
// a strip place of its look, matched round the centre (by angle, cyclic
// shift) against where its place is as its ring forms. It is kicked as the
// strike's front reaches it and rolls in, its distance first, then round.
function backOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "breakshot:back:" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var B = S.burstOf(Y, t, s), n = B.n, nR = S.RINGS.length, R = Y.R
    var t0 = t - S.average(s.cur) * T_R, RL = ringLin(s, t0)
    var F = function() { return new Float32Array(n) }
    var Q = { n: n, styles: B.styles, ring: B.ring, style: B.style, flags: new Uint8Array(n), lx: B.lx, ly: B.ly, rc: B.rc,
              tx: F(), ty: F(), rl: F(), dep: F(), arr: F(), kx: F(), ky: F(), rs: F(), fs: F(), rt: F(), df: F(), iR: F(),
              vx: F(), vy: F(), sepIn: F(), t0: t0 }
    var groups = {}
    for (var k = 0; k < n; k++) {
        var i = B.ring[k]
        Q.flags[k] = B.flags[k] & (S.DUP_C | S.SEP)
        if (i >= 0) { var gk = i + "/" + B.style[k]; (groups[gk] = groups[gk] || []).push(k) }
        else {
            // A divider shows as the ring just outside it forms.
            var rr = Math.sqrt(B.lx[k] * B.lx[k] + B.ly[k] * B.ly[k]) / R, oi = 0
            while (oi < nR - 1 && S.RINGS[oi].r[0] < rr) oi++
            Q.sepIn[k] = ARR0 + ARR_STAG * oi + ARR_J / 2 - SEP_IN / 2
        }
    }
    for (k = 0; k < n; k++) { Q.tx[k] = B.tx[k]; Q.ty[k] = B.ty[k]; Q.rl[k] = B.rl[k]; Q.flags[k] |= B.flags[k] & S.DUP_L; Q.dep[k] = 1e9; Q.arr[k] = 2e9; Q.iR[k] = 1 }
    var P = planOf(Y, s.mark), far = 1
    for (k = 0; k < n; k++) if (B.ring[k] >= 0) far = Math.max(far, Math.sqrt((B.tx[k] - P.tx) * (B.tx[k] - P.tx) + (B.ty[k] - P.ty) * (B.ty[k] - P.ty)))
    Q.C = { Y: Y, B: B, Q: Q, RL: RL, P: P, far: far, groups: groups, gkeys: Object.keys(groups), gi: 0 }
    Q.ready = false
    mc[key] = Q
    return Q
}
function match(from, to) {
    var m = from.length, step = Math.max(1, m >> 6), fa = new Float64Array(m), ta = new Float64Array(m), PI = Math.PI
    for (var j = 0; j < m; j++) { fa[j] = from[j].a; ta[j] = to[j].a }
    var cost = function(sh) {
        var c = 0
        for (var j = 0; j < m; j += step) {
            var d = ta[(j + sh) % m] - fa[j]
            d = d > PI ? d - TAU : d < -PI ? d + TAU : d
            c += d < 0 ? -d : d
        }
        return c
    }
    var stride = Math.max(1, Math.ceil(m / 48)), best = 0, bc = Infinity, sh
    for (sh = 0; sh < m; sh += stride) { var c0 = cost(sh); if (c0 < bc) { bc = c0; best = sh } }
    for (sh = best - stride; sh <= best + stride; sh++) { var sm = ((sh % m) + m) % m, c1 = cost(sm); if (c1 < bc) { bc = c1; best = sm } }
    return best
}
function backWork(C, budget) {
    var Y = C.Y, B = C.B, RL = C.RL, cx = Y.cx, cy = Y.cy, until = Date.now() + budget
    while (C.gi < C.gkeys.length) {
        var ks = C.groups[C.gkeys[C.gi++]], m = ks.length, ring = B.ring[ks[0]], tw = ARR0 + ARR_STAG * ring + ARR_J / 2
        var from = ks.map(function(k) { return { tx: B.tx[k], ty: B.ty[k], rl: B.rl[k], dupL: B.flags[k] & S.DUP_L, a: Math.atan2(B.ty[k] - cy, B.tx[k] - cx) } })
        var to = ks.map(function(k) { rackAt(Y, RL, ring, B.lx[k], B.ly[k], tw, PJ); return { k: k, a: Math.atan2(PJ[1] - cy, PJ[0] - cx) } })
        from.sort(function(p, q) { return p.a - q.a }); to.sort(function(p, q) { return p.a - q.a })
        var sh = match(from, to)
        for (var j = 0; j < m; j++) backFlight(C, from[j], to[(j + sh) % m].k, ring)
        if (Date.now() > until) return
    }
    C.Q.ready = true
}
// One dot's way back: from its strip place f to its place k on the rack.
// Its kick (kx, ky: where it alone would carry it) dies within a few frames;
// its roll in starts from there (rs, fs: polar about the centre).
function backFlight(C, f, k, ring) {
    var Y = C.Y, Q = C.Q, B = C.B, P = C.P, RL = C.RL, cx = Y.cx, cy = Y.cy
    Q.tx[k] = f.tx; Q.ty[k] = f.ty; Q.rl[k] = f.rl; Q.flags[k] = (Q.flags[k] & ~S.DUP_L) | f.dupL
    var sr = S.rngN(S.hash32(B.seed[k] * 13 + 11), 4)
    var ddx = f.tx - P.tx, ddy = f.ty - P.ty, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1
    var dep = TAP + dd / V_FB + DEP_J * sr[0]
    var arr = ARR0 + ARR_STAG * ring + ARR_J * sr[1], d = arr - dep
    Q.dep[k] = dep; Q.arr[k] = arr
    // Away from the impact, and towards the centre.
    var gx = cx - f.tx, gy = cy - f.ty, gl = Math.sqrt(gx * gx + gy * gy) || 1
    var wx = ddx / dd + BK_C * gx / gl, wy = ddy / dd + BK_C * gy / gl, wl = Math.sqrt(wx * wx + wy * wy) || 1
    var len = BK_L * Y.R * (1 - 0.5 * dd / C.far) * (0.8 + 0.4 * sr[2])
    var kx = clamp(f.tx + wx / wl * len, 12, Y.w - 12), ky = clamp(f.ty + wy / wl * len, 12, Y.h - 12)
    Q.kx[k] = kx; Q.ky[k] = ky
    rackAt(Y, RL, ring, B.lx[k], B.ly[k], arr, PJ)
    var X = kx - cx, Yy = ky - cy, ax = PJ[0] - cx, ay = PJ[1] - cy
    Q.rs[k] = Math.sqrt(X * X + Yy * Yy); Q.fs[k] = Math.atan2(Yy, X)
    Q.rt[k] = Math.sqrt(ax * ax + ay * ay); Q.df[k] = wrapA(Math.atan2(ay, ax) - Q.fs[k])
    var tr = Math.min(RHO_D[0] + (RHO_D[1] - RHO_D[0]) * sr[3], arr - dep)
    if (Q.rs[k] < Q.rt[k]) tr = Math.min(tr, RHO_IN - dep)
    Q.iR[k] = 1 / Math.max(1, tr)
    // Its ring's drift there (px per ms).
    var w = RL.ar[ring]
    Q.vx[k] = -ay * w; Q.vy[k] = ax * w
}

// ------------------------------------------------------------------- paint

var RC = new Float32Array(S.MAX_RINGS + 1), RS = new Float32Array(S.MAX_RINGS + 1), RA = new Float32Array(S.MAX_RINGS + 1)
var WO = new Float32Array(3)

// The rings' turns (the rest drift) and their alphas.
function ringsAt(t, s, shape) {
    var nR = S.RINGS.length
    for (var i = 0; i < nR; i++) {
        var a = S.restTurns(i, t, s) * TAU
        RC[i] = Math.cos(a); RS[i] = Math.sin(a)
        RA[i] = S.hiDim(s.hi < 0 || s.hi === i, shape, S.DIM_RING) * S.ease(clamp((t - s.builtAt - i * 45) / 420, 0, 1))
    }
    RC[nR] = 1; RS[nR] = 0; RA[nR] = 1
}

function paintOut(c, Y, t, s) {
    var O = outOf(Y, t, s), b = 1 - S.average(s.cur), ms = b * T_OUT, ga = c.globalAlpha
    if (!O.ready) outWork(O.C, ms > T_HIT - 300 ? Infinity : 2)
    var _RC = RC, _RS = RS, _RA = RA, _DUP_C = S.DUP_C, _DUP_L = S.DUP_L, _SEP_FADE = SEP_FADE, _DUP_IN = DUP_IN
    var d0 = DUP_OUT[0], dd = DUP_OUT[1] - DUP_OUT[0], K1 = FK.K, ce1 = FK.ce, inv1 = FK.inv, iK1 = 1 / KICK_D
    var drawPart = S.drawPart, _STK64 = S.STK64
    ringsAt(t, s, 1 - b)
    var cx = Y.cx, cy = Y.cy, DB = 16.7, nR = S.RINGS.length
    var core = coreOutAt(Y, ms, s.mark), ccx = core.x, ccy = core.y, rr0 = core.r + 1.5, coreOn = core.a > 0.02
    var probe = s.probe || null
    if (probe) probe.core = core
    var Pring = O.ring, Pflags = O.flags, Plx = O.lx, Ply = O.ly, Prc = O.rc, Prel = O.rel, PiD = O.iD, Ppx = O.px, Ppy = O.py, Pax = O.ax, Pay = O.ay
    var Pk2 = O.k2, Pc2 = O.c2, Pi2 = O.i2, PiZ = O.iZ, Pk3 = O.k3, Pc3 = O.c3, Pi3 = O.i3, Pbx = O.bx, Pby = O.by, Ptx = O.tx, Pty = O.ty, Prl = O.rl, Pstyle = O.style, styles = O.styles, st = -1, cur = -1
    for (var k = 0, n = O.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r = Prc[k], a, sx = 0, sy = 0, exact = false, rel = Prel[k]
        var ri = ring >= 0 ? ring : nR
        if (ms < rel) {
            // In the rack.
            var lx = Plx[k], ly = Ply[k]
            x = cx + lx * _RC[ri] - ly * _RS[ri]; y = cy + lx * _RS[ri] + ly * _RC[ri]
            a = _RA[ri]
            if (flags & _DUP_C) a = 0
            exact = b <= 0
        }
        else {
            // The kick (dying fast) and the roll to its band (friction).
            var el = ms - rel, px = Ppx[k], py = Ppy[k], ax = Pax[k], ay = Pay[k], bx = Pbx[k], by = Pby[k]
            var f1 = 1, v1 = 0, f2 = 1, v2 = 0
            var u1 = el * iK1
            if (u1 < 1) { var e1 = Math.exp(-K1 * u1); f1 = (1 - e1 - u1 * ce1) * inv1; v1 = (K1 * e1 - ce1) * inv1 * iK1 }
            var iD = PiD[k], u2 = el * iD
            if (u2 < 1) {
                var K2 = Pk2[k], c2 = Pc2[k], i2 = Pi2[k], e2 = Math.exp(-K2 * u2)
                f2 = (1 - e2 - u2 * c2) * i2; v2 = (K2 * e2 - c2) * i2 * iD
            }
            var rx = bx - px - ax, ry = by - py - ay
            x = px + ax * f1 + rx * f2; y = py + ay * f1 + ry * f2
            var vx = ax * v1 + rx * v2, vy = ay * v1 + ry * v2
            r += (Prl[k] - r) * f2
            if (ring < 0) a = 1 - smooth(el / _SEP_FADE)
            else {
                a = _RA[ring]
                // ... and drifting on into its place, locked as its row zips shut.
                var iZ = PiZ[k], z = el * iZ, zf = 1, zv = 0
                if (z < 1) { var K3 = Pk3[k], e3 = Math.exp(-K3 * z); zf = (1 - e3 - z * Pc3[k]) * Pi3[k]; zv = (K3 * e3 - Pc3[k]) * Pi3[k] * iZ }
                else exact = true
                var zx = Ptx[k] - bx, zy = Pty[k] - by
                x += zx * zf; y += zy * zf; vx += zx * zv; vy += zy * zv
                if (flags & _DUP_L) { var dl = (z - d0) / dd; a *= dl <= 0 ? 1 : dl >= 1 ? 0 : 1 - dl * dl * (3 - 2 * dl) }
            }
            sx = -vx * DB; sy = -vy * DB
            if (flags & _DUP_C) { var di = el / _DUP_IN; a *= di >= 1 ? 1 : di * di * (3 - 2 * di) }
        }
        // The cue ball is in front: the dots pass behind it (hidden while
        // they touch it; it goes back through the break, so parting them
        // would flip them from side to side).
        if (coreOn) {
            var wx = x - ccx, wy = y - ccy
            if (wx * wx + wy * wy < 9 * (rr0 + r) * (rr0 + r)) {
                var oc = (Math.sqrt(wx * wx + wy * wy) - core.r - r) / 1.5
                if (oc < 1) { a *= oc <= 0 ? 0 : oc * oc * (3 - 2 * oc); exact = false }
            }
        }
        if (probe) { probe[4 * k] = x; probe[4 * k + 1] = y; probe[4 * k + 2] = r; probe[4 * k + 3] = a; continue }
        if (a < 0.01) continue
        var sty = Pstyle[k], sl = Math.sqrt(sx * sx + sy * sy)
        a *= ga * styles[sty].a
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK64[sj] + _STK64[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        drawPart(c, x, y, r, sx, sy, sl, exact && sl <= 2, 6, 4)
    }
    c.globalAlpha = ga
    if (probe) return
    S.paintCore(c, core, s, ms > 16.7 ? coreOutAt(Y, ms - 16.7, s.mark) : null)
}

function paintBack(c, Y, t, s) {
    var Q = backOf(Y, t, s), ms = S.average(s.cur) * T_R, ga = c.globalAlpha
    if (!Q.ready) backWork(Q.C, ms > TAP - 120 ? Infinity : 2)
    var _RC = RC, _RS = RS, _RA = RA, _WO = WO, _DUP_C = S.DUP_C, _DUP_L = S.DUP_L, _SEP_IN = SEP_IN
    var drawPart = S.drawPart, _STK43 = S.STK43, wakeOff = S.wakeOff, softBox = S.softBox, _PHI_LAG = PHI_LAG
    var K1 = FK.K, ce1 = FK.ce, inv1 = FK.inv, iK1 = 1 / KICK_D, KR = FRHO.K, ceR = FRHO.ce, invR = FRHO.inv
    ringsAt(t, s, ms / T_R)
    var cx = Y.cx, cy = Y.cy, DB = 16.7, nR = S.RINGS.length, W = Y.w, H = Y.h
    var core = coreBackAt(Y, ms, s.mark), ccx = core.x, ccy = core.y, rr0 = core.r + 1.5, coreOn = core.a > 0.02
    var probe = s.probe || null
    if (probe) probe.core = core
    // The rim glints where it lets a row go.
    var bs = listB(1 - ms / T_R, true), GL = bs > S.SUCK0 ? S.glintsAt(Y, bs, s, true) : [], rim = nR - 2, gw = S.GLINT_W / (Y.R * S.R_E), GLA = S.GLINT_A
    var Pring = Q.ring, Pflags = Q.flags, Plx = Q.lx, Ply = Q.ly, Prc = Q.rc, Ptx = Q.tx, Pty = Q.ty, Prl = Q.rl, Pdep = Q.dep, Parr = Q.arr
    var Pkx = Q.kx, Pky = Q.ky, Prs = Q.rs, Pfs = Q.fs, Prt = Q.rt, Pdf = Q.df, PiR = Q.iR, Pvx = Q.vx, Pvy = Q.vy, PsepIn = Q.sepIn
    var Pstyle = Q.style, styles = Q.styles, st = -1, cur = -1, tc = ARR_TC
    for (var k = 0, n = Q.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r, a, sx = 0, sy = 0, exact = false, onRack = false, pw = 0
        var ri = ring >= 0 ? ring : nR
        if (ring >= 0 && ms < Pdep[k]) {
            // In its row still.
            x = Ptx[k]; y = Pty[k]; r = Prl[k]; a = flags & _DUP_L ? 0 : _RA[ring]; exact = true
        }
        else if (ring >= 0 && ms < Parr[k]) {
            // Kicked, and rolling in: its distance first (friction), then round.
            var dep = Pdep[k], arr = Parr[k], d = arr - dep, el = ms - dep, u = el / d
            var uR = el * PiR[k], rho = Prt[k], drho = 0, rs = Prs[k], dr = Prt[k] - rs
            if (uR < 1) { var eR = Math.exp(-KR * uR); rho = rs + dr * (1 - eR - uR * ceR) * invR; drho = dr * (KR * eR - ceR) * invR * PiR[k] }
            var uf = (u - _PHI_LAG) / (1 - _PHI_LAG), gg = 0, dg = 0
            if (uf > 0) { gg = uf * uf * (3 - 2 * uf); dg = 6 * uf * (1 - uf) / (d * (1 - _PHI_LAG)) }
            var phi = Pfs[k] + Pdf[k] * gg, dphi = Pdf[k] * dg
            var cp = Math.cos(phi), sp = Math.sin(phi), vx = drho * cp - rho * dphi * sp, vy = drho * sp + rho * dphi * cp
            x = cx + rho * cp; y = cy + rho * sp
            // The kick: from its place, dying within a few frames.
            var u1 = el * iK1
            if (u1 < 1) {
                var e1 = Math.exp(-K1 * u1), g1 = 1 - (1 - e1 - u1 * ce1) * inv1, w1 = (K1 * e1 - ce1) * inv1 * iK1
                var ox = Ptx[k] - Pkx[k], oy = Pty[k] - Pky[k]
                x += ox * g1; y += oy * g1; vx -= ox * w1; vy -= oy * w1
            }
            // Onto the rack at its ring's drift there.
            var sv = (ms - arr + tc) / tc
            if (sv > 0) { var hh = tc * (sv * sv * sv - sv * sv), dh = 3 * sv * sv - 2 * sv; x += Pvx[k] * hh; y += Pvy[k] * hh; vx += Pvx[k] * dh; vy += Pvy[k] * dh }
            if (x < 20 || x > W - 20) x = softBox(x, 0, W)
            if (y < 20 || y > H - 20) y = softBox(y, 0, H)
            sx = -vx * DB; sy = -vy * DB
            var e = u * u * (3 - 2 * u)
            r = Prl[k] + (Prc[k] - Prl[k]) * e
            a = _RA[ring]
            if (flags & _DUP_L) a *= smooth((u - 0.03) / 0.12)
            if (flags & _DUP_C) a *= 1 - smooth((u - 0.75) / 0.25)
            pw = 4 * u * (1 - u); pw *= pw
            if (el < 60) pw *= el / 60
        }
        else {
            // In the rack.
            var lx = Plx[k], ly = Ply[k]
            x = cx + lx * _RC[ri] - ly * _RS[ri]; y = cy + lx * _RS[ri] + ly * _RC[ri]
            r = Prc[k]; a = _RA[ri]
            if (ring < 0) a *= smooth((ms - PsepIn[k]) / _SEP_IN)
            else if (flags & _DUP_C) a = 0
            exact = true; onRack = true
        }
        // The cue ball is in front: the rack's dots pass behind it (hidden
        // while they touch it); a rolling dot is parted by it.
        if (coreOn) {
            var wx = x - ccx, wy = y - ccy
            if (wx * wx + wy * wy < 9 * (rr0 + r) * (rr0 + r)) {
                if (pw > 0) { _WO[0] = x; _WO[1] = y; _WO[2] = r; wakeOff(_WO, core); x += (_WO[0] - x) * pw; y += (_WO[1] - y) * pw; wx = x - ccx; wy = y - ccy }
                var oc = (Math.sqrt(wx * wx + wy * wy) - core.r - r) / 1.5
                if (oc < 1) { a *= oc <= 0 ? 0 : oc * oc * (3 - 2 * oc); exact = false }
            }
        }
        var boost = 0
        if (GL.length && onRack && ring >= rim) {
            var at = Math.atan2(y - cy, x - cx)
            for (var gi = 0; gi < GL.length; gi += 2) {
                var da = Math.abs(at - GL[gi]); if (da > Math.PI) da = TAU - da
                if (da < gw) boost = Math.max(boost, GL[gi + 1] * (1 - da / gw))
            }
            boost *= smooth((ms - Parr[k]) / 120)   // (a rim dot takes the glint on as it arrives, not at once)
            r *= 1 + 0.25 * boost
        }
        if (probe) { probe[4 * k] = x; probe[4 * k + 1] = y; probe[4 * k + 2] = r; probe[4 * k + 3] = a; continue }
        if (a < 0.01) continue
        var sty = Pstyle[k], sl = Math.sqrt(sx * sx + sy * sy)
        a *= ga * styles[sty].a
        if (boost > 0) a = Math.min(1, a * (1 + GLA * boost))
        if (sl > 2) { var si = sl / r * 8 | 0, ri = r * 4 | 0; var sj = ((ri > 15 ? 15 : ri) * 64 + (si > 63 ? 63 : si)) * 2; a *= _STK43[sj] + _STK43[sj + 1] * (2 * a - 1) }
        if (sty !== st) { st = sty; c.fillStyle = styles[st].col }
        if (a !== cur) { cur = a; c.globalAlpha = a }
        drawPart(c, x, y, r, sx, sy, sl, exact && sl <= 2, 4, 3)
    }
    c.globalAlpha = ga
    if (probe) return
    S.paintCore(c, core, s, ms > 16.7 ? coreBackAt(Y, ms - 16.7, s.mark) : null)
}

// ------------------------------------------------------------------- words

// Out: the list fades in place as the core rolls out; a row's name lights
// as its left end has zipped closed, its value as its right end has, a
// head with its section's first row. Back: the strip's words go out in
// place (the heads first: the core drops past them); the list is thrown
// out from the rim (listB).
function wordAlpha(k, Y, id, w, part) {
    var back = !!(w && w.back), head = typeof id === "string"
    if (k > 0.5) return back ? 1 : 1 - smooth((1 - k) * T_OUT / LIST_FADE)
    if (back) return 1 - smooth(k * T_R / (head ? HEAD_OUT : WORD_OUT))
    var ms = (1 - k) * T_OUT, fin = smooth((ms - FINAL[0]) / (FINAL[1] - FINAL[0]))
    var row = head ? S.firstOf(id.slice(2)) : id
    var te = ZIP0 + ZIP_STAG * S.LIST_AT[row] - 250 + (part === "value" ? ZIP_SWEEP : 0)
    return Math.max(fin, smooth((ms - te) / WORD_FADE))
}

// Out the list stays where it is (it fades); back it is thrown out from the
// rim, on the burst's suck-in run backwards.
function listB(b, back) {
    if (!back) return 0
    return B_SUCK * (1 - clamp(((1 - b) * T_R - LIST_R[0]) / (LIST_R[1] - LIST_R[0]), 0, 1))
}

function prepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    planOf(Y, s.mark)
    if (s.back) backOf(Y, t, s)
    else outOf(Y, t, s)
}

S.register("breakshot", {
    title: "Break shot",
    T_OUT: T_OUT, T_R: T_R,
    prepare: prepare,
    paint: function(c, Y, t, s) {
        if (!Y || Y.w < 100 || Y.h < 100) return
        if (s.back) paintBack(c, Y, t, s); else paintOut(c, Y, t, s)
    },
    wordAlpha: wordAlpha,
    listB: listB,
    corePulse: function(Y, mark) { return (T_HIT + PULSE_TAU * CORE_BACK) / T_OUT },
    pulseBack: true,
    // (The displays changed: the rows did.)
    reset: function() { PLAN = { key: "" } }
})
