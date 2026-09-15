.import "Flakes.js" as Flakes

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Erik Bourget
// Vintage Xsnow movement parameters and bitmap snow deposits. Simulation time
// is measured in 50 ms steps, so render cadence can change without affecting
// falling speed; the host converts to logical Wayland coordinates for display.
function randomInt(n) { return Math.floor(Math.random() * Math.max(1, n)); }
function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }

function spawn(state, flake) {
    flake.type = randomInt(7);
    flake.x = randomInt(state.width - Flakes.masks[flake.type][0].length);
    flake.y = randomInt(state.height / 10);
    if (state.wind) {
        flake.x = state.direction > 0 ? randomInt(state.width / 3)
                                    : state.width - randomInt(state.width / 3);
        flake.y = randomInt(state.height);
    }
    // Keep the pool's speed mix steady across landings and screen exits.
    // Rerolling here replaces fast flakes more often, gradually filling the
    // pool with slow flakes and making sustained snowfall peter out.
    if (flake.dy === undefined) flake.dy = randomInt(11) + 1;
    flake.dx = randomInt(Math.floor(flake.dy / 4) + 1) * (Math.random() > 0.5 ? 1 : -1);
    return flake;
}

function create(width, height, count) {
    const state = {width: width, height: height, flakes: [], piles: [], windows: [],
                   blown: new Array(128).fill(null),
                   wind: 0, windClock: 600, direction: 1, dirty: true};
    for (let i = 0; i < count; ++i) state.flakes.push(spawn(state, {}));
    return state;
}

function makePile(surface, depth) {
    const width = Math.max(1, Math.round(surface.width));
    return {id: surface.id, x: Math.round(surface.x), y: Math.round(surface.y),
            width: width, depth: depth, pixels: new Uint8Array(width * depth),
            heights: new Uint16Array(width), ground: surface.ground === true, revision: 0};
}

function stamp(pile, type, left, top) {
    const mask = Flakes.masks[type];
    let changed = false;
    for (let y = 0; y < mask.length; ++y) {
        const py = Math.round(top) + y;
        if (py < 0 || py >= pile.depth) continue;
        for (let x = 0; x < mask[y].length; ++x) {
            const px = Math.round(left) + x;
            if (px < 0 || px >= pile.width || mask[y][x] !== '.') continue;
            const index = py * pile.width + px;
            if (!pile.pixels[index]) changed = true;
            pile.pixels[index] = 1;
            pile.heights[px] = Math.max(pile.heights[px], pile.depth - py);
        }
    }
    if (changed) ++pile.revision;
    return changed;
}

function syncGeometry(state, geometry, unit, windowDepth, groundDepth) {
    if (state.workspace !== geometry.workspace) state.blown.fill(null);
    state.workspace = geometry.workspace;
    const old = {};
    state.piles.forEach(pile => { old[pile.id] = pile; });
    const surfaces = (geometry.surfaces || []).map(surface => ({
        id: surface.id, x: surface.x / unit, y: surface.y / unit, width: surface.width / unit
    }));
    surfaces.push({id: 'ground:' + geometry.workspace, x: 0, y: state.height,
                   width: state.width, ground: true});
    state.piles = surfaces.map(surface => {
        const depth = surface.ground ? groundDepth : windowDepth;
        let pile = old[surface.id];
        if (!pile || pile.width !== Math.round(surface.width) || pile.depth !== depth) {
            pile = makePile(surface, depth);
            if (surface.ground && depth > 0) {
                // Xsnow paints a sparse eight-pixel base at startup.
                for (let y = 0; y < Math.min(depth, 8); ++y)
                    for (let i = 0; i < state.flakes.length; ++i)
                        stamp(pile, randomInt(7), randomInt(pile.width), depth - y);
            }
        }
        pile.x = Math.round(surface.x);
        pile.y = Math.round(surface.y);
        return pile;
    }).filter(pile => pile.depth > 0);
    state.windows = (geometry.windows || []).map(rect => ({
        x: rect.x / unit, y: rect.y / unit, width: rect.width / unit, height: rect.height / unit
    }));
    state.dirty = true;
}

function blocked(state, x, y) {
    return state.windows.some(rect => x >= rect.x && x < rect.x + rect.width
                             && y >= rect.y && y < rect.y + rect.height);
}

function land(state, flake, nextX, nextY) {
    const mask = Flakes.masks[flake.type];
    const center = nextX + Math.floor(mask[0].length / 2);
    const oldBottom = flake.y + mask.length;
    const newBottom = nextY + mask.length;
    let hit = null;
    let hitY = Infinity;
    for (const pile of state.piles) {
        const column = Math.floor(center - pile.x);
        if (column < 0 || column >= pile.width) continue;
        const top = pile.y - pile.heights[column];
        if (oldBottom > top + 2 || newBottom < top || top >= hitY) continue;
        if (blocked(state, center, top - 1)) continue;
        hit = pile;
        hitY = top;
    }
    if (!hit) return false;
    // Keep the actual flake silhouette in the bank instead of drawing a smooth
    // curve. Let it sink two pixels, like Xsnow's two-pixel catch-region growth.
    const top = hitY - mask.length + 2 - (hit.y - hit.depth);
    state.dirty = stamp(hit, flake.type, nextX - hit.x, top) || state.dirty;
    return true;
}

