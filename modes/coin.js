.pragma library
.import "../Sigil.js" as S

// Coin: the sigil is a coin flicked about its vertical axis. It spins up as
// one rigid disc, foreshortened with a little perspective (its back face
// mirrored and a shade dimmer, as a real coin's), and shatters at the
// edge-on instant: edge-on, every dot moves sideways, so it bursts into a
// horizontal spray of dots straight across the strip's track, the far
// edges first. The spray settles into the rows' bands, and the rows zip
// closed from their middles out, each row's words lighting at its ends.
// The core is flicked up out of the shatter into the header's logo, which
// pulses.
//
// Back: the logo pulses and lets the core drop to the centre, the coin's
// axle. The strip's words go out in place, its dots lift off and fly in
// (their distance from the centre first, then round), while the empty coin
// turns. They land a wave at each face-on instant, inner rings first, so
// each flip visibly adds a layer of rings; then the coin coasts flat onto
// the rest angles and throws the list back out from its rim.
//
// The coin never turns in its own plane (its rings keep their rest drift
// throughout), so both ends hand over exactly. Everything is a closed-form
// function of time, worked out once per knead (prepare).

var TAU = Math.PI * 2
var T_OUT = 5250, T_R = 4100

// Shared
var D_K = 5                   // the perspective: the eye is this many sigil radii away
var SHADE = 0.15              // the back face is this much dimmer (alpha × 1 - SHADE + SHADE·cos θ)
var BLUR = 1                  // a streak is this many frames of motion long

// Out (ms of the knead)
var T_B = 2500, N_UP = 2.25, P_UP = 2.5   // the spin-up: θ = 2π·N_UP·x^P_UP, edge-on at T_B (front face turning away)
var W_TOP = TAU * N_UP * P_UP / T_B   // its top speed (rad per ms): 2.25 turns/s
var REL_STAG = 50             // the shatter: the far edges first, the axis this much later
var OUT = 1000                // a dot's spray
var K_MIN = 5, K_MAX = 12, H_MAX = 1.2   // its impulse, and how far past its target its throw may aim (no floor on h: the throw is exactly velocity-matched)
var SPRAY = 0.95, JIT_X = 6   // the spray's width (of half the track), and its jitter (px)
var ROW_PULL = 0.25           // the spray already leans this much towards the dot's row
var SCAT_X = 0.3, SCAT_Y = 0.35, K_VAR = [0.55, 1.6]   // and breaks up: each dot its own way across (of the spray's width), up or down (sigil radii), and impulse
var T_SET = 3800, BAND_JIT = 0.6   // settled into its row's band (this many rows deep, loosely) by then
var ZIP0 = 4000, ZIP_D = 1000, CLOSE = 550   // a dot is in its place at ZIP0 + ZIP_D·(its distance from the track's middle), over CLOSE
var WORD0 = ZIP0, WORD_STAG = 30, WORD_IN = 700, VALUE_LAG = 120   // the words come up gradually as the rows zip, top row first (they sit outside the track)
var FINAL = [T_OUT - 120, T_OUT]                    // and everything is lit by the end, whatever
var LIST_FADE = 300           // the list fades in place
var CORE_OUT = [T_B + 30, T_B + 1030], PULSE_TAU = 0.9   // the core's flick into the logo; the pulse
var FLICK_RAMP = 0.04         // its speed comes up over this much of the flick (40 ms), not in one frame
var SEP_FADE = 500            // the dividers burn out
var DUP_IN = 120, DUP_OUT = 0.25

// Back (ms since it started)
var SPIN0 = 850, W0 = 2 * TAU / 1000          // the empty coin turns at 2 turns/s from here (θ = 0)
var WAVE0 = 1100, WAVE_D = 250, N_WAVE = 4    // the face-on instants the waves land on
var COAST = [1850, 3350]                      // then it coasts one turn, flat at 6π
var DEP0 = 350, DEP_J = 250                   // a dot leaves its row
var RHO_LEAD = 0.75, RHO_IN = 1050            // its distance is done this far into its flight (and, flying out, before any ring forms)
var ARR_TC = 80                               // it matches the coin's speed over its last this
var LIST_R = [2850, 4050], B_SUCK = 0.26      // the list thrown out from the rim
var CORE_DROP = 700, WORD_OUT = 300           // the core drops to the axle; the strip's words go out
var SEP_IN = 300                              // a divider shows over this, round its outer ring's landing

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x) }
function smoother(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (6 * x - 15) + 10) }
function wrapA(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI }

