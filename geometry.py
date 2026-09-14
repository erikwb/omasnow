#!/usr/bin/env python3
"""Stream monitor-local snow surfaces from Hyprland IPC. No third-party modules."""
import argparse
import json
import os
from pathlib import Path
import select
import socket
import sys
import time


def request(directory, command):
    # Hyprland handles this synchronously: connect, send immediately, read EOF,
    # and close. Never leave an idle connection on the control socket.
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(1)
        connection.connect(str(directory / '.socket.sock'))
        connection.sendall(('j/' + command).encode())
        chunks = []
        size = 0
        while chunk := connection.recv(65536):
            chunks.append(chunk)
            size += len(chunk)
            if size > 16 * 1024 * 1024:
                raise ValueError('Hyprland response exceeds 16 MiB')
    return json.loads(b''.join(chunks))


def scene(monitors, clients):
    """Hyprland at/size and monitor x/y are already in logical coordinates."""
    active = {m.get('activeWorkspace', {}).get('id') for m in monitors}
    active.update(m.get('specialWorkspace', {}).get('id') for m in monitors
                  if m.get('specialWorkspace', {}).get('id', 0) != 0)
    windows = [c for c in clients if c.get('mapped', True) and not c.get('hidden', False)
               and c.get('visible', True) and (c.get('pinned') or c.get('workspace', {}).get('id') in active)
               and len(c.get('at', [])) == 2 and len(c.get('size', [])) == 2
               and min(c['size']) > 0]
    result = {}
    for monitor in monitors:
        if monitor.get('disabled') or monitor.get('mirrorOf', 'none') not in ('none', '', None):
            continue
        scale = max(0.25, monitor.get('scale', 1))
        pw, ph = monitor['width'], monitor['height']
        if monitor.get('transform', 0) % 2:
            pw, ph = ph, pw
        width, height = pw / scale, ph / scale
        mx, my = monitor['x'], monitor['y']
        rects, surfaces = [], []
        fullscreen = False
        for client in windows:
            x, y = client['at'][0] - mx, client['at'][1] - my
            w, h = client['size']
            if x >= width or x + w <= 0 or y >= height or y + h <= 0:
                continue
            rects.append({'x': x, 'y': y, 'width': w, 'height': h})
            if client.get('fullscreen', 0) == 2 and client.get('monitor') == monitor['id']:
                fullscreen = True
            if y > 0:
                surfaces.append({'id': client['address'] + ':' + str(client.get('workspace', {}).get('id')),
                                 'x': max(0, x), 'y': y, 'width': min(width, x + w) - max(0, x)})
        result[monitor['name']] = {
            'width': width, 'height': height, 'scale': scale,
            'workspace': monitor.get('activeWorkspace', {}).get('id'),
            'asleep': not monitor.get('dpmsStatus', True), 'fullscreen': fullscreen,
            'surfaces': surfaces, 'windows': rects,
            'reserved': monitor.get('reserved', [0, 0, 0, 0]),
        }
    return result


def snapshot(directory):
    return scene(request(directory, 'monitors'), request(directory, 'clients'))


def stream(directory, interval):
    previous = None
    while True:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as events:
                events.connect(str(directory / '.socket2.sock'))
                events.setblocking(False)
                deadline = 0.0
                last_query = 0.0
                while True:
                    now = time.monotonic()
                    if now >= deadline:
                        payload = json.dumps({'monitors': snapshot(directory)}, separators=(',', ':'))
                        if payload != previous:
                            print(payload, flush=True)
                            previous = payload
                        last_query = time.monotonic()
                        deadline = last_query + interval
                    ready, _, _ = select.select([events], [], [], max(0, deadline - time.monotonic()))
                    if ready:
                        if not events.recv(65536):
                            raise ConnectionError('Hyprland event socket closed')
                        # Events trigger a refresh, bounded to 10 Hz even during
                        # event storms. Polling also catches drag/resize frames
                        # that Hyprland does not announce over socket2.
                        deadline = min(deadline, max(time.monotonic(), last_query + 0.1))
        except (OSError, ValueError, KeyError, TypeError) as error:
            payload = json.dumps({'monitors': {}, 'error': str(error)}, separators=(',', ':'))
            if payload != previous:
                print(payload, flush=True)
                previous = payload
            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true', help='print one geometry snapshot')
    parser.add_argument('--interval', type=float, default=0.25, help='geometry polling interval (seconds)')
    args = parser.parse_args()
    signature = os.environ.get('HYPRLAND_INSTANCE_SIGNATURE')
    runtime = os.environ.get('XDG_RUNTIME_DIR')
    if not signature or not runtime:
        parser.exit(1, 'omasnow: run inside a Hyprland session (missing IPC environment)\n')
    directory = Path(runtime) / 'hypr' / signature
    if args.once:
        print(json.dumps({'monitors': snapshot(directory)}, separators=(',', ':')))
    else:
        stream(directory, max(0.1, args.interval))


if __name__ == '__main__':
    try:
        main()
    except (BrokenPipeError, KeyboardInterrupt):
        # Quickshell closed the stream: exit without leaving a helper behind.
        sys.exit(0)
