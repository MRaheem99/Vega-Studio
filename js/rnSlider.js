(function (global) {
    class RNSlider {
        constructor(canvasSelector, options = {}) {
      
            this.canvas = typeof canvasSelector === 'string'
            ? document.querySelector(canvasSelector)
            : canvasSelector;
            if (!this.canvas) throw new Error(`Canvas not found: ${canvasSelector}`);

            this.options = {
                label: options.label || 'Value',
                min: options.min ?? 0,
                max: options.max ?? 100,
                value: options.value ?? ((options.min ?? 0) + (options.max ?? 100)) / 2,
                step: options.step ?? 0.1,
                orientation: options.orientation || 'vertical',
                width: options.width ?? 80,
                height: options.height ?? 300,
                fitToParent: options.fitToParent ?? false,
                theme: {
                    bg: options.theme?.bg || ['#0d0d0d', '#161616'],
                    rail: options.theme?.rail || ['#4f5c63', '#394147'],
                    handle: options.theme?.handle || ['#555555', '#8c8c8c'],
                    accent: options.theme?.accent || '#cccccc',
                    text: options.theme?.text || '#666666',
                },
                fontSize: options.fontSize ?? 10,
                handleSize: {
                    width: options.handleSize?.width ?? (options.orientation === 'horizontal' ? 24 : 40),
                    height: options.handleSize?.height ?? (options.orientation === 'horizontal' ? 40 : 24),
                },
                railThickness: options.railThickness ?? 6,
                markerCount: options.markerCount ?? 20,
                onChange: options.onChange || (() => {}),
            };

            this.canvas.className = 'slider-canvas';
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            this.isDragging = false;
            this.dragOffsetX = 0;
            this.dragOffsetY = 0;

            this.render();
            this.addEventListeners();

            if (this.options.fitToParent && typeof ResizeObserver !== 'undefined') {
                const parent = this.canvas.parentElement;
                if (parent) {
                    this._ro = new ResizeObserver(() => {
                        if (this._roRaf) return;
                        this._roRaf = requestAnimationFrame(() => {
                            this._roRaf = null;
                            this.resize();
                        });
                    });
                    this._ro.observe(parent);
                }
            }
        }
    
        resize() {
            const dpr = window.devicePixelRatio || 1;

            let width  = this.options.width;
            let height = this.options.height;

            if (this.options.fitToParent && this.canvas.parentElement) {
                const parent = this.canvas.parentElement;
                const parentStyle = window.getComputedStyle(parent);
                const padX = parseFloat(parentStyle.paddingLeft || 0)
                        + parseFloat(parentStyle.paddingRight || 0);

                const parentW = Math.max(0, parent.clientWidth - padX);

                if (this.options.orientation === 'vertical') {
                    if (parentW > 0) width = Math.max(30, Math.min(parentW, 200));
                    const configuredHeight = this.options.height;
                    const parentClientH = parent.clientHeight
                        - parseFloat(parentStyle.paddingTop || 0)
                        - parseFloat(parentStyle.paddingBottom || 0);
                    if (parentClientH > 0 && parentClientH < 500) {
                        height = Math.max(60, Math.min(parentClientH, 400));
                    } else {
                        height = Math.max(60, configuredHeight);
                    }
                } else {
                    if (parentW > 0) width = Math.max(80, Math.min(parentW, 420));
                }
            }

            if (isMobile) {
                if (this.options.orientation === 'vertical') {
                    width  = Math.max(width, 45);
                    height = Math.max(height, 260);
                } else {
                    width  = Math.max(width, 200);
                    height = Math.max(height, 45);
                }
            }

            width  = Math.round(width);
            height = Math.round(height);

            if (this._lastW === width && this._lastH === height) return;
            this._lastW = width;
            this._lastH = height;

            this.canvas.style.width  = width + 'px';
            this.canvas.style.height = height + 'px';
            this.canvas.className = 'slider-canvas';
            this.canvas.width  = width * dpr;
            this.canvas.height = height * dpr;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.width  = width;
            this.height = height;
            this.render();
        }

        render() {
            const { ctx, width, height } = this;
            const {
                label,
                min,
                max,
                value,
                theme,
                fontSize,
                handleSize: baseHandleSize,
                railThickness: baseRailThickness,
                markerCount: baseMarkerCount,
                orientation,
            } = this.options;

            ctx.clearRect(0, 0, width, height);

            const mainAxis = orientation === 'vertical' ? height : width;
            const scale = Math.max(0.45, Math.min(1, mainAxis / 220));

            const handleW = Math.max(10, Math.round(baseHandleSize.width  * scale));
            const handleH = Math.max(10, Math.round(baseHandleSize.height * scale));
            const railThickness = Math.max(3, Math.round(baseRailThickness * scale));
            const fontSizeScaled = Math.max(7, Math.round(fontSize * scale));

            let markerCount = baseMarkerCount;
            if (mainAxis < 140) markerCount = Math.max(6, Math.round(baseMarkerCount * 0.5));
            if (mainAxis < 90)  markerCount = Math.max(4, Math.round(baseMarkerCount * 0.3));

            const bgGradient = ctx.createLinearGradient(0, 0, width, height);
            bgGradient.addColorStop(0, theme.bg[0]);
            bgGradient.addColorStop(1, theme.bg[1]);
            ctx.fillStyle = bgGradient;
            ctx.beginPath();
            ctx.roundRect(0, 0, width, height, 6);
            ctx.fill();

            if (orientation === 'vertical') {
                const railX = width / 2 - railThickness / 2;
                const topPad = fontSizeScaled * 2.4;
                const bottomPad = fontSizeScaled * 2.4;
                const railY = topPad;
                const railHeight = Math.max(20, height - topPad - bottomPad);

                const railGradient = ctx.createLinearGradient(railX, railY, railX, railY + railHeight);
                railGradient.addColorStop(0, theme.rail[0]);
                railGradient.addColorStop(1, theme.rail[1]);
                ctx.fillStyle = railGradient;
                ctx.fillRect(railX, railY, railThickness, railHeight);

                ctx.strokeStyle = theme.text;
                ctx.lineWidth = 1;
                const markerSpacing = railHeight / (markerCount - 1);
                const majorEvery = Math.max(2, Math.round(markerCount / 5));
                for (let i = 0; i < markerCount; i++) {
                    const y = railY + i * markerSpacing;
                    const isMajor = i % majorEvery === 0;
                    ctx.lineWidth = isMajor ? 2 : 1;
                    const len = isMajor
                        ? Math.max(4, Math.round(10 * scale))
                        : Math.max(3, Math.round(6 * scale));

                    ctx.beginPath();
                    ctx.moveTo(railX - len, y);
                    ctx.lineTo(railX, y);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(railX + railThickness, y);
                    ctx.lineTo(railX + railThickness + len, y);
                    ctx.stroke();
                }

                const normalized = (value - min) / (max - min || 1);
                const handleY = railY + railHeight * (1 - normalized) - handleH / 2;
                const handleX = railX - (handleW - railThickness) / 2;

                const handleGradient = ctx.createLinearGradient(handleX, handleY, handleX, handleY + handleH);
                handleGradient.addColorStop(0, theme.handle[0]);
                handleGradient.addColorStop(1, theme.handle[1]);
                ctx.fillStyle = handleGradient;
                ctx.beginPath();
                ctx.roundRect(handleX, handleY, handleW, handleH, 6);
                ctx.fill();

                const gloss = ctx.createLinearGradient(handleX, handleY, handleX, handleY + handleH);
                gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
                gloss.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gloss;
                ctx.beginPath();
                ctx.roundRect(handleX + 1, handleY + 1, handleW - 2, Math.max(4, handleH - 4), 4);
                ctx.fill();

                const gripLineW = Math.max(6, handleW * 0.55);
                const gripLineGap = Math.max(2, handleH * 0.12);
                const gripCx = handleX + handleW / 2;
                const gripCy = handleY + handleH / 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
                ctx.lineWidth = Math.max(1, Math.round(scale * 1.2));
                ctx.lineCap = 'round';
                for (let i = -1; i <= 1; i++) {
                    const gy = gripCy + i * gripLineGap;
                    if (gy < handleY + 3 || gy > handleY + handleH - 3) continue;
                    ctx.beginPath();
                    ctx.moveTo(gripCx - gripLineW / 2, gy);
                    ctx.lineTo(gripCx + gripLineW / 2, gy);
                    ctx.stroke();
                }

                const valueText = value.toFixed(this.getPrecision());
                if (handleH >= fontSizeScaled * 2 && handleW >= fontSizeScaled * 3) {
                    ctx.font = `${fontSizeScaled * 1.1}px Inter, 'Segoe UI', sans-serif`;
                    ctx.fillStyle = theme.accent;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(valueText, handleX + handleW / 2, handleY + handleH / 2);
                } else {
                    ctx.font = `${fontSizeScaled}px Inter, 'Segoe UI', sans-serif`;
                    ctx.fillStyle = theme.accent;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(valueText, width / 2, handleY + handleH + 2);
                }

                ctx.font = `${fontSizeScaled}px Inter, 'Segoe UI', sans-serif`;
                ctx.fillStyle = theme.text;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(label, width / 2, height - 2);

            } else {
                const labelGutter = Math.max(fontSizeScaled * 3.2, Math.round(60 * scale));
                const valueGutter = Math.max(fontSizeScaled * 2.4, Math.round(38 * scale));
                const sidePad = 6;

                const railX = labelGutter + sidePad;
                const railWidth = Math.max(20, width - labelGutter - valueGutter - sidePad * 2);
                const railY = height / 2 - railThickness / 2;

                const railGradient = ctx.createLinearGradient(railX, railY, railX + railWidth, railY);
                railGradient.addColorStop(0, theme.rail[0]);
                railGradient.addColorStop(1, theme.rail[1]);
                ctx.fillStyle = railGradient;
                ctx.fillRect(railX, railY, railWidth, railThickness);

                ctx.strokeStyle = theme.text;
                const markerSpacing = railWidth / (markerCount - 1);
                const majorEvery = Math.max(2, Math.round(markerCount / 5));
                for (let i = 0; i < markerCount; i++) {
                    const x = railX + i * markerSpacing;
                    const isMajor = i % majorEvery === 0;
                    ctx.lineWidth = isMajor ? 2 : 1;
                    const len = isMajor
                        ? Math.max(4, Math.round(10 * scale))
                        : Math.max(3, Math.round(6 * scale));

                    ctx.beginPath();
                    ctx.moveTo(x, railY - len);
                    ctx.lineTo(x, railY);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(x, railY + railThickness);
                    ctx.lineTo(x, railY + railThickness + len);
                    ctx.stroke();
                }

                const normalized = (value - min) / (max - min || 1);
                const handleX = railX + railWidth * normalized - handleW / 2;
                const handleY = railY - (handleH - railThickness) / 2;

                ctx.shadowColor = 'rgba(0,0,0,0.2)';
                ctx.shadowBlur = 6;
                const handleGradient = ctx.createLinearGradient(handleX, handleY, handleX, handleY + handleH);
                handleGradient.addColorStop(0, theme.handle[0]);
                handleGradient.addColorStop(1, theme.handle[1]);
                ctx.fillStyle = handleGradient;
                ctx.beginPath();
                ctx.roundRect(handleX, handleY, handleW, handleH, 6);
                ctx.fill();
                ctx.shadowBlur = 0;

                const gloss = ctx.createLinearGradient(handleX, handleY, handleX, handleY + handleH);
                gloss.addColorStop(0, 'rgba(255,255,255,0.4)');
                gloss.addColorStop(1, 'rgba(0,0,0,0.05)');
                ctx.fillStyle = gloss;
                ctx.beginPath();
                ctx.roundRect(handleX + 1, handleY + 1, handleW - 2, Math.max(3, handleH - 4), 4);
                ctx.fill();

                const gripLineW = Math.max(6, handleW * 0.55);
                const gripLineGap = Math.max(2, handleH * 0.22);
                const gripCx = handleX + handleW / 2;
                const gripCy = handleY + handleH / 2;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = Math.max(1, Math.round(scale * 1.2));
                ctx.lineCap = 'round';
                for (let i = -1; i <= 1; i++) {
                    const gy = gripCy + i * gripLineGap;
                    if (gy < handleY + 3 || gy > handleY + handleH - 3) continue;
                    ctx.beginPath();
                    ctx.moveTo(gripCx - gripLineW / 2, gy);
                    ctx.lineTo(gripCx + gripLineW / 2, gy);
                    ctx.stroke();
                }

                const valueText = value.toFixed(this.getPrecision());
                const fitsInHandle = handleW >= fontSizeScaled * 3.2;
                if (fitsInHandle) {
                    ctx.font = `${fontSizeScaled * 1.05}px Inter, 'Segoe UI', sans-serif`;
                    ctx.fillStyle = theme.accent;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(valueText, handleX + handleW / 2, handleY + handleH / 2);
                } else {
                    ctx.font = `${fontSizeScaled}px Inter, 'Segoe UI', sans-serif`;
                    ctx.fillStyle = theme.accent;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(valueText, railX + railWidth + 4, height / 2);
                }

                ctx.font = `${fontSizeScaled}px Inter, 'Segoe UI', sans-serif`;
                ctx.fillStyle = theme.text;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, 6, height / 2);
            }
        }

        addEventListeners() {
            const canvas = this.canvas;
            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const p = e.touches ? e.touches[0] : e;
                return {
                    x: p.clientX - rect.left,
                    y: p.clientY - rect.top
                };
            };

            const startDrag = (e) => {
                const { x, y } = getPos(e);
                if (!this.isHandleClicked(x, y)) return;
                this.canvas.style.cursor = 'pointer';
            
                e.preventDefault();
                this.isDragging = true;

                if (this.options.orientation === 'vertical') {
                    this.dragOffsetY = y - this.getHandleCenterY();
                } else {
                    this.dragOffsetX = x - this.getHandleCenterX();
                }
            };

            const moveDrag = (e) => {
                if (!this.isDragging) return;
                e.preventDefault();
            
                const { x, y } = getPos(e);
            
                if (this.options.orientation === 'vertical') {
                    this.updateValueFromY(y - this.dragOffsetY);
                } else {
                    this.updateValueFromX(x - this.dragOffsetX);
                }
            };

            const endDrag = () => {
                this.isDragging = false;
                this.canvas.style.cursor = 'default';
            };

            canvas.addEventListener('mousedown', startDrag);
            window.addEventListener('mousemove', moveDrag);
            window.addEventListener('mouseup', endDrag);
            canvas.addEventListener('touchstart', startDrag, { passive: false });
            window.addEventListener('touchmove', moveDrag, { passive: false });
            window.addEventListener('touchend', endDrag);
        }

        isHandleClicked(x, y) {
            const cx = this.getHandleCenterX();
            const cy = this.getHandleCenterY();
            const hitPadding = isMobile ? 18 : 10;
        
            return (
                Math.abs(x - cx) <= (this.options.handleSize.width / 2 + hitPadding) &&
                Math.abs(y - cy) <= (this.options.handleSize.height / 2 + hitPadding)
            );
        }

        getHandleCenterX() {
            const { orientation, min, max, value, fontSize } = this.options;
            const W = this.width;
            const H = this.height;

            if (orientation === 'vertical') {
                return W / 2;
            }

            const mainAxis = W;
            const scale = Math.max(0.45, Math.min(1, mainAxis / 220));
            const fontSizeScaled = Math.max(7, Math.round(fontSize * scale));
            const labelGutter = Math.max(fontSizeScaled * 3.2, Math.round(60 * scale));
            const valueGutter = Math.max(fontSizeScaled * 2.4, Math.round(38 * scale));
            const sidePad = 6;
            const railX = labelGutter + sidePad;
            const railWidth = Math.max(20, W - labelGutter - valueGutter - sidePad * 2);

            const normalized = (value - min) / ((max - min) || 1);
            return railX + railWidth * normalized;
        }

        getHandleCenterY() {
            const { orientation, min, max, value, fontSize } = this.options;
            const W = this.width;
            const H = this.height;

            if (orientation === 'horizontal') {
                return H / 2;
            }

            const mainAxis = H;
            const scale = Math.max(0.45, Math.min(1, mainAxis / 220));
            const fontSizeScaled = Math.max(7, Math.round(fontSize * scale));
            const topPad = fontSizeScaled * 2.4;
            const bottomPad = fontSizeScaled * 2.4;
            const railY = topPad;
            const railHeight = Math.max(20, H - topPad - bottomPad);

            const normalized = (value - min) / ((max - min) || 1);
            return railY + railHeight * (1 - normalized);
        }

        updateValueFromY(y) {
            const { min, max, step, fontSize } = this.options;
            const H = this.height;
            const mainAxis = H;
            const scale = Math.max(0.45, Math.min(1, mainAxis / 220));
            const fontSizeScaled = Math.max(7, Math.round(fontSize * scale));
            const topPad = fontSizeScaled * 2.4;
            const bottomPad = fontSizeScaled * 2.4;
            const railY = topPad;
            const railHeight = Math.max(20, H - topPad - bottomPad);

            const clamped = Math.max(railY, Math.min(railY + railHeight, y));
            const normalized = 1 - (clamped - railY) / railHeight;
            let value = min + normalized * (max - min);
            if (step) value = parseFloat((Math.round(value / step) * step).toFixed(this.getPrecision()));

            value = Math.max(min, Math.min(max, value));
            this.options.value = value;
            this.options.onChange(value);
            this.render();
        }

        updateValueFromX(x) {
            const { min, max, step, fontSize } = this.options;
            const W = this.width;
            const mainAxis = W;
            const scale = Math.max(0.45, Math.min(1, mainAxis / 220));
            const fontSizeScaled = Math.max(7, Math.round(fontSize * scale));
            const labelGutter = Math.max(fontSizeScaled * 3.2, Math.round(60 * scale));
            const valueGutter = Math.max(fontSizeScaled * 2.4, Math.round(38 * scale));
            const sidePad = 6;
            const railX = labelGutter + sidePad;
            const railWidth = Math.max(20, W - labelGutter - valueGutter - sidePad * 2);

            const clamped = Math.max(railX, Math.min(railX + railWidth, x));
            const normalized = (clamped - railX) / railWidth;
            let value = min + normalized * (max - min);
            if (step) value = parseFloat((Math.round(value / step) * step).toFixed(this.getPrecision()));

            value = Math.max(min, Math.min(max, value));
            this.options.value = value;
            this.options.onChange(value);
            this.render();
        }
    
        setValue(value) {
            this.options.value = Math.max(this.options.min, Math.min(this.options.max, value));
            this.render();
            this.options.onChange(this.options.value);
        }
    
        getValue() {
            return this.options.value;
        }
    
        destroy() {
            if (this._ro) {
                try { this._ro.disconnect(); } catch (_) {}
                this._ro = null;
            }
            if (this._roRaf) {
                cancelAnimationFrame(this._roRaf);
                this._roRaf = null;
            }
        }
        getPrecision() {
            const step = this.options.step;
            if (!step || step >= 1) return 0;
            const s = step.toString();
            return s.includes('.') ? s.split('.')[1].length : 0;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RNSlider;
    } else {
        global.RNSlider = RNSlider;
    }
})(typeof window !== 'undefined' ? window : global);
