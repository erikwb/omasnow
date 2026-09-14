const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const masks = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'Flakes.js'), 'utf8'), masks);
const engine = {Flakes: masks};
vm.runInNewContext(fs.readFileSync(path.join(root, 'SnowEngine.js'), 'utf8').replace(/^\.import.*\n/, ''), engine);

function state() {
    const s = engine.create(800, 600, 100);
    engine.syncGeometry(s, {workspace: 1, windows: [], surfaces: [{id: 'window', x: 100, y: 200, width: 300}]}, 1, 15, 50);
    engine.clear(s);
    return s;
}

test('flakes retain native Xsnow dimensions and cadence speeds', () => {
    const s = state();
    assert.equal(s.flakes.length, 100);
    assert.deepEqual(Array.from(masks.masks, rows => rows.length), [3, 8, 8, 8, 8, 8, 3]);
    for (const flake of s.flakes) {
        assert.ok(flake.dy >= 1 && flake.dy <= 11);
        assert.ok(flake.y < 60);
    }
});

test('fast flakes settle on the first crossed window, not the ground', () => {
    const s = state();
    assert.equal(engine.land(s, {type: 0, x: 150, y: 190}, 150, 210), true);
    assert.ok(s.piles[0].pixels.some(Boolean));
    assert.ok(!s.piles[1].pixels.some(Boolean));
});

test('window interiors block hidden ledges', () => {
    const s = state();
    s.windows = [{x: 100, y: 180, width: 300, height: 100}];
    assert.equal(engine.land(s, {type: 0, x: 150, y: 190}, 150, 210), false);
});

test('flakes keep falling behind windows', () => {
    const s = state();
    s.windows = [{x: 0, y: 0, width: 800, height: 600}];
    const flake = s.flakes[0];
    Object.assign(flake, {type: 0, x: 150, y: 300, dx: 0, dy: 6});
    for (let i = 0; i < 10; ++i) engine.tick(s, false);
    assert.equal(flake.y, 360);
    assert.equal(flake.type, 0);
});

test('landing on a full bank still recycles the flake immediately', () => {
    const s = state();
    const pile = s.piles[0];
    pile.pixels.fill(1);
    pile.heights.fill(pile.depth);
    const flake = s.flakes[0];
    Object.assign(flake, {type: 0, x: 150, y: 179, dx: 0, dy: 11});
    engine.tick(s, false);
    assert.ok(flake.y < 60);
    assert.equal(flake.dy, 11);
    assert.equal(s.flakes.length, 100);
});

test('moving a window carries its bank and closing removes it', () => {
    const s = state();
    engine.stamp(s.piles[0], 0, 10, 10);
    const pixels = s.piles[0].pixels;
    engine.syncGeometry(s, {workspace: 1, surfaces: [{id: 'window', x: 250, y: 300, width: 300}]}, 1, 15, 50);
    assert.equal(s.piles[0].pixels, pixels);
    assert.equal(s.piles[0].x, 250);
    engine.syncGeometry(s, {workspace: 2, surfaces: []}, 1, 15, 50);
    assert.equal(s.piles.length, 1);
    assert.equal(s.piles[0].id, 'ground:2');
});

test('snow stamps preserve the bitmap holes and stay within the depth limit', () => {
    const p = engine.makePile({id: 'w', x: 0, y: 15, width: 8}, 15);
    engine.stamp(p, 0, 0, 0);
    assert.equal(p.pixels.reduce((a, b) => a + b, 0), 5);
    assert.equal(p.pixels[1], 0);
    assert.equal(p.heights[0], 15);
    engine.stamp(p, 1, -4, -4);
    assert.equal(p.pixels.length, 120);
    assert.ok(p.heights.every(h => h <= 15));
});

for (const wind of [false, true]) test(`ten minutes keeps snowfall steady with wind ${wind ? 'on' : 'off'}`, () => {
    const s = state();
    const initialSpeeds = Array.from(s.flakes, flake => flake.dy);
    for (let i = 0; i < 12000; ++i) engine.tick(s, wind);
    assert.equal(s.flakes.length, 100);
    assert.deepEqual(Array.from(s.flakes, flake => flake.dy), initialSpeeds);
    for (const flake of s.flakes) {
        assert.ok(Number.isFinite(flake.x) && Number.isFinite(flake.y));
        assert.ok(Math.abs(flake.dx) <= 52);
    }
    assert.ok(s.piles[0].heights.every(h => h <= 15));
    engine.clear(s);
    assert.ok(s.piles.every(p => p.pixels.every(n => n === 0)));
});
