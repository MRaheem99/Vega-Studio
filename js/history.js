// js/history.js
class History {
    constructor(limit = 200) {
        this.stack = [];
        this.cursor = -1;
        this.limit = limit;
        this.listeners = [];
    }

    push(cmd) {
        if (!cmd || typeof cmd.do !== 'function' || typeof cmd.undo !== 'function') {
            console.warn('History.push: invalid command', cmd);
            return;
        }

        if (this.cursor < this.stack.length - 1) {
            this.stack.splice(this.cursor + 1);
        }

        if (cmd.coalesceKey && this.cursor >= 0) {
            const prev = this.stack[this.cursor];
            if (prev && prev.coalesceKey === cmd.coalesceKey) {
                const merged = {
                    label: cmd.label || prev.label,
                    coalesceKey: cmd.coalesceKey,
                    do: cmd.do,
                    undo: prev.undo,
                };
                this.stack[this.cursor] = merged;
                merged.do();
                this._emit();
                return;
            }
        }

        cmd.do();
        this.stack.push(cmd);
        if (this.stack.length > this.limit) {
            this.stack.shift();
        } else {
            this.cursor++;
        }
        this._emit();
    }

    commit() {
        this._lastCoalesceKey = null;
    }

    undo() {
        if (this.cursor < 0) return false;
        const cmd = this.stack[this.cursor];
        try {
            cmd.undo();
        } catch (e) {
            console.error('Undo failed:', e);
        }
        this.cursor--;
        this._emit();
        return true;
    }

    redo() {
        if (this.cursor >= this.stack.length - 1) return false;
        this.cursor++;
        const cmd = this.stack[this.cursor];
        try {
            cmd.do();
        } catch (e) {
            console.error('Redo failed:', e);
        }
        this._emit();
        return true;
    }

    canUndo() { return this.cursor >= 0; }
    canRedo() { return this.cursor < this.stack.length - 1; }

    clear() {
        this.stack = [];
        this.cursor = -1;
        this._emit();
    }

    subscribe(fn) {
        if (typeof fn === 'function') this.listeners.push(fn);
    }
    _emit() {
        this.listeners.forEach(fn => {
            try { fn(this); } catch (_) {}
        });
    }
}

window.History = History;