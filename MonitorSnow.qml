pragma ComponentBehavior: Bound
import QtQuick
import Quickshell
import Quickshell.Wayland
import "SnowEngine.js" as Engine
import "Flakes.js" as Flakes

Item {
    id: root
    required property var screen
    required property var controller
    property var geometry: null
    property var engine: null
    property var piles: []
    readonly property var emptyPile: ({id: "", x: 0, y: 0, width: 0, depth: 0,
                                      ground: false, revision: 0, pixels: []})
    readonly property var emptyFlake: ({type: 0, x: -100, y: -100})
    property int frame: 0
    property int pileFrame: 0
    property int geometryRevision: 0
    readonly property real unit: Math.round(controller.bounded("pixelSize", 1, 1, 4)) / back.devicePixelRatio
    readonly property int count: Math.round(controller.bounded("flakes", 100, 0, 2000))
    readonly property int windowDepth: Math.round(controller.bounded("windowDepth", 15, 0, 150))
    readonly property int groundDepth: Math.round(controller.bounded("groundDepth", 50, 0, 250))
    readonly property bool running: controller.active && geometry !== null && !geometry.asleep
        && !(controller.settings.hideOnFullscreen !== false && geometry.fullscreen)

    function rebuild() {
        if (back.width <= 0 || back.height <= 0 || !geometry) return
        engine = Engine.create(Math.round(back.width / unit), Math.round(back.height / unit), count)
        syncGeometry()
        ++frame
    }

    function syncGeometry() {
        if (!geometry) { piles = []; return }
        if (!engine) { rebuild(); return }
        Engine.syncGeometry(engine, geometry, unit, windowDepth, groundDepth)
        piles = engine.piles
        ++geometryRevision
        ++pileFrame
    }

    function statistics() {
        return {running: running, flakes: engine ? engine.flakes.length : 0,
                banks: piles.length, frames: frame, unit: unit,
                meanFallSpeed: engine && engine.flakes.length
                    ? engine.flakes.reduce((sum, flake) => sum + flake.dy, 0) * 20 / engine.flakes.length : 0,
                snowPixels: piles.reduce((sum, pile) => sum + pile.pixels.reduce((a, b) => a + b, 0), 0)}
    }

    onGeometryChanged: syncGeometry()
    onUnitChanged: rebuild()
    onCountChanged: rebuild()
    onWindowDepthChanged: syncGeometry()
    onGroundDepthChanged: syncGeometry()
    Component.onCompleted: { controller.views[screen.name] = root; rebuild() }
    Component.onDestruction: delete controller.views[screen.name]

    Connections {
        target: root.controller
        function onClearSnow() {
            if (root.engine) { Engine.clear(root.engine); ++root.pileFrame }
        }
    }

    Timer {
        interval: 50
        running: root.running && root.engine !== null
        repeat: true
        onTriggered: {
            Engine.tick(root.engine, root.controller.settings.wind !== false)
            ++root.frame
            if (root.engine.dirty) {
                ++root.pileFrame
                root.engine.dirty = false
            }
        }
    }

    PanelWindow {
        id: back
        screen: root.screen
        visible: root.running
        color: "transparent"
        mask: Region {}
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "omasnow-falling"
        WlrLayershell.layer: WlrLayer.Bottom
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
        onWidthChanged: root.rebuild()
        onHeightChanged: root.rebuild()

        Repeater {
            model: root.engine ? root.count : 0
            Image {
                required property int index
                readonly property var flake: {
                    root.frame
                    return root.engine ? (root.engine.flakes[index] || root.emptyFlake) : root.emptyFlake
                }
                readonly property int flakeType: { root.frame; return flake.type }
                x: { root.frame; return flake.x * root.unit }
                y: { root.frame; return flake.y * root.unit }
                width: Flakes.masks[flakeType][0].length * root.unit
                height: Flakes.masks[flakeType].length * root.unit
                source: Qt.resolvedUrl("assets/flake" + flakeType + ".png")
                smooth: false
                mipmap: false
                antialiasing: false
            }
        }

        Repeater {
            model: root.piles.length
            SnowBank {
                required property int index
                pile: root.piles[index] || root.emptyPile
                visible: !!pile && pile.width > 0 && pile.ground
                unit: root.unit
                geometryRevision: root.geometryRevision
                revision: { root.pileFrame; return pile ? pile.revision : 0 }
            }
        }
    }

    PanelWindow {
        screen: root.screen
        visible: root.running
        color: "transparent"
        mask: Region {}
        anchors { top: true; bottom: true; left: true; right: true }
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "omasnow-settled"
        WlrLayershell.layer: WlrLayer.Top
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

        Repeater {
            model: root.piles.length
            SnowBank {
                required property int index
                pile: root.piles[index] || root.emptyPile
                visible: !!pile && pile.width > 0 && !pile.ground
                unit: root.unit
                geometryRevision: root.geometryRevision
                revision: { root.pileFrame; return pile ? pile.revision : 0 }
                windows: { root.geometryRevision; return root.engine ? root.engine.windows : [] }
                reserved: root.geometry ? root.geometry.reserved : []
                monitorWidth: back.width
                monitorHeight: back.height
            }
        }
    }
}