// The coin's turn about its axis (radians) and its rate (rad per ms).
function thetaOut(ms) {
    if (ms <= 0) return 0
    if (ms <= T_B) return TAU * N_UP * Math.pow(ms / T_B, P_UP)
    return TAU * N_UP + W_TOP * (ms - T_B)
}
function omegaOut(ms) {
    if (ms <= 0) return 0
    if (ms <= T_B) return W_TOP * Math.pow(ms / T_B, P_UP - 1)
    return W_TOP
}
function thetaBack(ms) {
    if (ms <= SPIN0) return 0
    if (ms <= COAST[0]) return W0 * (ms - SPIN0)
    if (ms >= COAST[1]) return 3 * TAU
    var v = 1 - (ms - COAST[0]) / (COAST[1] - COAST[0])
    return 2 * TAU + TAU * (1 - v * v * v)
}
function omegaBack(ms) {
    if (ms <= SPIN0 || ms >= COAST[1]) return 0
    if (ms <= COAST[0]) return W0
    var v = 1 - (ms - COAST[0]) / (COAST[1] - COAST[0])
    return W0 * v * v
}
function waveOf(i) { return Math.floor(N_WAVE * i / S.RINGS.length) }
function waveAt(w) { return WAVE0 + WAVE_D * w }

// A point of the coin, (rx, ry) from its centre in its own plane (turned
// already), at turn th: o = [x, y].
function project(Y, rx, ry, th, o) {
    var Dk = D_K * Y.R, p = Dk / (Dk - rx * Math.sin(th))
    o[0] = Y.cx + rx * Math.cos(th) * p; o[1] = Y.cy + ry * p
    return o
}
// The rings' turns in their plane over a knead that started at t0: each
// a0 + rate·ms (radians; the dividers, index RINGS.length, never turn).
function ringLin(s, t0) {
    var nR = S.RINGS.length, L = { a0: new Float64Array(nR + 1), ar: new Float64Array(nR + 1) }
    for (var i = 0; i < nR; i++) {
        L.a0[i] = S.restTurns(i, t0, s) * TAU
        L.ar[i] = (S.restTurns(i, t0 + 1000, s) * TAU - L.a0[i]) / 1000
    }
    return L
}
// The point (lx, ly) of ring i (-1: a divider) at ms, on the coin turned
// by thf(ms).
var PJ = [0, 0]
function coinPoint(Y, RL, i, lx, ly, ms, thf, o) {
    var ri = i >= 0 ? i : RL.a0.length - 1, a = RL.a0[ri] + RL.ar[ri] * ms, c = Math.cos(a), sn = Math.sin(a)
    return project(Y, lx * c - ly * sn, lx * sn + ly * c, thf(ms), o)
}
// And its velocity (px per ms), by a central difference.
function coinVel(Y, RL, i, lx, ly, ms, thf, o) {
    var h = 0.25
    coinPoint(Y, RL, i, lx, ly, ms + h, thf, PJ)
    var x1 = PJ[0], y1 = PJ[1]
    coinPoint(Y, RL, i, lx, ly, ms - h, thf, PJ)
    o[0] = (x1 - PJ[0]) / (2 * h); o[1] = (y1 - PJ[1]) / (2 * h)
    return o
}

// ------------------------------------------------------------------ the core

// One quadratic both ways, from the centre through P1 into the logo.
function coreWay(Y, mark) {
    var m = mark || { x: 30, y: -30 }
    return { r0: Math.max(2, Y.R * 0.014), m: m, p1x: m.x + (Y.cx - m.x) * 0.35, p1y: m.y + (Y.cy - m.y) * 0.55 }
}
function quad(Y, W, k, o) {
    var g = 1 - k
    o.x = g * g * Y.cx + 2 * g * k * W.p1x + k * k * W.m.x
    o.y = g * g * Y.cy + 2 * g * k * W.p1y + k * k * W.m.y
    return o
}
// Out: flicked by the shatter, slowing into the logo.
function coreOutAt(Y, ms, mark) {
    var W = coreWay(Y, mark), o = { x: Y.cx, y: Y.cy, r: W.r0, a: 1 }
    if (ms <= CORE_OUT[0]) return o
    var tau = Math.min(1, (ms - CORE_OUT[0]) / (CORE_OUT[1] - CORE_OUT[0]))
    var u = (tau < FLICK_RAMP ? tau * tau / (2 * FLICK_RAMP) : tau - FLICK_RAMP / 2) / (1 - FLICK_RAMP / 2)
    quad(Y, W, 1 - (1 - u) * (1 - u), o)
    o.r = W.r0 + (2.5 - W.r0) * tau; o.a = 1 - smooth((tau - PULSE_TAU) / (1 - PULSE_TAU))
    return o
}
// Back: let go by the logo, dropping onto the axle.
function coreBackAt(Y, ms, mark) {
    var W = coreWay(Y, mark), e = smoother(ms / CORE_DROP), o = { x: Y.cx, y: Y.cy, r: W.r0, a: 1 }
    if (e >= 1) return o
    quad(Y, W, 1 - e, o)
    o.r = 2.5 + (W.r0 - 2.5) * e; o.a = smooth(ms / 100)
    return o
}

// ---------------------------------------------------------------- out: plan

