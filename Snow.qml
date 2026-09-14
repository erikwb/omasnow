pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var shell: null
    property var manifest: null
    readonly property string pluginId: "io.weirdware.omasnow"
    readonly property string pluginDir: decodeURIComponent(String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "").replace(/\/$/, ""))
    property bool active: true
    property var monitors: ({})
    property var settings: ({})
    property var views: ({})
    signal clearSnow()

    function toggleSnow() {
        active = !active
        return active ? "on" : "off"
    }

    function bounded(key, fallback, low, high) {
        const value = Number(settings[key] === undefined ? fallback : settings[key])
        return isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback
    }

    function readSettings() {
        try {
            const document = JSON.parse(config.text())
            const layout = document.bar?.layout || {}
            const entries = [].concat(layout.left || [], layout.center || [], layout.right || [], document.plugins || [])
            settings = entries.find(entry => entry.id === pluginId) || {}
        } catch (error) { /* Missing config is normal for standalone previews. */ }
    }

    FileView {
        id: config
        path: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/omarchy/shell.json"
        watchChanges: true
        printErrors: false
        onLoaded: root.readSettings()
        onFileChanged: reload()
    }

    Process {
        id: geometry
        command: ["python3", "-u", root.pluginDir + "/geometry.py"]
        running: root.active
        stdout: SplitParser {
            onRead: data => {
                try { root.monitors = JSON.parse(data).monitors || {} }
                catch (error) { console.warn("omasnow geometry:", error) }
            }
        }
        stderr: SplitParser { onRead: data => console.warn("omasnow helper:", data) }
        onExited: {
            root.monitors = {}
            if (root.active) retry.restart()
        }
    }

    Timer {
        id: retry
        interval: 5000
        onTriggered: if (root.active && !geometry.running) geometry.running = Qt.binding(() => root.active)
    }

    IpcHandler {
        target: "omasnow"
        function toggle(): string { return root.toggleSnow() }
        function start(): void { root.active = true }
        function stop(): void { root.active = false }
        function clear(): void { root.clearSnow() }
        function status(): string {
            const screens = {}
            for (const name of Object.keys(root.views)) {
                const view = root.views[name]
                if (view) screens[name] = view.statistics()
            }
            return JSON.stringify({active: root.active, monitors: screens, settings: root.settings})
        }
        function configure(json: string): string {
            try {
                const values = JSON.parse(json)
                if (!values || typeof values !== "object" || Array.isArray(values)) return "expected a JSON object"
                const next = Object.assign({}, root.settings)
                let changed = false
                const ranges = {flakes: [0, 2000], windowDepth: [0, 150], groundDepth: [0, 250], pixelSize: [1, 4]}
                for (const key of Object.keys(values)) {
                    if (["flakes", "wind", "windowDepth", "groundDepth", "hideOnFullscreen", "pixelSize"].indexOf(key) < 0)
                        return "unknown setting: " + key
                    if (ranges[key]) {
                        const value = values[key], range = ranges[key]
                        if (typeof value !== "number" || !Number.isInteger(value) || value < range[0] || value > range[1])
                            return key + " must be an integer from " + range[0] + " to " + range[1]
                    } else if (typeof values[key] !== "boolean") return key + " must be true or false"
                    if (values[key] !== root.settings[key]) changed = true
                    next[key] = values[key]
                }
                // The host returns false for unchanged settings as well as a
                // failed write. A validated no-op is already successful.
                if (!changed) return "ok"
                if (root.shell && !root.shell.updateEntryInline(root.pluginId, next)) return "could not save settings"
                root.settings = next
                return "ok"
            } catch (error) { return String(error) }
        }
    }

    Variants {
        model: Quickshell.screens
        MonitorSnow {
            required property var modelData
            screen: modelData
            controller: root
            geometry: root.monitors[modelData.name] || null
        }
    }
}
