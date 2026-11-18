import QtQuick
import QtQuick.Window
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui
import "Sigil.js" as Sigil
// The other ways a knead can go: each registers itself with Sigil.
import "modes/loom.js" as ModeLoom
import "modes/spool.js" as ModeSpool
import "modes/coin.js" as ModeCoin
import "modes/harp.js" as ModeHarp
import "modes/breakshot.js" as ModeBreakshot

// The About card: the machine as a sigil you can knead into a strip and
// back. Drag sideways, click, Space or the buttons switch shapes; hovering a
// ring or a row (or the arrow keys) says what it is in the footer.
//
// Drawing has two modes. At rest each ring (or strip row) is drawn once into
// its own layer and only turned; the words are text items. While the shape
// changes, one canvas draws everything each frame. The two hand over without
// a gap: the outgoing side stays up until the incoming one has painted.
// The card fills its window, which supplies the background.
Item {
    id: card

    // One reading from the helper (see `machine-mark`), and when it was taken.
    property var machine: null
    property real readAt: 0
    property string loadError: ""
    property bool running: false
    property var pal: Sigil.palette("")
    property string themeName: ""

    signal closeRequested()

    // Shell tokens.
    readonly property real unit: Style.font.body
    readonly property string fontName: Style.font.resolvedFamily
    readonly property color fg: Commons.Color.menu.text
    readonly property color dimFg: Qt.darker(fg, 1.4)
    // The knead canvas paints the window's colour under its drawing so the
    // layers below can't show through; on a see-through window that would
    // thicken the background, so there the two cross-fade instead.
    property color surface: Commons.Color.background
    readonly property bool occlude: surface.a >= 0.9
    function rgba(c) { return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + c.a + ")" }

    // Each ring's shape: 0 = strip, 1 = sigil. All rings move together: the
    // knead is one burst (Sigil.paintBurst), so they share one shape.
    property var cur: Sigil.RINGS.map(function() { return 1 })
    // How many rings (one more for each display past the first: see
    // Sigil.setRings; a battery adds one too); the layers and words are made per ring.
    property int ringCount: Sigil.RINGS.length
    property int target: 1
    property var anim: null
    // Kneading back to the sigil: an animation of its own (Sigil.paintReturn),
    // played through, not scrubbed.
    property bool back: false
    // Which way the knead goes (Sigil.modeNames): picked at random as each
    // starts, unless one is chosen (the number keys; 0 for random again).
    // Dealt from a shuffled deck, so every mode plays once before any plays
    // again, and a new deck never starts with the one just played: no two
    // kneads in a row go the same way.
    property string mode: "burst"
    property string modeLock: ""
    property var modeDeck: []
    function pickMode() {
        if (modeLock) return modeLock
        var deck = modeDeck.slice()
        // The deck's last card is the one just played (kept to by a lock,
        // then let go): it goes with the old deck.
        if (deck.length === 1 && deck[0] === mode) deck = []
        if (!deck.length) {
            deck = Sigil.modeNames()
            for (var i = deck.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1)), d = deck[i]
                deck[i] = deck[j]; deck[j] = d
            }
        }
        // Dealt from the end; the card out never repeats the knead just
        // played (as after a new deck, or a lock let go).
        var top = deck.length - 1
        if (top > 0 && deck[top] === mode) { deck[top] = deck[0]; deck[0] = mode }
        var m = deck.pop()
        modeDeck = deck
        return m
    }
    // A press: a click kneads on release; a drag towards the other shape
    // starts the knead as it moves (it isn't scrubbed).
    property var drag: null
    property int hi: -1
    property string say: ""      // footer text while hovering the header
    property real builtAt: -1e9
    property bool building: false
    property string status: ""
    property var geo: null
    property var texts: []
    property real textsAt: 0
    property real valW: 0        // widest short value, for the strip's value column
    property real frameT: 0
    // The knead canvas's moment and shape. It draws in a thread of its own
    // and shows a refresh after the words moved in the same frame, so it is
    // drawn a refresh ahead and the two show the same moment.
    property real canvasT: 0
    property var canvasCur: null
    property var lastLayout: null   // this frame's layout (canvas, words, pointer)
    property var markCache: ({})    // the knead frames' marks (see Sigil.marksOf)
    property var restLayout: null   // the layout the rest layers were drawn for

    // Rest layers: built per rest, acknowledged per build.
    readonly property int restShape: (!anim && !building && machine && geo) ? (allAt(1) ? 1 : allAt(0) ? 0 : -1) : -1
    property int buildGen: 0
    property var awaiting: ({})
    property bool layersReady: false
    property int layerShape: -1
    property bool showLayers: false
    property bool showCanvas: false
    property real canvasFade: 1
    property int dynTick: 0

    readonly property real shape: Sigil.average(cur)
    // What the words need to know of this frame (Sigil.wordAlpha); the
    // knead's cache is filled in place, so this follows the shape.
    readonly property var wordCtx: ({ mark: shape >= 0 ? markPos() : null, back: back, mc: markCache, mode: mode })
    // The list's place in its suck-in (back to the sigil, on its own clock).
    readonly property real listB: Sigil.listB(1 - shape, back, mode)

    // The window's own scale (1.25 on a 1.25-scaled output). Screen's is the
    // output's scale rounded up (2 there): every canvas was drawn at 2x, 2.6
    // times the pixels, only to be scaled down on the GPU.
    readonly property real pxRatio: (Window.window && Window.window.devicePixelRatio) || Screen.devicePixelRatio || 1
    function now() { return Date.now() }
    // A position rounded down to the screen's pixel grid, so the rest layers
    // land on the same pixels as the knead canvas they replace.
    function snap(v) { var d = card.pxRatio; return Math.floor(v * d + 1e-6) / d }
    function allAt(v) { for (var i = 0; i < cur.length; i++) if (cur[i] !== v) return false; return true }
    function geoKey(m) { return [m.host, m.cpu.name, m.gpu.name, m.installed, m.cpu.threads, m.packages.pacman, m.upgrades].join("|") }
    // The layout, made again only when what it depends on changes: a new
    // one every frame made every binding on it work again.
    property var layoutMemo: null
    function layoutNow() {
        var key = [stage.width, stage.height, unit, valW].join()
        if (!layoutMemo || layoutMemo.key !== key) layoutMemo = { key: key, Y: Sigil.layout(stage.width, stage.height, { unit: unit, valW: valW }) }
        return layoutMemo.Y
    }

    // ------------------------------------------------------------ opening

    // Opening starts from the sigil, the rings building in one by one.
    function reset() {
        cur = Sigil.RINGS.map(function() { return 1 })
        target = 1; anim = null; drag = null; hi = -1; say = ""
        builtAt = now(); building = true; buildDone.restart()
        showLayers = false; layerShape = -1; showCanvas = false
        keys.forceActiveFocus()
    }
    Timer { id: buildDone; interval: 1100; onTriggered: card.building = false }
    Timer { id: sayDone; interval: 2500; onTriggered: { card.say = ""; card.status = card.statusText() } }

    // A new reading redraws only what it changed. The live reading every 4 s
    // changes memory, GPU load and uptime: the memory ring is redrawn (GPU load
    // is only in the hover text), and the slow dials (uptime, updated) follow
    // once a minute. Redrawing every ring layer at once (~18 MB of images) held the
    // spin up for a frame or two.
    property string factsKey: ""
    property var memDrawn: [-1, -1]   // the memory reading each shape's layers show
    onMachineChanged: {
        // A display plugged in or out since the last reading (or a battery
        // put in or taken out): a ring more or less, so everything worked out per ring starts again, from the
        // sigil building in, as when the window opens.
        if (machine && Sigil.setRingsFor(machine)) ringsChanged()
        // (Not while a knead runs: its particles, worked out as it started,
        // would be worked out again mid-flight, every 4 s, and jump.)
        if (restShape >= 0) markCache = {}
        if (!machine) return
        refreshTexts(now())
        if (!geo || geo.key !== geoKey(machine)) {
            geo = Sigil.geometry(machine); geo.key = geoKey(machine)
            builtAt = now(); building = true; buildDone.restart()
            factsKey = slowKey(machine)
            return
        }
        var key = slowKey(machine)
        // New facts (say package sizes) can change the seeded shape too.
        if (key !== factsKey) { factsKey = key; geo = Sigil.geometry(machine); geo.key = geoKey(machine); redrawAll(); return }
        catchUp()
    }
    // (The layout first: the layers and words made for the new rings place
    // themselves by it.)
    function ringsChanged() {
        markCache = {}
        layoutMemo = null
        geo = null
        texts = []
        forgetLayers()
        reset()
        lastLayout = layoutNow()
        restLayout = lastLayout
        ringCount = Sigil.RINGS.length
    }
    // Everything except the values the live reading refreshes.
    function slowKey(m) {
        var c = JSON.parse(JSON.stringify(m))
        delete c.memory; delete c.uptime; delete c.now
        if (c.gpu) delete c.gpu.usage
        return JSON.stringify(c)
    }
    onPalChanged: { markCache = {}; rebuild() }
    onThemeNameChanged: refreshTexts(now())
    onHiChanged: status = statusText()
    onValWChanged: rebuild()

    // ------------------------------------------------------------ shapes

    // A knead, once started, plays through: input that would start another
    // (Space, the buttons, a click or a drag) is ignored until it has settled.
    // So is a key while the pointer is down (its release or move kneads),
    // and asking for the shape it already is.
    function go(to) {
        if (anim || drag || allAt(to)) return
        target = to
        back = to === 1
        mode = pickMode()
        pulseB = 1 - shape   // the pulse's clock starts with this knead
        // Back to the sigil, the logo lets the core go (as the mode has it).
        if (back && Sigil.modeOf(mode).pulseBack) { pulse.restart(); pulseAt = Date.now() }
        anim = { from: cur.slice(), to: to, t0: -1 }
    }

    function curAt(t) {
        if (!anim || anim.t0 < 0) return cur
        var k = Sigil.clamp((t - anim.t0) / (back ? Sigil.durBack(mode) : Sigil.durOut(mode)), 0, 1)
        return anim.from.map(function(f) { return Sigil.lerp(f, anim.to, k) })
    }
    function step(t) {
        if (!anim) return
        // The clock starts on the first frame drawn, in the frames' own time,
        // so a slow first frame doesn't skip the start of the motion.
        if (anim.t0 < 0) anim.t0 = t
        var done = true, next = cur.slice(), n = next.length
        // A knead runs evenly: the burst eases each dot itself.
        var k = Sigil.clamp((t - anim.t0) / (back ? Sigil.durBack(mode) : Sigil.durOut(mode)), 0, 1)
        if (k < 1) done = false
        for (var i = 0; i < n; i++) next[i] = Sigil.lerp(anim.from[i], anim.to, k)
        cur = next
        if (done) anim = null
    }

    // ------------------------------------------------------------ words

    function refreshTexts(t) {
        if (!machine) return
        var f = Sigil.facts(machine, Math.max(0, (t - readAt) / 1000)), name = themeName || machine.theme
        texts = Sigil.RINGS.map(function(r) { return Sigil.text(r.k, machine, f, name) })
        textsAt = t
        var widest = 0
        texts.forEach(function(tx) { metrics.text = tx.s; widest = Math.max(widest, metrics.advanceWidth) })
        widest = Math.ceil(widest)
        if (Math.abs(widest - valW) > 2) valW = widest
        status = statusText()
    }
    TextMetrics { id: metrics; font.family: card.fontName; font.pixelSize: Style.font.body }

    // Everything shown, as text, onto the clipboard (the Copy button).
    function copyAll() {
        if (!machine) return
        var f = Sigil.facts(machine, Math.max(0, (now() - readAt) / 1000))
        Quickshell.execDetached(["wl-copy", "--", Sigil.report(machine, f, themeName || machine.theme)])
        say = "Copied everything to the clipboard."
        status = statusText(); sayDone.restart()
    }

    function statusText() {
        if (say) return say
        if (!machine) return loadError || "Reading this machine…"
        if (hi < 0) return ""
        return texts[hi] ? texts[hi].how : ""
    }

    // ------------------------------------------------------------ state for drawing

    function state(t) {
        var m = machine
        return { machine: m, facts: Sigil.facts(m, Math.max(0, (t - readAt) / 1000)), geo: geo, pal: pal,
                 cur: cur, hi: hi, builtAt: builtAt, unit: unit, mark: markPos(), back: back, mode: mode,
                 headW: { hw: headRep.itemAt(0) ? headRep.itemAt(0).implicitWidth : 0,
                          sw: headRep.itemAt(1) ? headRep.itemAt(1).implicitWidth : 0,
                          age: headRep.itemAt(2) ? headRep.itemAt(2).implicitWidth : 0 },
                 wordW: wordW() }
    }

    // The list's names' and values' widths, for what the canvas draws in
    // with them (Sigil.suckItems).
    function wordW() {
        var names = [], vals = []
        for (var i = 0; i < Sigil.RINGS.length; i++) {
            var r = wordRep.itemAt(i)
            names.push(r ? r.nameW : 0); vals.push(r ? r.valW : 0)
        }
        return { names: names, vals: vals }
    }

    // The header's logo in stage coordinates, where the sigil's centre lands.
    function markPos() {
        var p = mark.mapToItem(stage, mark.width / 2, mark.height / 2)
        return { x: p.x, y: p.y }
    }
    // The logo pulses as the core lands in it (and as it lets it go on the
    // way back: see go).
    property real pulseB: 0
    property real pulseAt: 0
    onShapeChanged: {
        if (back) return
        var b = 1 - shape, at = lastLayout ? Sigil.corePulse(lastLayout, markPos(), mode) : -1
        if (at < 0) return
        if ((b >= at) !== (pulseB >= at) && Date.now() - pulseAt > 500) { pulse.restart(); pulseAt = Date.now() }
        pulseB = b
    }

    // ------------------------------------------------------------ rest layers

    onRestShapeChanged: {
        // A new knead's marks and particles from scratch (back to the sigil,
        // the burst's particles stay: it goes back through their cloud); at
        // rest the last knead's stay, for the canvas's last frames as it fades
        // out (worked out again then, they held a frame 40-70 ms).
        if (restShape < 0) {
            var keep = {}
            if (back) for (var key in markCache) if (key.indexOf("burst") === 0) keep[key] = markCache[key]
            markCache = keep
        }
        layersReady = false
        awaiting = ({})
        layerQueue = []
        hideCanvas.stop(); fadeCanvas.stop(); fadeInCanvas.stop()
        // A knead that starts while the canvas fades out keeps its opacity and
        // fades back in from there (setting it to 1 was a visible cut).
        if (restShape >= 0 || !occlude) canvasFade = 1
        if (restShape >= 0) { Qt.callLater(buildLayers); return }
        // The first knead frame, drawn for now: frameT still held the end of
        // the last knead, so the turning rings showed at old angles for a frame.
        frameT = now()
        canvasCur = null
        lastLayout = layoutNow()
        // The knead's particles are worked out now, before its first frame,
        // and its clock starts here: built in the first frame (40-80 ms), the
        // next frame jumped that far into the motion.
        if (machine && geo) {
            var st = state(frameT)
            st.markCache = markCache
            Sigil.prepare(lastLayout, frameT, st)
            // (From when that work is done: a cold start (loom, 35 ms) took
            // that much of the motion's start with it.)
            if (anim && anim.t0 < 0) anim.t0 = now()
        }
        canvas.requestPaint()
    }

    function layerRep() { return restShape === 1 ? ringRep : rowRep }
    function staticFor(shape) { return shape === 1 ? staticSigil : staticStrip }

    // Each shape's layers stay drawn while the other shape is shown, so a
    // knead that settles back on it only fades (redrawing the sigil's big
    // ring layers as it settled was a visible hitch). They are drawn again
    // only when what they show changes: size, theme, the machine's facts.
    property var drawnKeys: ["", ""]
    property string buildingKey: ""
    function layersKey() {
        var dpr = card.pxRatio
        return JSON.stringify([Math.round(stage.width), Math.round(stage.height), dpr, unit, valW, pal, geo ? geo.key : "", factsKey])
    }
    function forgetLayers() { drawnKeys = ["", ""] }

    // Draw every layer for this rest, in one numbered build: only paints
    // asked for by this build count towards it being ready.
    function buildLayers() {
        if (restShape < 0) return
        lastLayout = layoutNow()
        restLayout = lastLayout
        layerShape = restShape
        layersReady = false
        var key = layersKey()
        if (drawnKeys[restShape] === key) { layersUp(); return }
        buildingKey = key
        noteDrawn()
        var gen = ++buildGen, wait = { "static": true }, rep = layerRep()
        for (var i = 0; i < rep.count; i++) wait[i] = true
        awaiting = wait
        // One layer a frame: painting them all at once held a frame ~30 ms.
        // The canvas covers them until the last one is in.
        var q = []
        for (var j = 0; j < rep.count; j++) q.push(rep.itemAt(j))
        q.push(staticFor(restShape))
        layerQueue = q
        drainLayers.running = true
        drainLayers.next()
    }
    property var layerQueue: []
    FrameAnimation {
        id: drainLayers
        function next() {
            var item = card.layerQueue.shift()
            if (item) item.redraw(card.buildGen)
            if (!card.layerQueue.length) running = false
        }
        onTriggered: next()
    }
    function layerDone(id, gen) {
        if (gen !== buildGen || restShape < 0 || !awaiting[id]) return
        delete awaiting[id]
        if (Object.keys(awaiting).length > 0) return
        var keys = drawnKeys.slice()
        keys[restShape] = buildingKey
        drawnKeys = keys
        layersUp()
    }
    function layersUp() {
        layersReady = true
        turn()
        showLayers = true
        // Live rings stored a while ago catch up now, while the knead canvas
        // still covers them (it fades out 50 ms from now).
        catchUp()
        hideCanvas.restart()
    }
    function catchUp() {
        if (!machine) return
        var mem = machine.memory.total ? machine.memory.used / machine.memory.total : -1, changed = []
        if (layerShape < 0 || Math.abs(mem - memDrawn[layerShape]) > 0.002) changed.push("mem")
        if (changed.length) redrawRings(changed)
    }
    // Something every layer shows changed (theme, size, font): a new build.
    function rebuild() { forgetLayers(); if (restShape >= 0) Qt.callLater(buildLayers) }
    // New facts at rest: redraw this shape's layers in place (no hand-over);
    // the other shape's are drawn again when it is next shown.
    function redrawAll() {
        if (restShape < 0 || !layersReady) return
        var keys = ["", ""]
        keys[restShape] = layersKey()
        drawnKeys = keys
        noteDrawn()
        var rep = layerRep()
        for (var i = 0; i < rep.count; i++) if (rep.itemAt(i)) rep.itemAt(i).redraw(0)
        staticFor(restShape).redraw(0)
    }
    // The live values every layer of this build shows.
    function noteDrawn() {
        memDrawn[restShape] = machine && machine.memory.total ? machine.memory.used / machine.memory.total : -1
    }
    function redrawRings(keys) {
        if (restShape < 0 || !layersReady) return
        var rep = layerRep()
        keys.forEach(function(k) { var it = rep.itemAt(Sigil.RK[k]); if (it) it.redraw(0) })
        if (keys.indexOf("mem") !== -1 && machine && machine.memory.total) {
            memDrawn[restShape] = machine.memory.used / machine.memory.total
            staticFor(restShape).redraw(0)   // the list's memory icon
        }
    }

    // The size of the drawing area changes only with the screen or the shell's
    // text size at rest (a knead changes it every frame, and rebuilds anyway).
    Connections {
        target: stage
        function onWidthChanged() { card.rebuild() }
        function onHeightChanged() { card.rebuild() }
    }

    // Once the layers are drawn and up under the canvas, the canvas fades
    // out over them: the softer knead frames dissolve into the sharp layers.
    // On a see-through window the layers can't sit under the canvas, and two
    // halves of a cross-fade let the background through (the marks dipped by
    // a quarter), so there the two swap in one frame, as a knead starts.
    Timer {
        id: hideCanvas
        interval: 50
        onTriggered: {
            if (!card.layersReady) return
            if (card.occlude) fadeCanvas.restart()
            else { card.showCanvas = false; card.canvasFade = 1 }
        }
    }
    // At the start of a knead the canvas fades in over the sharp layers the
    // same way (the rings have barely moved in that time), instead of
    // replacing them in one frame at its lower resolution.
    NumberAnimation {
        id: fadeInCanvas
        target: card; property: "canvasFade"; to: 1; duration: 90; easing.type: Easing.OutQuad
        onFinished: if (card.restShape < 0) { card.showLayers = false; card.layerShape = -1 }
    }
    NumberAnimation {
        id: fadeCanvas
        target: card; property: "canvasFade"; from: 1; to: 0; duration: 220; easing.type: Easing.InOutQuad
        onFinished: if (card.layersReady) { card.showCanvas = false; card.canvasFade = 1 }
    }
    // Layers under a fading canvas: full when the canvas hides them, else
    // fading in as it fades out.
    readonly property real layerOpacity: !showLayers ? 0 : (!showCanvas || occlude) ? 1 : 1 - canvasFade

    // At rest the rings turn slowly (about 10 px a second at the edge), so
    // they are stepped 30 times a second rather than at the display's full
    // refresh rate; the words every 5 seconds, and the slow dials once a minute.
    function turn(t) {
        if (t === undefined) t = now()
        var st = null
        if (layerShape === 1) {
            for (var i = 0; i < ringRep.count; i++) {
                var it = ringRep.itemAt(i)
                if (!it) continue
                if (!st) st = state(t)
                it.rotation = Sigil.layerAngle(i, t, st)
            }
        }
        // The strip stands still.
    }
    Timer {
        interval: 33
        repeat: true
        running: card.showLayers && card.layersReady && card.running && card.visible
        onTriggered: {
            card.dynTick++
            // While the canvas still fades out over them, its frames turn them.
            if (!card.showCanvas) card.turn()
            if (card.dynTick % 1800 === 0) { card.redrawRings(["up", "since"]); card.staticFor(card.layerShape).redraw(0) }
            if (card.dynTick % 150 === 0) card.refreshTexts(card.now())
        }
    }

    // While the full canvas is in use, every refresh draws, for the moment
    // it will be on screen (the next refresh; never going back). Drawing
    // every other refresh (counting triggers) drew 8, 10 and 15 ms apart:
    // not every trigger is a refresh, as a canvas that has finished drawing
    // asks for a frame of its own in between.
    property real clock: 0
    property real lastDrawT: 0
    function kneadTick(t, ms) {
        step(t)
        frameT = t
        // Layers still showing (under a canvas fading in or out) are turned
        // for the same moment, so the two never show the rings apart.
        if (showLayers && layerShape >= 0) turn(t)
        // The words change every few seconds at most (as at rest): measuring them
        // again every few frames was work a knead frame could do without.
        if (t - textsAt > 5000) refreshTexts(t)
        lastLayout = layoutNow()
        canvasT = Math.max(t + ms, canvasT)
        canvasCur = curAt(canvasT)
        canvas.requestPaint()
    }
    FrameAnimation {
        // Also while the canvas fades out at rest: a still last frame over
        // layers that kept turning showed two rings apart for a moment.
        running: card.running && card.visible && !!card.machine && !!card.geo && (card.restShape < 0 || !card.layersReady || card.showCanvas)
        onRunningChanged: if (running) { card.clock = Date.now(); card.lastDrawT = 0; card.canvasT = 0 }
        onTriggered: {
            var ms = frameTime * 1000
            if (!(ms > 0 && ms < 100)) ms = 1000 / 60
            card.clock += ms
            // Drawn a refresh ahead (the words), and the canvas one more: by
            // the refresh (the frames' smoothed time), not this frame's own,
            // which after a slow frame is long, then short: the moment drawn
            // went back (kneadTick also keeps the canvas's from going back).
            var lead = smoothFrameTime * 1000
            if (!(lead > 4 && lead < 34)) lead = ms
            var t = Math.max(card.clock + lead, card.lastDrawT)
            card.lastDrawT = t
            card.kneadTick(t, lead)
        }
    }

    // ------------------------------------------------------------ keys

    function key(event) {
        var k = event.key
        if (k === Qt.Key_Escape) { card.closeRequested(); return true }
        if (k === Qt.Key_Space || k === Qt.Key_Return || k === Qt.Key_Enter) { go(1 - target); return true }
        // Left to right reads sigil → strip, like the buttons: → unrolls it.
        if (k === Qt.Key_Left || k === Qt.Key_H) { go(1); return true }
        if (k === Qt.Key_Right || k === Qt.Key_L) { go(0); return true }
        // The number keys choose how the next kneads go (0: at random).
        if (k >= Qt.Key_0 && k <= Qt.Key_9) {
            var names = Sigil.modeNames(), n = k - Qt.Key_0
            if (n === 0) modeLock = ""
            else if (n <= names.length) modeLock = names[n - 1]
            else return true
            say = modeLock ? "Animation " + n + ": " + Sigil.modeOf(modeLock).title : "Animation: at random"
            status = statusText(); sayDone.restart()
            return true
        }
        if (k === Qt.Key_Down || k === Qt.Key_J) { hi = (hi + 1) % Sigil.RINGS.length; status = statusText(); return true }
        if (k === Qt.Key_Up || k === Qt.Key_K) { hi = hi <= 0 ? Sigil.RINGS.length - 1 : hi - 1; status = statusText(); return true }
        return false
    }
    Item {
        id: keys
        focus: true
        Keys.onPressed: function(event) { event.accepted = card.key(event) }
    }

    // ------------------------------------------------------------ the card

    Column {
        id: body
        anchors.fill: parent

        // Header: who the machine is, then what it runs.
        Item {
            id: head
            width: parent.width
            height: headRow.implicitHeight + Style.space(24)

            // Top right: copy it all, to paste anywhere.
            Ui.Button {
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.top: parent.top
                anchors.topMargin: Style.space(8)
                text: "Copy"
                bordered: true
                fontSize: Style.font.bodySmall
                enabled: !!card.machine
                onClicked: card.copyAll()
            }

            Row {
                id: headRow
                x: Style.space(18)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(14)

                // Omarchy's logo. The sigil's centre flies into it as the sigil
                // bursts, and it pulses once as it lands.
                Item {
                    width: logo.implicitWidth
                    height: logo.implicitHeight
                    anchors.verticalCenter: parent.verticalCenter

                    Text {
                        id: logo
                        text: ""
                        font.family: "omarchy"
                        font.pixelSize: Style.font.displayLarge + Style.space(12)
                        color: Commons.Color.accent
                    }
                    // The flash: the logo again in the foreground colour.
                    Text {
                        id: flash
                        anchors.fill: logo
                        scale: logo.scale
                        text: logo.text
                        font: logo.font
                        color: card.fg
                        opacity: 0
                    }
                    // Where the centre lands.
                    Item { id: mark; anchors.centerIn: parent; width: 8; height: 8 }

                    SequentialAnimation {
                        id: pulse
                        ParallelAnimation {
                            NumberAnimation { target: logo; property: "scale"; to: 1.14; duration: 110; easing.type: Easing.OutQuad }
                            NumberAnimation { target: flash; property: "opacity"; to: 0.7; duration: 110; easing.type: Easing.OutQuad }
                        }
                        ParallelAnimation {
                            NumberAnimation { target: logo; property: "scale"; to: 1; duration: 520; easing.type: Easing.OutBack }
                            NumberAnimation { target: flash; property: "opacity"; to: 0; duration: 420; easing.type: Easing.InQuad }
                        }
                    }
                }

                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(1)

                    // The name, then the make and model, softer (where the
                    // firmware says what it is).
                    Row {
                        spacing: Style.space(10)
                        Text {
                            text: card.machine ? card.machine.host : " "
                            color: card.fg
                            font.family: card.fontName
                            font.pixelSize: Style.font.title
                            font.bold: true
                        }
                        Text {
                            visible: text !== ""
                            text: card.machine && card.machine.model ? card.machine.model : ""
                            color: card.dimFg
                            font.family: card.fontName
                            font.pixelSize: Style.font.title
                        }
                    }
                    HoverText {
                        text: card.machine && card.machine.os.version ? "Omarchy " + card.machine.os.version : "Omarchy"
                        explain: {
                            var m = card.machine, s = text
                            if (m && m.kernel) s += ", running on Linux " + m.kernel
                            if (m && m.wm.name) s += (m.kernel ? " with " : ", running ") + m.wm.name + (m.wm.version ? " " + m.wm.version : "")
                            return s + "."
                        }
                    }
                    HoverText {
                        readonly property string channel: card.machine ? card.machine.os.channel : ""
                        visible: channel !== ""
                        text: channel.charAt(0).toUpperCase() + channel.slice(1) + " channel"
                        explain: channel === "stable" ? "You're on the stable channel, which gets tested releases."
                               : "You're on the " + channel + " channel, which gets new releases first."
                    }
                }
            }
        }

        Ui.PanelSeparator { foreground: card.fg }

        Item {
            id: stage
            width: parent.width
            height: parent.height - head.height - foot.height - 2

            // At rest in the sigil: one layer per ring, turned in place.
            Repeater {
                id: ringRep
                model: card.ringCount
                delegate: Item {
                    id: ringLayer
                    required property int index
                    readonly property var lay: card.restLayout
                    // (A ring gone with a display unplugged has no size, in the moment before its layer goes.)
                    readonly property real size: lay && Sigil.RINGS[index] ? Math.ceil(2 * (lay.R * Sigil.RINGS[index].r[1] + lay.R * 0.04 + 8)) : 0
                    opacity: card.layerShape === 1 ? card.layerOpacity * (card.hi < 0 || card.hi === index ? 1 : Sigil.DIM_RING) : 0
                    // On the canvas's pixel grid, the ring's centre at the middle.
                    x: lay ? card.snap(lay.cx - size / 2) : 0
                    y: lay ? card.snap(lay.cy - size / 2) : 0
                    width: lay ? 2 * (lay.cx - x) : 0
                    height: lay ? 2 * (lay.cy - y) : 0

                    function redraw(gen) { layer.redraw(gen) }

                    Layer {
                        id: layer
                        anchors.fill: parent
                        layerId: ringLayer.index
                        painter: function(c, w, h) {
                            Sigil.paintRingLayer(c, ringLayer.index, w, h, ringLayer.lay.R, card.state(card.now()))
                        }
                    }
                }
            }

            // At rest in the strip: one layer per row, all still.
            Repeater {
                id: rowRep
                model: card.ringCount
                delegate: Item {
                    id: rowLayer
                    required property int index
                    readonly property var lay: card.restLayout
                    readonly property real pad: 6
                    readonly property real trackW: lay ? lay.tx1 - lay.tx0 : 0
                    opacity: card.layerShape === 0 ? card.layerOpacity * (card.hi < 0 || card.hi === index ? 1 : Sigil.DIM_RING) : 0
                    // On the canvas's pixel grid.
                    x: lay ? card.snap(lay.tx0 - pad) : 0
                    y: lay ? card.snap(lay.rowY[index] - lay.rh / 2) : 0
                    width: trackW + 2 * pad
                    height: lay ? lay.rh + 1 : 0

                    function redraw(gen) { layer.redraw(gen) }

                    Layer {
                        id: layer
                        layerId: rowLayer.index
                        anchors.fill: parent
                        painter: function(c, w, h) {
                            var L = rowLayer.lay
                            Sigil.paintRowLayer(c, rowLayer.index, L.tx0 - rowLayer.x, rowLayer.trackW, L.rowY[rowLayer.index] - rowLayer.y, L.rh, card.state(card.now()))
                        }
                    }
                }
            }

            // At rest: dividers, centre dot, head lines and the list icons,
            // one layer per shape.
            Layer {
                id: staticSigil
                layerId: "static"
                anchors.fill: parent
                opacity: card.layerShape === 1 ? card.layerOpacity : 0
                painter: function(c, w, h) { var st = card.state(card.now()); st.cur = Sigil.RINGS.map(function() { return 1 }); Sigil.paintStatic(c, card.restLayout, st) }
            }
            Layer {
                id: staticStrip
                layerId: "static"
                anchors.fill: parent
                opacity: card.layerShape === 0 ? card.layerOpacity : 0
                painter: function(c, w, h) { var st = card.state(card.now()); st.cur = Sigil.RINGS.map(function() { return 0 }); Sigil.paintStatic(c, card.restLayout, st) }
            }

            // While the shape changes (and while building in): everything,
            // every frame, at the layers' resolution (they take over once
            // it settles; at less, the colours "lit up" at the hand-over).
            // Its backing image is the card's size, so a knead never
            // reallocates it; the drawing is scaled to device pixels so lines
            // stay sharp on scaled screens (a larger canvasSize alone would
            // show only its top-left part).
            Canvas {
                id: canvas
                readonly property real dpr: card.pxRatio
                opacity: card.showCanvas ? card.canvasFade : 0
                width: Math.max(1, Math.round(card.width * dpr))
                height: Math.max(1, Math.round(card.height * dpr))
                scale: 1 / dpr
                transformOrigin: Item.TopLeft
                // From the card's top, so the sigil's centre can fly up into
                // the header's logo; the drawing still starts at the stage.
                y: -stage.y
                // Drawn in a thread of its own: in the GUI thread, recording a
                // frame (~15 ms) and then drawing it (~10 ms) left ~26 frames a
                // second on a real screen; this way the two overlap (~60).
                renderStrategy: Canvas.Threaded
                onPaint: {
                    var c = getContext("2d")
                    c.reset()
                    if (!card.machine || !card.geo || !card.lastLayout || card.lastLayout.w < 100 || card.lastLayout.h < 100) return
                    c.scale(dpr, dpr)
                    c.translate(0, stage.y)
                    var ct = card.canvasCur ? card.canvasT : card.frameT
                    var st = card.state(ct)
                    if (card.canvasCur) st.cur = card.canvasCur
                    st.markCache = card.markCache
                    if (card.occlude) st.bg = card.rgba(card.surface)
                    Sigil.paint(c, card.lastLayout, ct, st)
                }
                // Painted (not just asked to paint): this frame replaces the
                // layers. While layers for a new rest are still drawing they
                // stay up underneath; only a knead takes them away.
                onPainted: {
                    if (card.restShape < 0 && card.showLayers && (!card.showCanvas || card.canvasFade < 1) && !fadeInCanvas.running && card.occlude) {
                        if (!card.showCanvas) card.canvasFade = 0
                        fadeInCanvas.from = card.canvasFade
                        fadeInCanvas.duration = Math.max(20, 90 * (1 - card.canvasFade))
                        card.showCanvas = true; fadeInCanvas.restart()
                        return
                    }
                    if (card.restShape < 0 || !card.layersReady) card.showCanvas = true
                    if (card.restShape < 0 && !fadeInCanvas.running) { card.showLayers = false; card.layerShape = -1 }
                }
            }

            // The picked row, as the menus mark their cursor row: one item at
            // rest and while kneading (it slides with its row), so nothing about
            // it changes when the canvas and the layers hand over.
            Rectangle {
                readonly property var lay: card.lastLayout
                readonly property real k: card.hi >= 0 ? card.cur[card.hi] : 0
                readonly property real rowH: !lay ? 0 : Sigil.lerp(lay.rh, lay.ih, k)
                visible: card.hi >= 0 && !!lay && !!card.machine
                opacity: Sigil.hiDim(false, card.shape, 0)
                x: !lay ? 0 : Sigil.lerp(4, lay.ix, k)
                y: !lay || card.hi < 0 ? 0 : Sigil.lerp(lay.rowY[card.hi], lay.yI(Sigil.LIST_AT[card.hi]), k) - rowH / 2 + 1
                width: !lay ? 0 : Sigil.lerp(lay.w - 8, lay.infoW - 10, k)
                height: Math.max(0, rowH - 2)
                radius: Math.min(Style.cornerRadius, height / 2)
                color: Commons.Color.menu.selectedBackground
                border.width: 1
                border.color: Commons.Color.menu.selectedBorder
            }

            // Section heads.
            Repeater {
                id: headRep
                model: Sigil.CATS
                delegate: Text {
                    required property string modelData
                    readonly property var p: card.lastLayout ? Sigil.headPos(card.lastLayout, modelData, card.shape) : [0, 0]
                    // In the list, drawn into the sigil as it winds up.
                    readonly property var sk: card.lastLayout && card.shape > 0.5 ? Sigil.suckAt(card.lastLayout, card.listB, Sigil.suckHead(card.lastLayout, modelData, implicitWidth)) : null
                    visible: !!card.lastLayout && !!card.machine
                    x: sk ? sk.x - width / 2 : p[0]
                    y: (sk ? sk.y : p[1]) - height / 2
                    rotation: sk ? sk.rot : 0
                    scale: sk ? sk.sc : 1
                    text: Sigil.CAT_NAME[modelData]
                    color: card.pal.cat[modelData]
                    opacity: Sigil.hiDim(card.hi < 0 || Sigil.RINGS[card.hi].cat === modelData, card.shape, Sigil.DIM_TEXT) * (sk ? sk.a : 1)
                             * (card.lastLayout ? Sigil.wordAlpha(card.shape, card.lastLayout, "h:" + modelData, card.wordCtx) : 1)
                    font.family: card.fontName
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                }
            }

            // Each ring's name and value: in the list (sigil) or along the row (strip).
            Repeater {
                id: wordRep
                model: card.ringCount
                delegate: Item {
                    id: row
                    required property int index
                    readonly property var lay: card.lastLayout
                    readonly property real k: card.cur[index] || 0
                    readonly property var tx: card.texts[index] || { s: "", l: "" }
                    readonly property var p: lay ? Sigil.textPos(lay, index, k, card.unit, Math.min(shortText.implicitWidth, card.valW)) : null
                    // Values never run past their column: the strip's value
                    // column, or the list's width.
                    readonly property real room: !lay ? 0 : k > 0.5 ? lay.infoW - card.unit * 9.2 - 10 : card.valW
                    readonly property bool isHi: card.hi === index
                    readonly property real dim: Sigil.hiDim(card.hi < 0 || isHi, card.shape, Sigil.DIM_TEXT) * (lay ? Sigil.wordAlpha(k, lay, index, card.wordCtx, "name") : 1)
                    // The value lights after the name, as the row closes to its right end.
                    readonly property real dimV: Sigil.hiDim(card.hi < 0 || isHi, card.shape, Sigil.DIM_TEXT) * (lay ? Sigil.wordAlpha(k, lay, index, card.wordCtx, "value") : 1)
                    readonly property real nameW: nameText.implicitWidth
                    readonly property real valW: longText.width
                    // In the list, drawn into the sigil as it winds up: the
                    // name (with its icon, on the canvas), then the value
                    // (both of its value texts, together).
                    readonly property bool sucked: !!p && k > 0.5
                    readonly property var label: sucked ? Sigil.suckLabel(lay, index, nameW, valW) : null
                    readonly property var value: sucked ? Sigil.suckValue(lay, index, nameW, valW) : null
                    readonly property var skL: sucked && label ? Sigil.suckAt(lay, card.listB, label) : null
                    readonly property var skN: skL ? Sigil.suckPart(skL, p.nameX + nameW / 2 - label.x, 0) : null
                    readonly property var skW: sucked && value ? Sigil.suckAt(lay, card.listB, value) : null
                    readonly property var skV: skW ? Sigil.suckPart(skW, p.valueX + valW / 2 - value.x, 0) : null
                    visible: !!p && !!card.machine
                    Text {
                        id: nameText
                        x: row.skN ? row.skN.x - width / 2 : row.p ? row.p.nameX : 0
                        y: (row.skN ? row.skN.y : row.p ? row.p.y : 0) - height / 2
                        rotation: row.skL ? row.skL.rot : 0
                        scale: row.skL ? row.skL.sc : 1
                        text: Sigil.RINGS[row.index] ? Sigil.RINGS[row.index].name : ""
                        color: row.isHi ? Commons.Color.menu.selectedText : card.pal.dim
                        opacity: row.dim * (row.skL ? row.skL.a : 1)
                        font.family: card.fontName
                        font.pixelSize: Style.font.body
                        font.bold: row.isHi
                    }
                    Text {
                        id: shortText
                        x: row.skV ? row.skV.x - width / 2 : row.p ? row.p.valueX : 0
                        y: (row.skV ? row.skV.y : row.p ? row.p.yv : 0) - height / 2
                        rotation: row.skW ? row.skW.rot : 0
                        scale: row.skW ? row.skW.sc : 1
                        width: Math.min(implicitWidth, Math.max(0, row.room))
                        elide: Text.ElideRight
                        text: row.tx.s
                        color: card.fg
                        // (Each mode fades its values in and out itself: here they
                        // only change place, halfway, where every mode has them out.)
                        opacity: row.k < 0.5 ? row.dimV : 0
                        visible: opacity > 0.01
                        font.family: card.fontName
                        font.pixelSize: Style.font.body
                    }
                    Text {
                        id: longText
                        x: row.skV ? row.skV.x - width / 2 : row.p ? row.p.valueX : 0
                        y: (row.skV ? row.skV.y : row.p ? row.p.yv : 0) - height / 2
                        rotation: row.skW ? row.skW.rot : 0
                        scale: row.skW ? row.skW.sc : 1
                        width: Math.min(implicitWidth, Math.max(0, row.room))
                        elide: Text.ElideRight
                        text: row.tx.l
                        color: card.fg
                        opacity: row.k > 0.5 ? row.dimV * (row.skW ? row.skW.a : 1) : 0
                        visible: opacity > 0.01
                        font.family: card.fontName
                        font.pixelSize: Style.font.body
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: !card.machine
                text: card.loadError || "Reading this machine…"
                color: card.dimFg
                font.family: card.fontName
                font.pixelSize: Style.font.body
            }

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.OpenHandCursor
                onPressed: function(mouse) { if (!card.anim) card.drag = { x: mouse.x, y: mouse.y, s0: card.shape, moved: false } }
                onPositionChanged: function(mouse) {
                    if (card.drag) {
                        var dx = mouse.x - card.drag.x
                        if (!card.drag.moved && Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(mouse.y - card.drag.y)) card.drag.moved = true
                        // A drag towards the other shape (right from the sigil,
                        // left from the strip) just starts that knead.
                        if (card.drag.moved) {
                            var to = card.drag.s0 < 0.5 ? 1 : 0
                            if (to === 1 ? dx < 0 : dx > 0) { card.drag = null; card.go(to) }
                            return
                        }
                    }
                    if (card.lastLayout && card.machine) {
                        var h = Sigil.hit(card.lastLayout, { cur: card.cur }, mouse.x, mouse.y)
                        if (h !== card.hi) { card.hi = h; card.status = card.statusText() }
                    }
                }
                onReleased: {
                    var d = card.drag
                    card.drag = null
                    // (A drag that never went the other shape's way does nothing.)
                    if (d && !d.moved) card.go(1 - card.target)
                }
                onCanceled: card.drag = null
                onExited: if (!card.drag && card.hi >= 0) { card.hi = -1; card.status = card.statusText() }
            }
        }

        Ui.PanelSeparator { foreground: card.fg }

        // Footer: what the pointer is on, and the two shapes.
        Item {
            id: foot
            width: parent.width
            height: Math.max(shapes.implicitHeight, footText.implicitHeight) + Style.space(12)

            Text {
                id: footText
                x: Style.space(14)
                width: parent.width - x - shapes.width - Style.space(24)
                anchors.verticalCenter: parent.verticalCenter
                text: card.machine ? card.status : (card.loadError || "Reading this machine…")
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: card.dimFg
                font.family: card.fontName
                font.pixelSize: Style.font.bodySmall
            }

            Row {
                id: shapes
                anchors.right: parent.right
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(4)
                Ui.Button {
                    text: "Sigil"
                    bordered: true
                    selected: card.target === 1
                    fontSize: Style.font.bodySmall
                    onClicked: card.go(1)
                }
                Ui.Button {
                    text: "Strip"
                    bordered: true
                    selected: card.target === 0
                    fontSize: Style.font.bodySmall
                    onClicked: card.go(0)
                }
            }
        }
    }

    // A canvas drawn at device pixels, painted when asked. A paint asked for
    // by a layer build reports back with that build's number. It stays 1x1
    // until first asked: a Canvas repaints itself when resized, so sizing all
    // 28 layers when the first rest's layout arrived painted every one of
    // them (both shapes) in a single frame.
    component Layer: Item {
        id: layerItem
        property var painter: null
        property var layerId: null
        property int askedGen: 0
        property bool wanted: false
        function redraw(gen) { if (gen) askedGen = gen; wanted = true; cv.requestPaint() }
        Canvas {
            id: cv
            readonly property real dpr: card.pxRatio
            width: layerItem.wanted ? Math.max(1, Math.round(layerItem.width * dpr)) : 1
            height: layerItem.wanted ? Math.max(1, Math.round(layerItem.height * dpr)) : 1
            scale: 1 / dpr
            transformOrigin: Item.TopLeft
            renderStrategy: Canvas.Cooperative
            onPaint: {
                var c = getContext("2d")
                c.reset()
                if (!layerItem.wanted || !layerItem.painter || !card.machine || !card.geo || !card.restLayout) return
                c.scale(dpr, dpr)
                layerItem.painter(c, layerItem.width, layerItem.height)
            }
            onPainted: {
                if (layerItem.askedGen) { var g = layerItem.askedGen; layerItem.askedGen = 0; card.layerDone(layerItem.layerId, g) }
            }
        }
    }

    component HoverText: Text {
        property string explain: ""
        color: hover.containsMouse ? card.fg : card.dimFg
        font.family: card.fontName
        font.pixelSize: Style.font.body
        MouseArea {
            id: hover
            anchors.fill: parent
            hoverEnabled: true
            onContainsMouseChanged: { card.say = containsMouse ? parent.explain : ""; card.status = card.statusText() }
        }
    }
}