function lift(state, pile, column, type) {
    const slot = state.blown.indexOf(null);
    if (slot < 0 || !state.wind || !pile.heights[column]) return false;
    const mask = Flakes.masks[type];
    const crest = pile.y - pile.heights[column];
    if (blocked(state, pile.x + column, crest - 1)) return false;
    const left = Math.max(0, column - Math.floor(mask[0].length / 2));
    let removed = false;
    // Peel the exposed skin, then recompute only the affected columns. Never
    // erase a covered bank or remove snow when the extra particle pool is full.
    for (let x = left; x < Math.min(pile.width, left + mask[0].length); ++x) {
        let row = pile.depth - pile.heights[x];
        if (row === pile.depth || blocked(state, pile.x + x, pile.y - pile.heights[x] - 1)) continue;
        for (let y = row; y < Math.min(pile.depth, row + 2); ++y) {
            const index = y * pile.width + x;
            if (pile.pixels[index]) { pile.pixels[index] = 0; removed = true; }
        }
        while (row < pile.depth && !pile.pixels[row * pile.width + x]) ++row;
        pile.heights[x] = pile.depth - row;
    }
    if (!removed) return false;
    state.blown[slot] = {type: type, x: pile.x + left, y: crest - mask.length,
                         dx: state.direction * (3 + randomInt(6)), dy: -(2 + randomInt(4)), life: 600};
    ++pile.revision;
    state.dirty = true;
    return true;
}

function updateBlown(state, step) {
    const elapsed = step === undefined ? 1 : step;
    for (let i = 0; i < state.blown.length; ++i) {
        const flake = state.blown[i];
        if (!flake) continue;
        const target = state.wind ? state.direction * (state.wind === 2 ? 12 : 6) : 0;
        flake.dx += clamp(target - flake.dx, -0.5 * elapsed, 0.5 * elapsed);
        flake.dy = Math.min(11, flake.dy + 0.35 * elapsed);
        const x = flake.x + flake.dx * elapsed, y = flake.y + flake.dy * elapsed;
        if ((flake.life -= elapsed) <= 0 || y >= state.height || x < -8 || x > state.width
            || (flake.dy > 0 && land(state, flake, x, y))) {
            state.blown[i] = null;
        } else {
            flake.x = x;
            flake.y = y;
        }
    }
}

function blowSnow(state, elapsed) {
    if (!state.wind || !state.piles.length || Math.random() >= elapsed) return;
    // Fixed work per frame, independent of bank width and normal flake count.
    for (let i = 0; i < (state.wind === 2 ? 4 : 1); ++i) {
        if (state.blown.indexOf(null) < 0) break;
        const pile = state.piles[randomInt(state.piles.length)];
        lift(state, pile, randomInt(pile.width), randomInt(7));
    }
}

function tick(state, windEnabled, step) {
    const elapsed = clamp(step === undefined ? 1 : step, 0, 2);
    if (elapsed === 0) return;
    if (!windEnabled) {
        state.wind = 0;
        state.windClock = 600;
    } else if ((state.windClock -= elapsed) <= 0) {
        if (state.wind === 0) {
            state.wind = 2;
            state.direction = Math.random() > 0.5 ? 1 : -1;
            state.windClock = 20 * (randomInt(5) + 1);
        } else if (state.wind === 2) {
            state.wind = 1;
            state.windClock = 20 * (randomInt(3) + 1);
        } else {
            state.wind = 0;
            state.windClock = 600;
        }
    }
    for (const flake of state.flakes) {
        if (state.wind && Math.random() < elapsed) {
            const change = state.wind === 2 ? randomInt(20) : randomInt(4) - 1;
            flake.dx = clamp((Math.abs(flake.dx) + change) * state.direction, -50, 50);
        }
        const x = flake.x + flake.dx * elapsed;
        const y = flake.y + flake.dy * elapsed;
        if (y >= state.height || x < -8 || x > state.width || land(state, flake, x, y)) {
            spawn(state, flake);
            continue;
        }
        flake.x = x;
        flake.y = y;
        if (Math.random() < elapsed) flake.dx += randomInt(3) * (Math.random() > 0.5 ? 1 : -1);
        if (!state.wind) flake.dx = clamp(flake.dx, -2, 2);
    }
    updateBlown(state, elapsed);
    blowSnow(state, elapsed);
}

function clear(state) {
    state.piles.forEach(pile => { pile.pixels.fill(0); pile.heights.fill(0); ++pile.revision; });
    state.blown.fill(null);
    state.dirty = true;
}
