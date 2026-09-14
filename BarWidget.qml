import QtQuick
import qs.Ui as Ui

Ui.BarWidget {
    id: root
    moduleName: "io.weirdware.omasnow"

    readonly property var snowService: bar?.shell?.serviceFor(moduleName) ?? null
    readonly property bool snowActive: snowService ? snowService.active : false

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    Ui.BarIconButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: "❄"
        dimmed: !root.snowActive
        interactive: root.snowService !== null
        tooltipText: root.snowActive ? "Snow on — click to turn off" : "Snow off — click to turn on"
        onPressed: mouseButton => {
            if (mouseButton === Qt.LeftButton && root.snowService)
                root.snowService.toggleSnow()
        }
    }
}
