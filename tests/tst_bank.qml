import QtQuick
import QtTest
import ".."
import "../SnowEngine.js" as Engine

Rectangle {
    id: scene
    width: 120
    height: 80
    color: "#203040"
    property var snow: Engine.makePile({id: "test", x: 0, y: 60, width: 120}, 50)
    property var snapshot: ({windows: []})
    property int geometryRevision: 0

    SnowBank {
        id: bank
        pile: scene.snow
        unit: 1
        geometryRevision: scene.geometryRevision
        windows: { scene.geometryRevision; return scene.snapshot.windows }
    }

    TestCase {
        name: "SnowBank"
        when: windowShown
        function init() {
            scene.snow.x = 0
            scene.snow.y = 60
            scene.snow.pixels.fill(0)
            scene.snow.heights.fill(0)
            scene.snapshot.windows = []
            ++scene.geometryRevision
        }

        function deposit() {
            Engine.stamp(scene.snow, 0, 10, 47)
            bank.requestPaint()
            tryComparePixel(10, 47, 250)
        }

        function tryComparePixel(x, y, green) {
            tryVerify(() => grabImage(bank).green(x, y) === green)
        }

        function test_bitmap_visible_at_bottom_of_bank() {
            deposit()
            const capture = grabImage(bank)
            compare(capture.alpha(10, 47), 255)
            compare(capture.red(10, 47), 255)
            compare(capture.green(10, 47), 250)
            compare(capture.green(11, 47), 48)
            compare(capture.green(11, 48), 250)
            compare(capture.green(10, 49), 250)
        }

        function test_floating_window_occludes_existing_snow_after_geometry_changes() {
            deposit()
            scene.snapshot.windows = [{x: 9, y: 55, width: 8, height: 10}]
            ++scene.geometryRevision
            tryComparePixel(10, 47, 48)
            scene.snapshot.windows = []
            ++scene.geometryRevision
            tryComparePixel(10, 47, 250)
        }

        function test_bank_position_tracks_mutated_geometry() {
            scene.snow.x = 20
            scene.snow.y = 70
            ++scene.geometryRevision
            compare(bank.x, 20)
            compare(bank.y, 20)
        }
    }
}
