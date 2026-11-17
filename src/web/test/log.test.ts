import { describe, expect, it } from 'vitest';
import { log, logLines, resetLog } from '../src/log';

describe('log hook', () => {
  it('is change-only and exposed on window', () => {
    resetLog();
    log('screen:/');
    log('screen:/');
    log('cue:turn');
    log('cue:turn');
    log('screen:/guide');
    log('cue:turn');
    expect(logLines()).toEqual(['screen:/', 'cue:turn', 'screen:/guide', 'cue:turn']);
    expect(window.__howtogoLog).toBe(logLines());
    for (let i = 0; i < 300; i++) log(`x:${i}`);
    expect(logLines()).toHaveLength(200);
  });
});
