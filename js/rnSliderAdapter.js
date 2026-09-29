function createRNSlider({
    label,
    value,
    min,
    max,
    step = 0.01,
    orientation = 'horizontal',
    width = 260,
    height = 60,
    fitToParent = false,
    onChange,
    onCommit
}) {
    const w = width ?? (orientation === 'vertical' ? 60 : 260);
    const h = height ?? (orientation === 'vertical' ? 260 : 60);

    const wrapper = document.createElement('div');
    wrapper.className = 'rn-slider-wrapper';
    const canvas = document.createElement('canvas');
    canvas.className = 'slider-canvas';
    wrapper.appendChild(canvas);

    let startValue = value;
    let dragging = false;

    const slider = new RNSlider(canvas, {
        label,
        min,
        max,
        value,
        step,
        orientation,
        width,
        height,
        fitToParent,
        onChange: v => onChange?.(v)
    });

    const onDown = () => {
        startValue = slider.getValue();
        dragging = true;
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        const endValue = slider.getValue();
        if (onCommit && startValue !== endValue) onCommit(startValue, endValue);
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    wrapper.setValue = v => slider.setValue(v);
    wrapper.getValue = () => slider.getValue();
    wrapper.destroy = () => {
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        slider.destroy?.();
    };
    wrapper.slider = slider;
    return wrapper;
}