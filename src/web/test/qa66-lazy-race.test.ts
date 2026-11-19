/** QA-66: a lazy view whose chunk lands between its first (empty) render and its effect still shows up. */
import { h, render, type ComponentType } from 'preact';
import { describe, expect, it } from 'vitest';
import { lazyView } from '../src/ui/lazy';

const tick = () => new Promise((r) => setTimeout(r, 60));

describe('QA-66 lazyView race', () => {
  it('renders once the chunk resolves before the effect runs', async () => {
    let resolve!: (c: ComponentType) => void;
    const loaded = new Promise<ComponentType>((r) => (resolve = r));
    const View = lazyView(() => loaded, { idle: false });
    const root = document.createElement('div');
    const pending = View.preload();
    render(h(View, {}), root); // C is still null: renders nothing, effect not run yet
    resolve(() => h('p', { 'data-testid': 'x' }, 'ready'));
    await pending; // C is now set, before Preact flushes the effect
    await tick();
    await tick();
    expect(root.textContent).toBe('ready');
  });
});
