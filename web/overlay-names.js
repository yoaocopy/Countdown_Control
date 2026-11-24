const OverlayNames = (() => {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  return root => {
    const timer = root.querySelector('.timer');
    const entries = [...root.querySelectorAll('.stage-name, .upcoming p')].map(node => {
      const span = document.createElement('span');
      node.classList.add('overlay-name');
      node.replaceChildren(span);
      return { node, span, name: '' };
    });
    let queued = false;

    function fit() {
      queued = false;
      root.style.setProperty('--overlay-timer-width', `${timer.offsetWidth}px`);
      for (const { node, span, name } of entries) {
        span.style.fontSize = '100%';
        span.textContent = name;
        const available = node.clientWidth;
        if (available <= 0) continue;
        const width = span.offsetWidth;
        if (width <= available) continue;
        const scale = Math.max(.5, Math.floor(available / width * 1000) / 1000);
        span.style.fontSize = `${scale * 100}%`;
        if (scale === .5 && span.offsetWidth > available) {
          const parts = Array.from(graphemes.segment(name), part => part.segment);
          if (parts.length > 5) span.textContent = `${parts.slice(0, 2).join('')}…${parts.slice(-3).join('')}`;
        }
      }
    }

    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(timer);
    for (const { node } of entries) observer.observe(node);
    return names => {
      entries.forEach((entry, index) => {
        const { node } = entry;
        const name = names[index];
        if (entry.name === name) return;
        entry.name = name;
        node.title = name;
        node.setAttribute('aria-label', name);
        schedule();
      });
    };
  };
})();