// Per knead and layout (s.markCache): the burst's particles (one per dot
// of the sigil or the strip), each released at its own instant from where
// the coin has it, sprayed towards ex across the track and given the strip
// place of its look whose order across the track it has (so the closes
// are short and never cross).
function outOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "coin:out:" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var B = S.burstOf(Y, t, s), n = B.n, nR = S.RINGS.length, t0 = t - (1 - S.average(s.cur)) * T_OUT
    var F = function() { return new Float32Array(n) }
    var O = { n: n, styles: B.styles, ring: B.ring, style: B.style, flags: new Uint8Array(n), lx: B.lx, ly: B.ly, rc: B.rc,
              tx: F(), ty: F(), rl: F(), rel: F(), px: F(), py: F(), qx: F(), qy: F(), ex: F(), ey: F(), sy: F(), kv: F(), k: F(), ce: F(), inv: F(),
              shr: F(), jit: F(), sk: F(), tc0: F(), tL: new Float32Array(nR), tR: new Float32Array(nR), t0: t0 }
    // (The work per dot is in functions of its own: QV4 compiles a function
    // once it has been called a few times, never a loop in one called once.)
    var C = { Y: Y, B: B, O: O, RL: ringLin(s, t0), mid: (Y.tx0 + Y.tx1) / 2, half: (Y.tx1 - Y.tx0) / 2, R: Y.R, keep: S.DUP_C | S.SEP,
              ro: S.RINGS.map(function(r) { return r.r[1] * Y.R }), v: [0, 0] }
    // Not let go until worked out (outWork, over the first frames: the
    // first is needed at T_B); the words' times are the latest until then.
    for (var k = 0; k < n; k++) { O.rel[k] = 1e9; O.flags[k] = B.flags[k] & C.keep }
    for (var i = 0; i < nR; i++) { O.tL[i] = ZIP0 + ZIP_D; O.tR[i] = ZIP0 + ZIP_D }
    C.next = 0; C.gi = -1; C.fi = 0; O.C = C; O.ready = false
    mc[key] = O
    return O
}
// The release and the flights, for up to `budget` ms (Infinity: all).
function outWork(C, budget) {
    var O = C.O, B = C.B, n = O.n, until = Date.now() + budget, k, i
    while (C.next < n) { outRelease(C, C.next++); if ((C.next & 63) === 0 && Date.now() > until) return }
    if (C.gi < 0) {
        var groups = {}
        for (k = 0; k < n; k++) { i = B.ring[k]; if (i >= 0) { var gk = i + "/" + B.style[k]; (groups[gk] = groups[gk] || []).push(k) } }
        C.groups = groups; C.gkeys = Object.keys(groups); C.gi = 0
    }
    // The strip's places, by look, in the order of the spray.
    while (C.gi < C.gkeys.length) {
        var ks = C.groups[C.gkeys[C.gi++]]
        var to = ks.map(function(k) { return { tx: B.tx[k], ty: B.ty[k], rl: B.rl[k], dupL: B.flags[k] & S.DUP_L } })
        to.sort(function(a, b) { return a.tx - b.tx || a.ty - b.ty })
        ks.sort(function(a, b) { return O.ex[a] - O.ex[b] })
        for (var j = 0; j < ks.length; j++) { k = ks[j]; O.tx[k] = to[j].tx; O.ty[k] = to[j].ty; O.rl[k] = to[j].rl; O.flags[k] |= to[j].dupL }
        if (Date.now() > until) return
    }
    if (C.fi === 0) for (i = 0; i < O.tL.length; i++) { O.tL[i] = ZIP0; O.tR[i] = ZIP0 }
    while (C.fi < n) { outFling(C, C.fi++); if ((C.fi & 63) === 0 && Date.now() > until) return }
    O.ready = true
}
// Dot k's release: when the coin lets it go (the far edges first), where
// it is then, and where it is thrown (lx > 0 goes left, the way the coin
// had it going: at T_B its front face turns away), across the track.
function outRelease(C, k) {
    var Y = C.Y, B = C.B, O = C.O, RL = C.RL, R = C.R, i = B.ring[k], lx = B.lx[k], ly = B.ly[k], ri = i >= 0 ? i : RL.a0.length - 1
    var a = RL.a0[ri] + RL.ar[ri] * T_B, rx = lx * Math.cos(a) - ly * Math.sin(a)
    var rel = T_B + REL_STAG * (1 - Math.min(1, Math.abs(rx) / R))
    a = RL.a0[ri] + RL.ar[ri] * rel; rx = lx * Math.cos(a) - ly * Math.sin(a)
    coinPoint(Y, RL, i, lx, ly, rel, thetaOut, PJ)
    O.rel[k] = rel; O.px[k] = PJ[0]; O.py[k] = PJ[1]; O.shr[k] = 1 - SHADE + SHADE * Math.cos(thetaOut(rel))
    // (Each ring across the whole track: its row's width, not the coin's;
    // each dot a way of its own, so the coin's pattern breaks up.)
    var s1 = S.rngN(S.hash32(B.seed[k] * 7 + 3), 5)
    var ro = i >= 0 ? C.ro[i] : R, dx = clamp(rx / ro + SCAT_X * (s1[2] - 0.5), -1, 1)
    O.ex[k] = clamp(C.mid - dx * SPRAY * C.half + JIT_X * (s1[0] - 0.5), Y.tx0 + 4, Y.tx1 - 4)
    O.jit[k] = BAND_JIT * Y.rh * (s1[1] - 0.5)
    O.sy[k] = SCAT_Y * R * (s1[3] - 0.5); O.kv[k] = K_VAR[0] + (K_VAR[1] - K_VAR[0]) * s1[4]
}
// Its flight, once it has its place: into the spray (leaning to its row),
// settling into the row's band, and closing into its place on the zip.
function outFling(C, k) {
    var Y = C.Y, O = C.O, i = O.ring[k], mid = C.mid, v = C.v
    var px = O.px[k], py = O.py[k], ex = O.ex[k], ey = py, band = 0, sk = 1
    if (i >= 0) {
        ey = clamp(py + ROW_PULL * (O.ty[k] - py) + O.sy[k], 12, Y.h - 12)
        sk = Math.max(1, T_SET - O.rel[k]); band = O.ty[k] + O.jit[k] - ey
        var te = ZIP0 + ZIP_D * Math.abs(O.tx[k] - mid) / C.half
        O.tc0[k] = te - CLOSE
        if (O.tx[k] <= mid) O.tL[i] = Math.max(O.tL[i], te)
        if (O.tx[k] >= mid) O.tR[i] = Math.max(O.tR[i], te)
    }
    O.ey[k] = ey; O.sk[k] = sk
    // Leaving at the coin's own velocity (less the band's settling, which
    // adds its own): the curve's bend, and its impulse K, from that.
    coinVel(Y, C.RL, i, O.lx[k], O.ly[k], O.rel[k], thetaOut, v)
    var vx = v[0], vy = v[1] - band * 3 / sk
    var L = Math.max(1, Math.sqrt((ex - px) * (ex - px) + (ey - py) * (ey - py))), vm = Math.sqrt(vx * vx + vy * vy)
    // (Its impulse dies away to exactly nothing by the end: f(τ) ∝
    // 1 - e^(-Kτ) - τ·K·e^(-K), so f'(1) = 0.)
    var K = clamp(clamp(vm * OUT / (2 * H_MAX * L), K_MIN, K_MAX) * O.kv[k], K_MIN, K_MAX), ce = K * Math.exp(-K), inv = 1 / (1 - Math.exp(-K) - ce)
    var lead = OUT / (2 * (K - ce) * inv)
    O.k[k] = K; O.ce[k] = ce; O.inv[k] = inv; O.qx[k] = px + vx * lead; O.qy[k] = py + vy * lead
}

