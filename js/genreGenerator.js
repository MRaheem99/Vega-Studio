(function () {
    'use strict';

    function blankCell() {
        return {
            active: false,
            velocity: 1,
            probability: 1,
            ratchet: 1,
            pan: 0,
            pitch: 0,
            length: 1,
        };
    }

    function activeCell(velocity = 1) {
        const c = blankCell();
        c.active = true;
        c.velocity = velocity;
        return c;
    }

    function writeCell(grid, rowIdx, stepIdx, cell) {
        if (!grid[rowIdx]) return;
        if (stepIdx < 0 || stepIdx >= grid[rowIdx].length) return;
        grid[rowIdx][stepIdx] = cell;
    }

    function humanizeVelocity(base = 1) {
        return Math.max(0.3, Math.min(1, base + (Math.random() - 0.5) * 0.2));
    }

    function applyRoleToRow(grid, rowIdx, roleDef, steps, opts) {
        if (!roleDef) return;
        const { variationAmount = 0.15 } = opts;

        const primary = roleDef.primary || [];
        const optional = roleDef.optional || [];
        const fill = roleDef.fill || 0;

        primary.forEach(s => {
            const step = s % steps;
            if (variationAmount > 0 && Math.random() < variationAmount * 0.15) {
                return;
            }
            writeCell(grid, rowIdx, step, activeCell(humanizeVelocity(1)));
        });

        optional.forEach(s => {
            const step = s % steps;
            if (Math.random() < fill) {
                writeCell(grid, rowIdx, step, activeCell(humanizeVelocity(0.75)));
            }
        });
    }

    function generateBeat(genreId, opts = {}) {
        const steps = opts.steps || 16;
        const drumPads = opts.drumPads || [];
        const variationAmount = opts.variationAmount ?? 0.15;
        const padCount = opts.padCount || 8;

        const genre = window.Genres?.getGenre
            ? window.Genres.getGenre(genreId)
            : null;
        if (!genre) {
            console.warn('Unknown genre:', genreId);
            return buildEmptyGrid(padCount, steps);
        }

        const grid = buildEmptyGrid(padCount, steps);

        const roles = genre.roles || {};
        const roleToPad = resolveRoleToPad(roles, drumPads, opts.padIndexToRole);

        Object.keys(roles).forEach(roleName => {
            const padIdx = roleToPad[roleName];
            if (padIdx == null || padIdx < 0) return;
            if (padIdx >= padCount) return;

            applyRoleToRow(grid, padIdx, roles[roleName], steps, { variationAmount });
        });

        return grid;
    }

    function buildEmptyGrid(rows, steps) {
        const grid = new Array(rows);
        for (let r = 0; r < rows; r++) {
            grid[r] = new Array(steps);
            for (let s = 0; s < steps; s++) grid[r][s] = blankCell();
        }
        return grid;
    }

    function resolveRoleToPad(roles, drumPads, overrideMap) {
        const out = {};

        if (overrideMap && typeof overrideMap === 'object') {
            Object.keys(overrideMap).forEach(roleName => {
                if (roles[roleName]) {
                    out[roleName] = overrideMap[roleName];
                }
            });
        }

        if (Array.isArray(drumPads)) {
            drumPads.forEach((pad, i) => {
                if (!pad) return;
                const roleName = pad.role;
                if (roleName && roles[roleName] && out[roleName] == null) {
                    out[roleName] = i;
                }
            });
        }

        const defaultMap = window.Genres?.DRUM_ROLE_MAP || {};
        Object.keys(roles).forEach(roleName => {
            if (out[roleName] != null) return;
            const padIdx = defaultMap[roleName];
            if (padIndexWithinBounds(padIdx, drumPads)) {
                out[roleName] = padIdx;
            } else {
                out[roleName] = -1;
            }
        });

        return out;
    }

    function padIndexWithinBounds(padIdx, drumPads) {
        if (padIdx == null || padIdx < 0) return false;
        if (!Array.isArray(drumPads)) return true;
        return padIdx < drumPads.length;
    }

    window.GenreGenerator = {
        generateBeat,
        buildEmptyGrid,
        resolveRoleToPad,
        blankCell,
        activeCell,
    };
})();