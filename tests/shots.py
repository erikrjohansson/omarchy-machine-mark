#!/usr/bin/env python3
"""Render the About window off-screen in each shape and save PNGs.

Usage: tests/shots.py OUT_DIR [machine.json]
Without machine.json it reads this machine with the helper. THEME_FILE picks
another theme's colors.toml. Nothing appears on screen: Qt's offscreen
platform, grabToImage.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
machine = Path(sys.argv[2]).read_text() if len(sys.argv) > 2 else subprocess.run(
    [str(root / "machine-mark")], capture_output=True, text=True, check=True).stdout
shell = Path(os.environ.get("OMARCHY_PATH", "/usr/share/omarchy")) / "shell"
theme = Path(os.environ.get("THEME_FILE", Path.home() / ".local/state/omarchy/current/theme/colors.toml"))

with tempfile.TemporaryDirectory(prefix="machine-mark-shots-") as directory:
    base = Path(directory)
    for module in ("Commons", "Ui", "services"):
        (base / module).symlink_to(shell / module, target_is_directory=True)
    (base / "plugin").symlink_to(root, target_is_directory=True)
    (base / "shell.qml").write_text("""//@ pragma OmarchyLoadPatch
import QtQuick
import Quickshell
import qs.Commons
import "plugin" as P
import "plugin/Sigil.js" as Sigil

ShellRoot {
    id: shellRoot
    property var machine: MACHINE
    property var steps: [["sigil", 1], ["half", 0.5], ["strip", 0], ["hover", 1]]
    property int step: 0
    property var pal: Sigil.palette(THEME)

    FloatingWindow {
        implicitWidth: 1008
        implicitHeight: 600
        // The window's own background, so the PNGs look like the window.
        Rectangle {
            id: frame
            anchors.fill: parent
            color: Color.background
            P.AboutCard {
                id: card
                anchors.fill: parent
                machine: shellRoot.machine
                readAt: Date.now()
                running: true
                pal: shellRoot.pal
                themeName: shellRoot.machine.theme
                Component.onCompleted: reset()
            }
        }
    }

    // Set a shape, let it draw, grab it, then the next one.
    Timer {
        interval: 1600
        repeat: true
        running: true
        property bool grabNext: false
        onTriggered: {
            if (grabNext) {
                var name = shellRoot.steps[shellRoot.step][0]
                frame.grabToImage(function(r) { r.saveToFile("OUT/" + name + ".png") })
                shellRoot.step++
                grabNext = false
                if (shellRoot.step >= shellRoot.steps.length) { stop(); quitTimer.start() }
                return
            }
            var s = shellRoot.steps[shellRoot.step][1]
            card.anim = null
            card.cur = Sigil.RINGS.map(function() { return s })
            card.target = Math.round(s)
            card.hi = shellRoot.steps[shellRoot.step][0] === "hover" ? 3 : -1
            grabNext = true
        }
    }
    Timer { id: quitTimer; interval: 600; onTriggered: { console.log("SHOTS_OK"); Qt.quit() } }
}
""".replace("THEME", json.dumps(theme.read_text() if theme.exists() else "")).replace("OUT", str(out)).replace("MACHINE", machine))
    env = dict(os.environ, QT_QPA_PLATFORM="offscreen", QT_QUICK_BACKEND="software",
               QT_SCALE_FACTOR=os.environ.get("SHOT_SCALE", "1.25"),
               XDG_RUNTIME_DIR=str(base / "run"))
    (base / "run").mkdir(mode=0o700)
    result = subprocess.run(["qs", "-p", str(base / "shell.qml"), "--no-color"], env=env,
                            capture_output=True, text=True, timeout=40)
    log = result.stdout + result.stderr
    bad = [line for line in log.splitlines() if any(k in line for k in ("ReferenceError", "TypeError", "Error:", "is not a type", "Binding loop"))]
    print("\n".join(bad[:30]) or "no warnings")
    assert result.returncode == 0 and "SHOTS_OK" in log and not bad, log[-3000:]
    missing = [n for n in ("sigil", "half", "strip", "hover") if not (out / (n + ".png")).exists()]
    assert not missing, "not saved: " + ", ".join(missing)
    print("saved to", out)
