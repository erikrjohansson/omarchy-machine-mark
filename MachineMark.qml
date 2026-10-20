import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import "Sigil.js" as Sigil

// Omarchy's About as a sigil you can knead into a strip. Summoned with
// `omarchy-shell shell summon io.github.erikrjohansson.machine-mark '{}'`
// (the README shows how to put it on Super + Space → About). The machine is
// read by the `machine-mark` helper when it opens, and memory, GPU load
// and uptime again every few seconds while it stays open.
Item {
    id: root

    property var shell: null
    property var manifest: null
    property bool opened: false

    readonly property string pluginId: "io.github.erikrjohansson.machine-mark"
    readonly property string helper: decodeURIComponent(String(Qt.resolvedUrl("machine-mark")).replace(/^file:\/\//, ""))
    property var machine: null
    property real readAt: 0
    property string loadError: ""
    property var palette: Sigil.palette("")
    property bool readAgain: false

    // Hyprland opens it on the focused monitor, like any new window.
    function open(payloadJson) {
        opened = true
        colors.reload()
        // A reading kept from another theme would show that theme's name and
        // dot until the fresh one landed: wait for the fresh one instead.
        if (machine && machine.themeFolder !== themeName.text().trim()) machine = null
        read()
    }

    function close() { opened = false }

    function dismiss() {
        close()
        if (shell) shell.hide(root.pluginId)
    }

    // A reading asked for while one runs is queued, not dropped.
    function read() {
        if (reader.running) { readAgain = true; return }
        readerLimit.restart()
        reader.running = true
    }

    // A reading is taken only if it is not older than the one shown.
    function take(m) {
        if (root.machine && m.now < root.machine.now) return
        root.readAt = Date.now()
        root.machine = m
    }

    Process {
        id: reader
        command: [root.helper]
        stdout: StdioCollector { id: readerOut; waitForEnd: true }
        stderr: StdioCollector { id: readerErr; waitForEnd: true }
        onExited: function(code) {
            readerLimit.stop()
            var parsed = null
            try { parsed = JSON.parse(readerOut.text) } catch (e) {}
            if (code === 0 && parsed && parsed.cpu && parsed.memory) {
                root.loadError = ""
                root.take(parsed)
            } else if (!root.machine) {
                root.loadError = "Couldn't read this machine: " + (readerErr.text.trim().split("\n")[0] || "the helper failed")
            }
            if (root.readAgain) { root.readAgain = false; root.read() }
        }
    }
    // Read once soon after the shell loads the plugin, so the first opening
    // has the facts and builds in at once instead of waiting on fastfetch.
    Timer { interval: 5000; running: true; onTriggered: if (!root.machine) root.read() }

    // The helper has its own time limits; this is the backstop.
    Timer { id: readerLimit; interval: 15000; onTriggered: reader.running = false }

    // While open: memory, GPU load and uptime every 4 seconds (the helper's
    // cheap `live` reading; the rest only changes between openings).
    Timer { interval: 4000; repeat: true; running: root.opened && !!root.machine; onTriggered: if (!live.running) live.running = true }

    Process {
        id: live
        command: [root.helper, "live"]
        stdout: StdioCollector { id: liveOut; waitForEnd: true }
        onExited: function(code) {
            var v = null
            try { v = JSON.parse(liveOut.text) } catch (e) {}
            if (code !== 0 || !v || !v.memory || !root.machine || v.now < root.machine.now) return
            var m = JSON.parse(JSON.stringify(root.machine))
            m.memory = v.memory
            m.uptime = v.uptime
            m.now = v.now
            // GPU load only for the GPU the window shows.
            if (v.gpu && v.gpu.name === m.gpu.name) m.gpu.usage = v.gpu.usage
            root.take(m)
        }
    }

    // The theme's own colours, the same file the shell's Color reads. A theme
    // switch replaces the whole theme folder, which a file watch doesn't
    // survive, so the colours are also read at every opening and whenever
    // theme.name (rewritten in place on every switch) changes. The machine is
    // read again then too, open or not, so the next opening shows this theme.
    FileView {
        id: themeName
        path: Commons.Color.stateHome + "/omarchy/current/theme.name"
        watchChanges: true
        printErrors: false
        onFileChanged: {
            reload()
            colors.reload()
            root.read()
        }
    }
    FileView {
        id: colors
        path: Commons.Color.currentThemePath + "/colors.toml"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.palette = Sigil.palette(text())
    }

    // A normal window, like Omarchy's own About: it can be moved, tiled or
    // closed like any other (Esc or Super + W). A fixed size makes Hyprland
    // float and centre it without a window rule.
    readonly property real winW: Math.round(Style.font.body * 84)
    readonly property real winH: Math.round(Style.font.body * 50)
    FloatingWindow {
        id: window
        title: "About"
        visible: root.opened
        color: Commons.Color.background
        implicitWidth: root.winW
        implicitHeight: root.winH
        minimumSize: Qt.size(root.winW, root.winH)
        maximumSize: Qt.size(root.winW, root.winH)
        // Closed from outside (Super + W): the plugin closes too.
        onVisibleChanged: if (!visible && root.opened) root.dismiss()

        // Built only while open: closing frees the drawing buffers, and every
        // opening starts fresh from the sigil.
        Loader {
            id: cardLoader
            anchors.fill: parent
            active: root.opened
            sourceComponent: AboutCard {
                machine: root.machine
                readAt: root.readAt
                loadError: root.loadError
                running: root.opened
                pal: root.palette
                themeName: root.machine ? root.machine.theme : ""
                onCloseRequested: root.dismiss()
                Component.onCompleted: reset()
            }
        }
    }
}
