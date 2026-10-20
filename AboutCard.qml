import QtQuick
import QtQuick.Window
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui
import "Sigil.js" as Sigil

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
    // layers below can't show through; on see-through themes that would
    // thicken the background, so there the two cross-fade instead.
    readonly property color surface: Commons.Color.background
    readonly property bool occlude: surface.a >= 0.9
    function rgba(c) { return "rgba(" + Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255) + "," + c.a + ")" }

    // Each ring's shape: 0 = strip, 1 = sigil, eased one ring after another.
    property var cur: Sigil.RINGS.map(function() { return 1 })
    property int target: 1
    property var anim: null
    property var drag: null
    // A press only leaves the rest once it moves: a click kneads on release,
    // and taking the layers down on press showed the canvas a beat early.
    property bool dragging: false
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
    property var lastLayout: null   // this frame's layout (canvas, words, pointer)
    property var markCache: ({})    // the knead frames' marks (see Sigil.marksOf)
    property var restLayout: null   // the layout the rest layers were drawn for

    // Rest layers: built per rest, acknowledged per build.
    readonly property int restShape: (!anim && !dragging && !building && machine && geo) ? (allAt(1) ? 1 : allAt(0) ? 0 : -1) : -1
    property int buildGen: 0
    property var awaiting: ({})
    property bool layersReady: false
    property int layerShape: -1
    property bool showLayers: false
    property bool showCanvas: false
    property real canvasFade: 1
    property int dynTick: 0

    readonly property real shape: Sigil.average(cur)

    function now() { return Date.now() }
    // A position rounded down to the screen's pixel grid, so the rest layers
    // land on the same pixels as the knead canvas they replace.
    function snap(v) { var d = Screen.devicePixelRatio || 1; return Math.floor(v * d + 1e-6) / d }
    function allAt(v) { for (var i = 0; i < cur.length; i++) if (cur[i] !== v) return false; return true }
    function geoKey(m) { return [m.host, m.cpu.name, m.gpu.name, m.installed, m.cpu.threads, m.packages.pacman, m.upgrades].join("|") }
    function layoutNow() { return Sigil.layout(stage.width, stage.height, { unit: unit, valW: valW }) }

    // ------------------------------------------------------------ opening

    // Opening starts from the sigil, the rings building in one by one.
    function reset() {
        cur = Sigil.RINGS.map(function() { return 1 })
        target = 1; anim = null; drag = null; dragging = false; hi = -1; say = ""
        builtAt = now(); building = true; buildDone.restart()
        showLayers = false; layerShape = -1; showCanvas = false
        keys.forceActiveFocus()
    }
    Timer { id: buildDone; interval: 1100; onTriggered: card.building = false }

    // A new reading redraws only what it changed. The live reading every 4 s
    // changes memory, GPU load and uptime: the memory ring is redrawn (GPU load
    // is only in the hover text), and the slow dials (uptime, updated) follow
    // once a minute. Redrawing every ring layer at once (~18 MB of images) held the
    // spin up for a frame or two.
    property string factsKey: ""
    property var memDrawn: [-1, -1]   // the memory reading each shape's layers show
    onMachineChanged: {
        markCache = {}
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
    // So is a key while the pointer holds the shape (the next move took over
    // from that knead with a jump), and asking for the shape it already is.
    function go(to) {
        if (anim || drag || dragging || allAt(to)) return
        target = to
        anim = { from: cur.slice(), to: to, t0: -1, fast: false }
    }

    // A drag let go (or cancelled) settles on the nearer shape.
    function settle() {
        target = Math.round(shape)
        anim = { from: cur.slice(), to: target, t0: -1, fast: true }
    }

    function step(t) {
        if (!anim) return
        // The clock starts on the first frame drawn, in the frames' own time,
        // so a slow first frame doesn't skip the start of the motion.
        if (anim.t0 < 0) anim.t0 = t
        var done = true, next = cur.slice(), n = next.length
        for (var i = 0; i < n; i++) {
            var order = anim.to === 1 ? i : n - 1 - i
            var dl = anim.fast ? 0 : order * 40, dur = anim.fast ? 280 : 820
            var k = Sigil.ease(Sigil.clamp((t - anim.t0 - dl) / dur, 0, 1))
            if (k < 1) done = false
            next[i] = Sigil.lerp(anim.from[i], anim.to, k)
        }
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
                 cur: cur, hi: hi, builtAt: builtAt, unit: unit,
                 headW: { hw: headRep.itemAt(0) ? headRep.itemAt(0).implicitWidth : 0,
                          sw: headRep.itemAt(1) ? headRep.itemAt(1).implicitWidth : 0,
                          age: headRep.itemAt(2) ? headRep.itemAt(2).implicitWidth : 0 } }
    }

    // ------------------------------------------------------------ rest layers

    onRestShapeChanged: {
        markCache = {}
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
        lastLayout = layoutNow()
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
        var dpr = Screen.devicePixelRatio || 1
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
    Timer { id: hideCanvas; interval: 50; onTriggered: if (card.layersReady) fadeCanvas.restart() }
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

    // While the full canvas is in use, frames are paced by the display: on a
    // fast display one redraw every other refresh (a steady 60 fps on 120 Hz),
    // each drawn for the moment it will be on screen. Drawing as fast as
    // possible gave 67-100 fps that landed unevenly between refreshes, which
    // looked like stutter (seen in a 60 fps screen recording as a short frame
    // followed by a double one every ~140 ms).
    property real clock: 0
    property real lastDrawT: 0
    property int refreshes: 0
    function kneadTick(t) {
        step(t)
        frameT = t
        // Layers still showing (under a canvas fading in or out) are turned
        // for the same moment, so the two never show the rings apart.
        if (showLayers && layerShape >= 0) turn(t)
        // The words change every few seconds at most (as at rest): measuring them
        // again every few frames was work a knead frame could do without.
        if (t - textsAt > 5000) refreshTexts(t)
        lastLayout = layoutNow()
        canvas.requestPaint()
    }
    FrameAnimation {
        // Also while the canvas fades out at rest: a still last frame over
        // layers that kept turning showed two rings apart for a moment.
        running: card.running && card.visible && !!card.machine && !!card.geo && (card.restShape < 0 || !card.layersReady || card.showCanvas)
        onRunningChanged: if (running) { card.clock = Date.now(); card.refreshes = 0; card.lastDrawT = 0 }
        onTriggered: {
            var ms = frameTime * 1000
            if (!(ms > 0 && ms < 100)) ms = 1000 / 60
            card.clock += ms
            card.refreshes++
            var every = ms < 10.5 ? 2 : 1
            if (card.refreshes % every) return
            // The paint lands on the next refresh: draw for that moment. A long
            // frame then a short one predicted a moment before the last one
            // drawn (the motion stepped back a hair), so it never goes back.
            var t = Math.max(card.clock + ms, card.lastDrawT)
            card.lastDrawT = t
            card.kneadTick(t)
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

            Row {
                id: headRow
                x: Style.space(18)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(14)

                Text {
                    text: ""
                    font.family: "omarchy"
                    font.pixelSize: Style.font.displayLarge + Style.space(12)
                    color: Commons.Color.accent
                    anchors.verticalCenter: parent.verticalCenter
                }

                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: Style.space(1)

                    Text {
                        text: card.machine ? card.machine.host : " "
                        color: card.fg
                        font.family: card.fontName
                        font.pixelSize: Style.font.title
                        font.bold: true
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
                model: Sigil.RINGS.length
                delegate: Item {
                    id: ringLayer
                    required property int index
                    readonly property var lay: card.restLayout
                    readonly property real size: lay ? Math.ceil(2 * (lay.R * Sigil.RINGS[index].r[1] + lay.R * 0.04 + 8)) : 0
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
                model: Sigil.RINGS.length
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
                readonly property real dpr: Screen.devicePixelRatio || 1
                opacity: card.showCanvas ? card.canvasFade : 0
                width: Math.max(1, Math.round(card.width * dpr))
                height: Math.max(1, Math.round(card.height * dpr))
                scale: 1 / dpr
                transformOrigin: Item.TopLeft
                renderStrategy: Canvas.Cooperative
                onPaint: {
                    var c = getContext("2d")
                    c.reset()
                    if (!card.machine || !card.geo || !card.lastLayout) return
                    c.scale(dpr, dpr)
                    var st = card.state(card.frameT)
                    st.markCache = card.markCache
                    if (card.occlude) st.bg = card.rgba(card.surface)
                    Sigil.paint(c, card.lastLayout, card.frameT, st)
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
                    visible: !!card.lastLayout && !!card.machine
                    x: p[0]
                    y: p[1] - height / 2
                    text: Sigil.CAT_NAME[modelData]
                    color: card.pal.cat[modelData]
                    opacity: card.hi < 0 || Sigil.RINGS[card.hi].cat === modelData ? 1 : Sigil.DIM_TEXT
                    font.family: card.fontName
                    font.pixelSize: Style.font.bodySmall
                    font.bold: true
                }
            }

            // Each ring's name and value: in the list (sigil) or along the row (strip).
            Repeater {
                model: Sigil.RINGS.length
                delegate: Item {
                    id: row
                    required property int index
                    readonly property var lay: card.lastLayout
                    readonly property real k: card.cur[index]
                    readonly property var tx: card.texts[index] || { s: "", l: "" }
                    readonly property var p: lay ? Sigil.textPos(lay, index, k, card.unit, Math.min(shortText.implicitWidth, card.valW)) : null
                    // Values never run past their column: the strip's value
                    // column, or the list's width.
                    readonly property real room: lay ? Sigil.lerp(card.valW, lay.infoW - card.unit * 9.2 - 10, k) : 0
                    readonly property bool isHi: card.hi === index
                    readonly property real dim: card.hi < 0 || isHi ? 1 : Sigil.DIM_TEXT
                    visible: !!p && !!card.machine
                    Text {
                        x: row.p ? row.p.nameX : 0
                        y: row.p ? row.p.y - height / 2 : 0
                        text: Sigil.RINGS[row.index].name
                        color: row.isHi ? Commons.Color.menu.selectedText : card.pal.dim
                        opacity: row.dim
                        font.family: card.fontName
                        font.pixelSize: Style.font.body
                        font.bold: row.isHi
                    }
                    Text {
                        id: shortText
                        x: row.p ? row.p.valueX : 0
                        y: row.p ? row.p.y - height / 2 : 0
                        width: Math.min(implicitWidth, Math.max(0, row.room))
                        elide: Text.ElideRight
                        text: row.tx.s
                        color: card.fg
                        opacity: row.dim * Sigil.clamp(1 - 2.2 * row.k, 0, 1)
                        visible: opacity > 0.01
                        font.family: card.fontName
                        font.pixelSize: Style.font.body
                    }
                    Text {
                        x: row.p ? row.p.valueX : 0
                        y: row.p ? row.p.y - height / 2 : 0
                        width: Math.min(implicitWidth, Math.max(0, row.room))
                        elide: Text.ElideRight
                        text: row.tx.l
                        color: card.fg
                        opacity: row.dim * Sigil.clamp(2.2 * row.k - 1.2, 0, 1)
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
                        if (card.drag.moved) {
                            card.anim = null
                            card.dragging = true
                            // Dragging right unrolls the sigil into the strip.
                            var s = Sigil.clamp(card.drag.s0 - dx / 240, 0, 1)
                            card.cur = Sigil.RINGS.map(function() { return s })
                            card.target = Math.round(s)
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
                    card.drag = null; card.dragging = false
                    if (!d) return
                    if (d.moved) card.settle()
                    else card.go(1 - card.target)
                }
                // Cancelled mid-drag (e.g. the pointer is taken away): settle too.
                onCanceled: {
                    var d = card.drag
                    card.drag = null; card.dragging = false
                    if (d && d.moved) card.settle()
                }
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
            readonly property real dpr: Screen.devicePixelRatio || 1
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
