import QtQuick

// Only the narrow snow bank uploads a texture when snow lands. Falling flakes
// use seven cached GPU textures; there is no fullscreen Canvas repaint loop.
Canvas {
    id: root
    required property var pile
    required property real unit
    property int revision: 0
    property int geometryRevision: 0
    property var reserved: []
    property real monitorWidth: 0
    property real monitorHeight: 0
    x: { geometryRevision; return pile ? pile.x * unit : 0 }
    y: { geometryRevision; return pile ? (pile.y - pile.depth) * unit : 0 }
    width: pile ? pile.width : 0
    height: pile ? pile.depth : 0
    scale: unit
    transformOrigin: Item.TopLeft
    smooth: false
    antialiasing: false
    function repaintDirty() {
        if (!pile || pile.dirtyLeft >= pile.dirtyRight || pile.dirtyTop >= pile.dirtyBottom) return
        const area = Qt.rect(pile.dirtyLeft, pile.dirtyTop,
                             pile.dirtyRight - pile.dirtyLeft, pile.dirtyBottom - pile.dirtyTop)
        pile.dirtyLeft = pile.width
        pile.dirtyTop = pile.depth
        pile.dirtyRight = 0
        pile.dirtyBottom = 0
        markDirty(area)
    }

    onRevisionChanged: repaintDirty()
    onGeometryRevisionChanged: requestPaint()
    onReservedChanged: requestPaint()
    onPileChanged: requestPaint()
    onAvailableChanged: if (available) requestPaint()
    onPaint: region => {
        if (!pile || pile.width <= 0 || pile.depth <= 0) return
        const ctx = getContext("2d")
        const area = region || Qt.rect(0, 0, pile.width, pile.depth)
        const left = Math.max(0, Math.floor(area.x))
        const top = Math.max(0, Math.floor(area.y))
        const right = Math.min(pile.width, Math.ceil(area.x + area.width))
        const bottom = Math.min(pile.depth, Math.ceil(area.y + area.height))
        ctx.clearRect(left, top, right - left, bottom - top)
        ctx.fillStyle = "#fffafa"
        for (let row = top; row < bottom; ++row) {
            let start = -1
            for (let column = left; column <= right; ++column) {
                const filled = column < right && pile.pixels[row * pile.width + column]
                if (filled && start < 0) start = column
                if (!filled && start >= 0) {
                    ctx.fillRect(start, row, column - start, 1)
                    start = -1
                }
            }
        }
        // Application windows occlude this bottom-layer surface in the
        // compositor. Only the reserved bar space needs a manual cutout.
        if (reserved.length === 4) {
            const mw = monitorWidth / unit, mh = monitorHeight / unit
            ctx.clearRect(-pile.x, -pile.y + pile.depth, reserved[0] / unit, mh)
            ctx.clearRect(-pile.x, -pile.y + pile.depth, mw, reserved[1] / unit)
            ctx.clearRect(mw - reserved[2] / unit - pile.x, -pile.y + pile.depth, reserved[2] / unit, mh)
            ctx.clearRect(-pile.x, mh - reserved[3] / unit - pile.y + pile.depth, mw, reserved[3] / unit)
        }
        pile.dirtyLeft = pile.width
        pile.dirtyTop = pile.depth
        pile.dirtyRight = 0
        pile.dirtyBottom = 0
    }
}
