const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual IPC handler without starting desktop surfaces or the
// geometry helper. Only its QML parameter and return type annotations differ
// from a JavaScript function.
const source = fs.readFileSync(path.join(__dirname, '..', 'Snow.qml'), 'utf8');
const handler = source.match(/function configure\(json: string\): string \{([\s\S]*?)\n        \}/);
assert.ok(handler, 'Snow.qml configure handler must be present');

function service(saveResult = true) {
    const writes = [];
    const root = {
        pluginId: 'io.weirdware.omasnow',
        settings: {id: 'io.weirdware.omasnow', flakes: 100, wind: true},
        shell: {updateEntryInline(id, settings) {
            writes.push({id, settings: JSON.parse(JSON.stringify(settings))});
            return saveResult;
        }},
    };
    const configure = vm.runInNewContext(`(function(json) {${handler[1]}\n})`, {root});
    return {root, writes, configure};
}

test('unchanged settings and an empty update succeed without writing', () => {
    const {root, writes, configure} = service(false);
    const previous = root.settings;
    assert.equal(configure('{"wind":true,"flakes":100}'), 'ok');
    assert.equal(configure('{}'), 'ok');
    assert.equal(writes.length, 0);
    assert.equal(root.settings, previous);
});

test('changed settings save once and retain other options', () => {
    const {root, writes, configure} = service();
    assert.equal(configure('{"flakes":250,"fps":60}'), 'ok');
    assert.deepEqual(writes, [{id: root.pluginId, settings: {id: root.pluginId, flakes: 250, wind: true, fps: 60}}]);
    assert.equal(root.settings.flakes, 250);
    assert.equal(root.settings.fps, 60);
    assert.equal(configure('{"flakes":250,"fps":60}'), 'ok');
    assert.equal(writes.length, 1);
});

test('a refused change reports failure and preserves the current settings', () => {
    const {root, writes, configure} = service(false);
    const previous = root.settings;
    assert.equal(configure('{"flakes":250}'), 'could not save settings');
    assert.equal(writes.length, 1);
    assert.equal(root.settings, previous);
});

test('no-op detection does not bypass validation or partially apply an invalid update', () => {
    const {root, writes, configure} = service();
    const previous = root.settings;
    for (const input of ['null', '[]', '{', '{"flakes":"100"}', '{"flakes":2001}',
                         '{"fps":19}', '{"fps":61}', '{"fps":30.5}', '{"wind":1}', '{"flakes":250,"unknown":true}']) {
        assert.notEqual(configure(input), 'ok', input);
    }
    assert.equal(writes.length, 0);
    assert.equal(root.settings, previous);
});