// ---------------------------------------------------------------- back: plan

// Per knead and layout: each particle keeps its place in the sigil and takes
// a strip place of its look, matched round the centre (by angle, cyclic
// shift) against where its place is as its wave lands. Then its flight:
// leaving at dep, its distance (rho) first, round (phi) the short way, both
// eased to rest, plus the coin's own speed there over the last ARR_TC.
function backOf(Y, t, s) {
    var mc = s.markCache || (s.markCache = {}), key = "coin:back:" + Y.w + "x" + Y.h
    if (mc[key]) return mc[key]
    var B = S.burstOf(Y, t, s), n = B.n, cx = Y.cx, cy = Y.cy, nR = S.RINGS.length, R = Y.R
    var t0 = t - S.average(s.cur) * T_R, RL = ringLin(s, t0)
    var F = function() { return new Float32Array(n) }
    var Q = { n: n, styles: B.styles, ring: B.ring, style: B.style, flags: new Uint8Array(n), lx: B.lx, ly: B.ly, rc: B.rc,
              tx: F(), ty: F(), rl: F(), dep: F(), arr: F(), shA: F(), rs: F(), fs: F(), rt: F(), df: F(), trho: F(),
              vx: F(), vy: F(), tc: F(), sepIn: F(), t0: t0 }
    var groups = {}, v = [0, 0]
    for (var k = 0; k < n; k++) {
        var i = B.ring[k]
        Q.flags[k] = B.flags[k] & (S.DUP_C | S.SEP)
        if (i >= 0) { var gk = i + "/" + B.style[k]; (groups[gk] = groups[gk] || []).push(k) }
        else {
            // A divider shows with its outer ring's wave.
            var rr = Math.sqrt(B.lx[k] * B.lx[k] + B.ly[k] * B.ly[k]) / R, oi = 0
            while (oi < nR - 1 && S.RINGS[oi].r[0] < rr) oi++
            Q.sepIn[k] = waveAt(waveOf(oi)) - SEP_IN / 2
        }
    }
    var match = function(from, to) {
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
    // Each in its own strip place until its flight is worked out (backWork,
    // over the first frames: needed from DEP0).
    for (k = 0; k < n; k++) { Q.tx[k] = B.tx[k]; Q.ty[k] = B.ty[k]; Q.rl[k] = B.rl[k]; Q.flags[k] |= B.flags[k] & S.DUP_L; Q.dep[k] = 1e9; Q.arr[k] = 2e9 }
    Q.C = { Y: Y, B: B, Q: Q, RL: RL, v: v, match: match, groups: groups, gkeys: Object.keys(groups), gi: 0 }
    Q.ready = false
    mc[key] = Q
    return Q
}
// The matches and flights, for up to `budget` ms (Infinity: all).
function backWork(C, budget) {
    var Y = C.Y, B = C.B, RL = C.RL, cx = Y.cx, cy = Y.cy, until = Date.now() + budget
    while (C.gi < C.gkeys.length) {
        var ks = C.groups[C.gkeys[C.gi++]], m = ks.length, ring = B.ring[ks[0]], tw = waveAt(waveOf(ring))
        var from = ks.map(function(k) { return { tx: B.tx[k], ty: B.ty[k], rl: B.rl[k], dupL: B.flags[k] & S.DUP_L, a: Math.atan2(B.ty[k] - cy, B.tx[k] - cx) } })
        var to = ks.map(function(k) { coinPoint(Y, RL, ring, B.lx[k], B.ly[k], tw, thetaBack, PJ); return { k: k, x: PJ[0], y: PJ[1], a: Math.atan2(PJ[1] - cy, PJ[0] - cx) } })
        from.sort(function(p, q) { return p.a - q.a }); to.sort(function(p, q) { return p.a - q.a })
        var sh = C.match(from, to)
        for (var j = 0; j < m; j++) backFlight(C, from[j], to[(j + sh) % m], ring, tw)
        if (Date.now() > until) return
    }
    C.Q.ready = true
}
// One dot's way back: from its strip place f to its place on the coin tt
// (where it is as its wave lands, at tw).
function backFlight(C, f, tt, ring, tw) {
    var Y = C.Y, Q = C.Q, B = C.B, cx = Y.cx, cy = Y.cy, k = tt.k, v = C.v
    Q.tx[k] = f.tx; Q.ty[k] = f.ty; Q.rl[k] = f.rl; Q.flags[k] = (Q.flags[k] & ~S.DUP_L) | f.dupL
    var s1 = S.rngN(S.hash32(B.seed[k] * 13 + 11), 1)[0]
    var dep = DEP0 + DEP_J * s1, d = tw - dep
    Q.dep[k] = dep; Q.arr[k] = tw; Q.shA[k] = 1 - SHADE + SHADE * Math.cos(thetaBack(tw))
    var X = f.tx - cx, Yy = f.ty - cy, ax = tt.x - cx, ay = tt.y - cy
    Q.rs[k] = Math.sqrt(X * X + Yy * Yy); Q.fs[k] = Math.atan2(Yy, X)
    Q.rt[k] = Math.sqrt(ax * ax + ay * ay); Q.df[k] = wrapA(Math.atan2(ay, ax) - Q.fs[k])
    // (Flying out from nearer the centre than its place, it is out there
    // before any ring has formed.)
    var tr = dep + RHO_LEAD * d
    if (Q.rs[k] < Q.rt[k]) tr = Math.min(tr, RHO_IN)
    Q.trho[k] = Math.max(dep + 1, tr)
    coinVel(Y, C.RL, ring, B.lx[k], B.ly[k], tw, thetaBack, v)
    Q.vx[k] = v[0]; Q.vy[k] = v[1]; Q.tc[k] = Math.min(ARR_TC, 0.3 * d)
}

// ------------------------------------------------------------------- paint

var RC = new Float32Array(S.RINGS.length + 1), RS = new Float32Array(S.RINGS.length + 1), RA = new Float32Array(S.RINGS.length + 1)
var WO = new Float32Array(3)

// The rings' turns in their plane (the rest drift) and their alphas.
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
    if (!O.ready) outWork(O.C, ms > T_B - 400 ? Infinity : 2)
    var _RC = RC, _RS = RS, _RA = RA, _WO = WO, _CLOSE = CLOSE, _OUT = OUT, _SEP = S.SEP, _DUP_C = S.DUP_C, _DUP_L = S.DUP_L
    var _SEP_FADE = SEP_FADE, _DUP_IN = DUP_IN, _DUP_OUT = DUP_OUT, drawPart = S.drawPart, _STK64 = S.STK64, wakeOff = S.wakeOff, softBox = S.softBox
    ringsAt(t, s, 1 - b)
    var th = thetaOut(ms), om = omegaOut(ms), cth = Math.cos(th), sth = Math.sin(th)
    var Dk = D_K * Y.R, cx = Y.cx, cy = Y.cy, DB = 16.7 * BLUR, nR = S.RINGS.length
    var shade = 1 - SHADE + SHADE * cth
    var core = coreOutAt(Y, ms, s.mark), core0 = coreOutAt(Y, ms - 16.7, s.mark), ccx = core.x, ccy = core.y, rr0 = core.r + 1.5
    // (Fast, it is past a dot before the dot could be pushed: its push fades
    // out from 400 to 1200 px/s, as the burst's does.)
    core.w = 1 - smooth((Math.sqrt((core.x - core0.x) * (core.x - core0.x) + (core.y - core0.y) * (core.y - core0.y)) * 60 - 400) / 800)
    var probe = s.probe || null
    if (probe) probe.core = core
    var Pring = O.ring, Pflags = O.flags, Plx = O.lx, Ply = O.ly, Prc = O.rc, Prel = O.rel, Ppx = O.px, Ppy = O.py, Pqx = O.qx, Pqy = O.qy
    var Pex = O.ex, Pey = O.ey, Pk = O.k, Pce = O.ce, Pinv = O.inv, Pshr = O.shr, Pjit = O.jit, Psk = O.sk, Ptc0 = O.tc0, Ptx = O.tx, Pty = O.ty, Prl = O.rl
    var Pstyle = O.style, styles = O.styles, wHi = Y.w - 8, hHi = Y.h - 8, st = -1, cur = -1
    for (var k = 0, n = O.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r = Prc[k], a, sx = 0, sy = 0, tg = 0, exact = false, rel = Prel[k], pw = 0
        var ri = ring >= 0 ? ring : nR
        if (ms < rel) {
            // On the coin.
            var lx = Plx[k], ly = Ply[k], rx = lx * _RC[ri] - ly * _RS[ri], ry = lx * _RS[ri] + ly * _RC[ri]
            var p = Dk / (Dk - rx * sth)
            x = cx + rx * cth * p; y = cy + ry * p
            sx = rx * sth * om * DB
            a = _RA[ri] * shade
            if (flags & _DUP_C) a = 0
            exact = b <= 0
        }
        else {
            var tau = (ms - rel) / _OUT
            tau = tau > 1 ? 1 : tau
            var kk = Pk[k], ce = Pce[k], ek = Math.exp(-kk * tau), f = (1 - ek - tau * ce) * Pinv[k], g = 1 - f
            var px = Ppx[k], py = Ppy[k], qx = Pqx[k], qy = Pqy[k], ex = Pex[k], ey = Pey[k]
            x = g * g * px + 2 * g * f * qx + f * f * ex; y = g * g * py + 2 * g * f * qy + f * f * ey
            if (x < 28 || x > wHi - 20) x = softBox(x, 8, wHi)
            var fv = tau < 1 ? 2 * (kk * ek - ce) * Pinv[k] / _OUT * DB : 0
            sx = -fv * (g * (qx - px) + f * (ex - qx)); sy = -fv * (g * (qy - py) + f * (ey - qy))
            a = Pshr[k] + (1 - Pshr[k]) * f
            if (ring < 0) a *= 1 - smooth((ms - rel) / _SEP_FADE)
            else {
                a *= _RA[ring]
                r += (Prl[k] - r) * f
                // Into its row's band, slowing all the way from its release.
                tg = (ms - Ptc0[k]) / _CLOSE
                tg = tg <= 0 ? 0 : tg >= 1 ? 1 : tg * tg * tg * (tg * (6 * tg - 15) + 10)
                var sk = Psk[k], us = (ms - rel) / sk
                us = us > 1 ? 1 : us
                var u1 = 1 - us, gs = 1 - u1 * u1 * u1, band = Pty[k] + Pjit[k] * (1 - tg) - ey
                y += band * gs; sy -= band * 3 * u1 * u1 / sk * DB
                // ... and closed into its place, the row zipping from its middle out.
                x += (Ptx[k] - x) * tg
                exact = tg >= 1
                if (flags & _DUP_L) a *= 1 - smooth((tg - 1 + _DUP_OUT) / _DUP_OUT)
            }
            if (flags & _DUP_C) a *= smooth((ms - rel) / _DUP_IN)
            pw = f * f
        }
        // The core is on the axle, in front: the coin's dots pass behind it
        // (hidden while they touch it); a flung dot is parted by it, the more
        // the further it has flown.
        var wx = x - ccx, wy = y - ccy
        if (wx * wx + wy * wy < 9 * (rr0 + r) * (rr0 + r) && core.a > 0.02) {
            if (pw > 0) { _WO[0] = x; _WO[1] = y; _WO[2] = r; wakeOff(_WO, core); x += (_WO[0] - x) * pw; y += (_WO[1] - y) * pw; wx = x - ccx; wy = y - ccy }
            var oc = (Math.sqrt(wx * wx + wy * wy) - core.r - r) / 1.5
            if (oc < 1) { a *= oc <= 0 ? 0 : oc * oc * (3 - 2 * oc); exact = false }
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
    S.paintCore(c, core, s, core0)
}

function paintBack(c, Y, t, s) {
    var Q = backOf(Y, t, s), ms = S.average(s.cur) * T_R, ga = c.globalAlpha
    if (!Q.ready) backWork(Q.C, ms > DEP0 - 100 ? Infinity : 2)
    var _RC = RC, _RS = RS, _RA = RA, _WO = WO, _DUP_C = S.DUP_C, _DUP_L = S.DUP_L, _SEP_IN = SEP_IN
    var drawPart = S.drawPart, _STK43 = S.STK43, wakeOff = S.wakeOff, softBox = S.softBox
    ringsAt(t, s, ms / T_R)
    var th = thetaBack(ms), om = omegaBack(ms), cth = Math.cos(th), sth = Math.sin(th)
    if (ms >= COAST[1]) { cth = 1; sth = 0 }
    var Dk = D_K * Y.R, cx = Y.cx, cy = Y.cy, DB = 16.7 * BLUR, nR = S.RINGS.length, W = Y.w, H = Y.h
    var shade = 1 - SHADE + SHADE * cth
    var core = coreBackAt(Y, ms, s.mark), ccx = core.x, ccy = core.y, rr0 = core.r + 1.5
    var probe = s.probe || null
    if (probe) probe.core = core
    // The rim glints where it lets a row go.
    var bs = listB(1 - ms / T_R, true), GL = bs > S.SUCK0 ? S.glintsAt(Y, bs, s, true) : [], rim = nR - 2, gw = S.GLINT_W / (Y.R * S.R_E), GLA = S.GLINT_A
    var Pring = Q.ring, Pflags = Q.flags, Plx = Q.lx, Ply = Q.ly, Prc = Q.rc, Ptx = Q.tx, Pty = Q.ty, Prl = Q.rl, Pdep = Q.dep, Parr = Q.arr
    var PshA = Q.shA, Prs = Q.rs, Pfs = Q.fs, Prt = Q.rt, Pdf = Q.df, Ptrho = Q.trho, Pvx = Q.vx, Pvy = Q.vy, Ptc = Q.tc, PsepIn = Q.sepIn
    var Pstyle = Q.style, styles = Q.styles, st = -1, cur = -1
    for (var k = 0, n = Q.n; k < n; k++) {
        var ring = Pring[k], flags = Pflags[k], x, y, r, a, sx = 0, sy = 0, exact = false, onCoin = false, pw = 0
        var ri = ring >= 0 ? ring : nR
        if (ring >= 0 && ms < Pdep[k]) {
            // In its row still.
            x = Ptx[k]; y = Pty[k]; r = Prl[k]; a = flags & _DUP_L ? 0 : _RA[ring]; exact = true
        }
        else if (ring >= 0 && ms < Parr[k]) {
            // Flying in: its distance first, then round.
            var dep = Pdep[k], arr = Parr[k], d = arr - dep, u = (ms - dep) / d, tr = Ptrho[k]
            var ul = (ms - dep) / (tr - dep)
            ul = ul > 1 ? 1 : ul
            var rs = Prs[k], dr = Prt[k] - rs, rho = rs + dr * ul * ul * (3 - 2 * ul), drho = ul < 1 ? dr * 6 * ul * (1 - ul) / (tr - dep) : 0
            var gg = u * u * (3 - 2 * u), dphi = Pdf[k] * 6 * u * (1 - u) / d, phi = Pfs[k] + Pdf[k] * gg
            var cp = Math.cos(phi), sp = Math.sin(phi), vx = drho * cp - rho * dphi * sp, vy = drho * sp + rho * dphi * cp
            x = cx + rho * cp; y = cy + rho * sp
            // Onto the coin at its own speed there.
            var tc = Ptc[k], sv = (ms - arr + tc) / tc
            if (sv > 0) { var hh = tc * (sv * sv * sv - sv * sv), dh = 3 * sv * sv - 2 * sv; x += Pvx[k] * hh; y += Pvy[k] * hh; vx += Pvx[k] * dh; vy += Pvy[k] * dh }
            if (x < 20 || x > W - 20) x = softBox(x, 0, W)
            if (y < 20 || y > H - 20) y = softBox(y, 0, H)
            sx = -vx * DB; sy = -vy * DB
            var e = u * u * (3 - 2 * u)
            r = Prl[k] + (Prc[k] - Prl[k]) * e
            a = _RA[ring] * (1 + (PshA[k] - 1) * e)
            if (flags & _DUP_L) a *= smooth((u - 0.05) / 0.15)
            if (flags & _DUP_C) a *= 1 - smooth((u - 0.75) / 0.25)
            pw = 4 * u * (1 - u); pw *= pw
        }
        else {
            // On the coin.
            var lx = Plx[k], ly = Ply[k], rx = lx * _RC[ri] - ly * _RS[ri], ry = lx * _RS[ri] + ly * _RC[ri]
            var p = Dk / (Dk - rx * sth)
            x = cx + rx * cth * p; y = cy + ry * p
            sx = rx * sth * om * DB
            r = Prc[k]; a = _RA[ri] * shade
            if (ring < 0) a *= smooth((ms - PsepIn[k]) / _SEP_IN)
            else if (flags & _DUP_C) a = 0
            exact = true; onCoin = true
        }
        // The core is on the axle, in front: the coin's dots pass behind it
        // (hidden while they touch it); a dot in flight is parted by it
        // (easing in and out of its flight).
        var wx = x - ccx, wy = y - ccy
        if (wx * wx + wy * wy < 9 * (rr0 + r) * (rr0 + r) && core.a > 0.02) {
            if (pw > 0) { _WO[0] = x; _WO[1] = y; _WO[2] = r; wakeOff(_WO, core); x += (_WO[0] - x) * pw; y += (_WO[1] - y) * pw; wx = x - ccx; wy = y - ccy }
            var oc = (Math.sqrt(wx * wx + wy * wy) - core.r - r) / 1.5
            if (oc < 1) { a *= oc <= 0 ? 0 : oc * oc * (3 - 2 * oc); exact = false }
        }
        var boost = 0
        if (GL.length && onCoin && ring >= rim) {
            var at = Math.atan2(y - cy, x - cx)
            for (var gi = 0; gi < GL.length; gi += 2) {
                var da = Math.abs(at - GL[gi]); if (da > Math.PI) da = TAU - da
                if (da < gw) boost = Math.max(boost, GL[gi + 1] * (1 - da / gw))
            }
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
    S.paintCore(c, core, s, coreBackAt(Y, ms - 16.7, s.mark))
}

// ------------------------------------------------------------------- words

// Out: the list fades in place as the coin spins up; a row's name lights
// as its left end closes, its value as its right end does (the zip runs
// from the middle out, so both near the end), a head with its section's
// first row. Back: the strip's words go out in place, each before the
// core can reach it; the list is thrown out from the rim (listB).
var FIRST = { age: 13, sw: 10, hw: 5 }
var CROSS = { key: "" }
function crossOf(Y, mark) {
    var m = mark || { x: 30, y: -30 }, key = [Y.w, Y.h, Y.cx, Y.cy, Y.R, Y.rh, m.x, m.y].join()
    if (CROSS.key === key) return CROSS
    var ys = [], ts = [], o
    for (var ms = 0; ms <= CORE_DROP; ms += 4) { o = coreBackAt(Y, ms, m); ys.push(o.y + o.r); ts.push(ms) }
    // When the core first comes within half a row of y (from above).
    var when = function(y) { for (var j = 0; j < ys.length; j++) if (ys[j] >= y - 9) return ts[j]; return 1e9 }
    var rows = [], heads = {}
    for (var i = 0; i < S.RINGS.length; i++) rows.push(when(Y.rowY[i]))
    S.CATS.forEach(function(cat) { heads[cat] = when(Y.heads[cat]) })
    CROSS = { key: key, rows: rows, heads: heads }
    return CROSS
}
function wordAlpha(k, Y, id, w, part) {
    var back = !!(w && w.back), head = typeof id === "string"
    if (k > 0.5) return back ? 1 : 1 - smooth((1 - k) * T_OUT / LIST_FADE)
    if (back) {
        var X = crossOf(Y, w ? w.mark : null), tc = head ? X.heads[id.slice(2)] : X.rows[id]
        return 1 - smooth(k * T_R / clamp(tc - 20, 80, WORD_OUT))
    }
    var ms = (1 - k) * T_OUT, fin = smooth((ms - FINAL[0]) / (FINAL[1] - FINAL[0]))
    var row = head ? FIRST[id.slice(2)] : id, ord = 0
    for (var i = 0; i < Y.rowY.length; i++) if (Y.rowY[i] < Y.rowY[row]) ord++
    return Math.max(fin, smooth((ms - WORD0 - WORD_STAG * ord - (part === "value" ? VALUE_LAG : 0)) / WORD_IN))
}

// Out the list stays where it is (it fades); back it is thrown out from the
// rim, on the burst's suck-in run backwards.
function listB(b, back) {
    if (!back) return 0
    return B_SUCK * (1 - clamp(((1 - b) * T_R - LIST_R[0]) / (LIST_R[1] - LIST_R[0]), 0, 1))
}

function prepare(Y, t, s) {
    if (!Y || Y.w < 100 || Y.h < 100) return
    if (s.back) { backOf(Y, t, s); crossOf(Y, s.mark) }
    else outOf(Y, t, s)
}

S.register("coin", {
    title: "Coin",
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
