import json
from pathlib import Path
import socket
import tempfile
import threading
import unittest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import request, scene


def monitor(**overrides):
    return dict(dict(id=0, name='DP-1', x=0, y=0, width=3840, height=2160,
                     scale=1.5, activeWorkspace={'id': 1}), **overrides)


def window(**overrides):
    return dict(dict(address='0x123', mapped=True, hidden=False, at=[30, 100],
                     size=[800, 600], workspace={'id': 1}, monitor=0), **overrides)


class GeometryTests(unittest.TestCase):
    def test_fractional_scale_does_not_scale_window_positions_twice(self):
        out = scene([monitor()], [window()])['DP-1']
        self.assertEqual((out['width'], out['height']), (2560, 1440))
        self.assertEqual(out['surfaces'][0], {'id': '0x123:1', 'x': 30, 'y': 100, 'width': 800})

    def test_rotated_monitor_with_negative_origin(self):
        out = scene([monitor(x=-1440, transform=1)], [window(at=[-1300, 50])])['DP-1']
        self.assertEqual((out['width'], out['height']), (1440, 2560))
        self.assertEqual(out['surfaces'][0]['x'], 140)

    def test_hidden_unmapped_and_inactive_windows_are_excluded(self):
        clients = [window(hidden=True), window(mapped=False), window(visible=False),
                   window(workspace={'id': 9}), window(size=[0, 50])]
        self.assertEqual(scene([monitor()], clients)['DP-1']['surfaces'], [])

    def test_special_and_pinned_windows_are_visible(self):
        clients = [window(workspace={'id': -99}), window(pinned=True, workspace={'id': 9})]
        self.assertEqual(len(scene([monitor(specialWorkspace={'id': -99})], clients)['DP-1']['surfaces']), 2)

    def test_window_spanning_monitors_is_clipped_locally(self):
        monitors = [monitor(), monitor(id=1, name='DP-2', x=2560, activeWorkspace={'id': 2})]
        out = scene(monitors, [window(at=[2500, 100])])
        self.assertEqual(out['DP-1']['surfaces'][0]['width'], 60)
        self.assertEqual(out['DP-2']['surfaces'][0]['x'], 0)
        self.assertEqual(out['DP-2']['surfaces'][0]['width'], 740)

    def test_fullscreen_and_dpms_are_per_monitor(self):
        out = scene([monitor(dpmsStatus=False)], [window(fullscreen=2)])['DP-1']
        self.assertTrue(out['fullscreen'])
        self.assertTrue(out['asleep'])
        self.assertFalse(scene([monitor()], [window(fullscreen=1)])['DP-1']['fullscreen'])

    def test_ipc_reads_fragmented_json_until_eof(self):
        with tempfile.TemporaryDirectory() as directory:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(str(Path(directory) / '.socket.sock'))
                server.listen(1)
                received = []
                def respond():
                    with server.accept()[0] as client:
                        received.append(client.recv(64))
                        client.sendall(b'[{"name":')
                        client.sendall(b'"DP-1"}]')
                thread = threading.Thread(target=respond)
                thread.start()
                self.assertEqual(request(Path(directory), 'monitors'), [{'name': 'DP-1'}])
                thread.join(2)
                self.assertEqual(received, [b'j/monitors'])


if __name__ == '__main__':
    unittest.main()
