#!/usr/bin/env python3
"""Full knead-frame cost (JS + rasterizing) of Sigil.js.

Usage: tests/raster_bench.py [machine.json] [frames] [dpr]
Without machine.json it reads this machine with the helper. A Canvas with
renderStrategy Immediate draws in the GUI thread inside onPaint, so the time
around Sigil.paint includes the raster work.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
args = sys.argv[1:]
machine = Path(args.pop(0)).read_text() if args and not args[0].replace(".", "").isdigit() else subprocess.run(
    [str(root / "machine-mark")], capture_output=True, text=True, check=True).stdout
frames = int(args[0]) if len(args) > 0 else 240
dpr = float(args[1]) if len(args) > 1 else 1.25
theme = Path(os.environ.get("THEME_FILE", Path.home() / ".local/state/omarchy/current/theme/colors.toml"))
with tempfile.TemporaryDirectory(prefix="raster-bench-") as d:
    base = Path(d)
    (base / "plugin").symlink_to(root, target_is_directory=True)
    (base / "shell.qml").write_text("""//@ pragma OmarchyLoadPatch
import QtQuick
import Quickshell
import "plugin/Sigil.js" as Sigil
ShellRoot {
    id: rootItem
    property var machine: MACHINE
    property int n: 0
    property var times: []
    FloatingWindow {
        implicitWidth: 1700; implicitHeight: 900; color: "#05070a"
        Canvas {
            id: cv
            width: Math.round(1260 * DPR); height: Math.round(660 * DPR)
            renderStrategy: Canvas.Immediate
            property var geo: Sigil.geometry(rootItem.machine)
            property var pal: Sigil.palette(THEME)
            property var cache: ({})
            onPaint: {
                var c = getContext("2d")
                var t0 = Date.now()
                c.reset(); c.scale(DPR, DPR)
                var k = 0.5 + 0.5 * Math.sin(rootItem.n / 40 * Math.PI)
                var cur = Sigil.RINGS.map(function(r, i) { return Sigil.ease(Math.max(0, Math.min(1, k * 1.4 - (13 - i) / 13 * 0.4))) })
                var s = { machine: rootItem.machine, facts: Sigil.facts(rootItem.machine, 0), geo: geo, pal: pal, cur: cur, hi: -1, unit: 13,
                          valW: 150, headW: { hw: 60, sw: 60, age: 90 }, builtAt: -1e9, markCache: cache,
                          bg: "#101315" }
                var Y = Sigil.layout(1260, 660, s)
                Sigil.paint(c, Y, 1e6 + rootItem.n * 16.7, s)
                c.getImageData(0, 0, 1, 1)
                rootItem.times.push(Date.now() - t0)
                rootItem.n++
            }
        }
    }
    Timer {
        interval: 1; repeat: true; running: true
        onTriggered: {
            if (rootItem.n >= FRAMES + 20) {
                var a = rootItem.times.slice(20).sort(function(x, y) { return x - y })
                var mean = a.reduce(function(p, q) { return p + q }, 0) / a.length
                console.log("RASTER mean=" + mean.toFixed(2) + "ms p50=" + a[Math.floor(a.length / 2)] + " p95=" + a[Math.floor(a.length * 0.95)] + " max=" + a[a.length - 1])
                Qt.quit(); return
            }
            cv.requestPaint()
        }
    }
}
""".replace("MACHINE", machine).replace("THEME", json.dumps(theme.read_text())).replace("FRAMES", str(frames)).replace("DPR", str(dpr)))
    env = dict(os.environ, QT_QPA_PLATFORM="offscreen", XDG_RUNTIME_DIR=str(base / "run"))
    (base / "run").mkdir(mode=0o700)
    log = subprocess.run(["qs", "-p", str(base / "shell.qml"), "--no-color"], env=env, capture_output=True, text=True, timeout=120)
    out = log.stdout + log.stderr
    line = next((l for l in out.splitlines() if "RASTER" in l), None)
    print(line.split("qml: ")[-1] if line else out[-3000:])
    sys.exit(0 if line and log.returncode == 0 else 1)
