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
    property int geometryRevision: 0
    property int pileFrame: 0

    SnowBank {
        id: bank
        pile: scene.snow
        unit: 1
        geometryRevision: scene.geometryRevision
        revision: scene.pileFrame
    }

    SnowBanks { id: banks }

    TestCase {
        name: "SnowBank"
        when: windowShown
        function init() {
            scene.snow.x = 0
            scene.snow.y = 60
            scene.snow.pixels.fill(0)
            scene.snow.heights.fill(0)
            ++scene.geometryRevision
            banks.piles = []
        }

        function deposit() {
            Engine.stamp(scene.snow, 0, 10, 47)
            ++scene.pileFrame
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

        function test_bank_position_tracks_mutated_geometry() {
            scene.snow.x = 20
            scene.snow.y = 70
            ++scene.geometryRevision
            compare(bank.x, 20)
            compare(bank.y, 20)
        }

        function test_entering_leaving_and_reordering_windows_preserves_bank_canvases() {
            const first = Engine.makePile({id: "first", x: 0, y: 30, width: 40}, 15)
            const second = Engine.makePile({id: "second", x: 40, y: 30, width: 40}, 15)
            const ground = Engine.makePile({id: "ground", x: 0, y: 80, width: 120, ground: true}, 50)
            banks.piles = [first, ground]
            const firstView = banks.views.first, groundView = banks.views.ground
            banks.piles = [second, first, ground]
            compare(banks.views.first, firstView)
            compare(banks.views.ground, groundView)
            const secondView = banks.views.second
            banks.piles = [ground, second, first]
            compare(banks.views.first, firstView)
            compare(banks.views.ground, groundView)
            compare(banks.views.second, secondView)
            banks.piles = [ground, first]
            compare(banks.views.first, firstView)
            compare(banks.views.ground, groundView)
            verify(banks.views.second === undefined)
            compare(banks.views.first.pile, first)
            compare(banks.views.ground.pile, ground)
        }
    }
}
