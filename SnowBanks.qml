import QtQuick

Item {
    id: root
    property var piles: []
    property real unit: 1
    property int revision: 0
    property int geometryRevision: 0
    property var reserved: []
    property real monitorWidth: 0
    property real monitorHeight: 0
    property var views: ({})
    property bool initialized: false

    function sync() {
        const next = {}
        for (const pile of piles) {
            const view = views[pile.id] || bank.createObject(root, {pile: pile})
            view.pile = pile
            next[pile.id] = view
        }
        for (const id of Object.keys(views))
            if (!next[id]) views[id].destroy()
        views = next
    }

    onPilesChanged: if (initialized) sync()
    Component.onCompleted: { initialized = true; sync() }

    // A list-position Repeater reassigns existing canvases when a window enters
    // or leaves the monitor, briefly blanking unrelated banks (even the ground).
    // Retain each canvas by bank ID, including its already uploaded texture.
    Component {
        id: bank
        SnowBank {
            unit: root.unit
            geometryRevision: root.geometryRevision
            revision: { root.revision; return pile ? pile.revision : 0 }
            reserved: pile && !pile.ground ? root.reserved : []
            monitorWidth: root.monitorWidth
            monitorHeight: root.monitorHeight
        }
    }
}
