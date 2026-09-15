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
test('sixty fps steps preserve the 50 ms simulation speed', () => {
    const s = state();
    const flake = s.flakes[0];
    Object.assign(flake, {type: 0, x: 150, y: 300, dx: 0, dy: 6});
    for (let i = 0; i < 3; ++i) engine.tick(s, false, 1 / 3);
    assert.equal(flake.y, 306);
});

test('a landing marks only its changed bank region for repaint', () => {
    const pile = engine.makePile({id: 'ground', x: 0, y: 50, width: 800, ground: true}, 50);
    Object.assign(pile, {dirtyLeft: pile.width, dirtyTop: pile.depth, dirtyRight: 0, dirtyBottom: 0});
    engine.stamp(pile, 0, 400, 47);
    assert.equal(pile.dirtyLeft, 400);
    assert.equal(pile.dirtyTop, 47);
    assert.ok(pile.dirtyRight - pile.dirtyLeft <= masks.masks[0][0].length);
    assert.ok(pile.dirtyBottom - pile.dirtyTop <= masks.masks[0].length);
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

function fillBanks(s) {
    for (const pile of s.piles) {
        pile.pixels.fill(1);
        pile.heights.fill(pile.depth);
    }
}

function pixels(pile) { return pile.pixels.reduce((sum, pixel) => sum + pixel, 0); }

test('wind lifts actual bank snow and keeps its collision heights accurate', () => {
    const s = state(), pile = s.piles[0];
    fillBanks(s);
    s.wind = 2;
    const before = pixels(pile), revision = pile.revision;
    s.dirty = false;
    assert.equal(engine.lift(s, pile, 50, 0), true);
    assert.ok(pixels(pile) < before);
    assert.equal(pile.revision, revision + 1);
    assert.equal(s.dirty, true);
    const flake = s.blown.find(Boolean);
    assert.ok(flake.dy < 0 && flake.dx > 0);
    assert.ok(flake.y < pile.y - pile.depth);
    for (let x = 0; x < pile.width; ++x) {
        let top = 0;
        while (top < pile.depth && !pile.pixels[top * pile.width + x]) ++top;
        assert.equal(pile.heights[x], pile.depth - top);
    }
});

test('empty, covered, calm, or capacity-limited banks never lose snow to blow-off', () => {
    const s = state(), pile = s.piles[0];
    s.wind = 2;
    assert.equal(engine.lift(s, pile, 50, 0), false);
    fillBanks(s);
    const before = pixels(pile), revision = pile.revision;
    s.windows = [{x: 0, y: 0, width: 800, height: 600}];
    assert.equal(engine.lift(s, pile, 50, 0), false);
    s.windows = [];
    s.wind = 0;
    assert.equal(engine.lift(s, pile, 50, 0), false);
    s.wind = 2;
    s.blown.fill({type: 0, x: 10, y: 10, dx: 0, dy: 0, life: 600});
    assert.equal(engine.lift(s, pile, 50, 0), false);
    assert.equal(pixels(pile), before);
    assert.equal(pile.revision, revision);
});

test('a gust erodes banks while preserving the regular snowfall pool', () => {
    const s = state();
    fillBanks(s);
    s.wind = 2;
    s.windClock = 100;
    const regular = s.flakes.slice(), speeds = Array.from(s.flakes, flake => flake.dy);
    const before = s.piles.reduce((sum, pile) => sum + pixels(pile), 0);
    engine.tick(s, true);
    assert.equal(s.blown.filter(Boolean).length, 4);
    assert.ok(s.piles.reduce((sum, pile) => sum + pixels(pile), 0) < before);
    assert.deepEqual(s.flakes, regular);
    assert.deepEqual(Array.from(s.flakes, flake => flake.dy), speeds);
});

test('blown flakes rise, fall, and settle even after wind is disabled', () => {
    const s = state(), pile = s.piles[0];
    // Leave room for a returning flake; a full bank correctly clips deposits.
    pile.pixels.fill(1, pile.width * (pile.depth - 5));
    pile.heights.fill(5);
    s.wind = 2;
    engine.lift(s, pile, 50, 0);
    const flake = s.blown.find(Boolean), startY = flake.y;
    s.flakes = [];
    engine.tick(s, false);
    assert.ok(flake.y < startY);
    assert.equal(s.wind, 0);
    const eroded = pixels(pile);
    for (let i = 0; i < 600 && s.blown.some(Boolean); ++i) engine.tick(s, false);
    assert.ok(s.blown.every(flake => flake === null));
    assert.ok(pixels(pile) > eroded, 'lifted snow settles back onto the bank');
});

test('blown flakes leave the screen or expire without replacing regular flakes', () => {
    const s = state();
    s.blown[0] = {type: 0, x: 10, y: 600, dx: 0, dy: 2, life: 600};
    s.blown[1] = {type: 0, x: 10, y: 10, dx: 0, dy: 0, life: 1};
    engine.updateBlown(s);
    assert.ok(s.blown.every(flake => flake === null));
    assert.equal(s.flakes.length, 100);
});

test('clear and workspace changes discard airborne bank snow', () => {
    const s = state();
    fillBanks(s);
    s.wind = 2;
    engine.lift(s, s.piles[0], 50, 0);
    engine.syncGeometry(s, {workspace: 2, surfaces: []}, 1, 15, 50);
    assert.ok(s.blown.every(flake => flake === null));
    fillBanks(s);
    engine.lift(s, s.piles[0], 50, 0);
    assert.ok(s.blown.some(Boolean));
    engine.clear(s);
    assert.ok(s.blown.every(flake => flake === null));
    assert.ok(s.piles.every(pile => pixels(pile) === 0));
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
    for (const flake of s.blown.filter(Boolean)) {
        assert.ok(Number.isFinite(flake.x) && Number.isFinite(flake.y));
        assert.ok(flake.life > 0 && flake.life <= 600);
    }
    engine.clear(s);
    assert.ok(s.piles.every(p => p.pixels.every(n => n === 0)));
    assert.ok(s.blown.every(flake => flake === null));
});
