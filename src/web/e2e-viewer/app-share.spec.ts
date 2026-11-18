/**
 * M4 two-context test through the real app UI: context A = the senior's app (fixture routes + demo GPS,
 * shares sent to the real Worker via `realshare=1`), context B = family on /t/:id (real Durable Object).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

type W = Window & { __howtogo: any };
const ctx = (b: Browser) => b.newContext({ baseURL: test.info().project.use.baseURL, timezoneId: 'Asia/Singapore', locale: 'zh-CN', geolocation: { latitude: 1.33465, longitude: 103.8491 }, permissions: ['geolocation'] });
const quiet = (p: Page) => p.route(/onemap\.gov\.sg|fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 204 }));

test('app share → family page live: walk step from the structured step, help, I\'m okay, stop → ended', async ({ browser }) => {
  const a = await ctx(browser);
  const b = await ctx(browser);
  const senior = await a.newPage();
  await quiet(senior);
  await senior.addInitScript(() => {
    localStorage.setItem('howtogo.settings', JSON.stringify({ onboarded: true, motion: 'on' }));
    localStorage.setItem('howtogo.family.v1', JSON.stringify([{ name: '美玲', relation: 'daughter', phone: '+6591234567', callMe: '妈妈', lang: 'zh' }]));
    window.open = (() => null) as typeof window.open;
  });
  await senior.goto('/?demo=1&demoMs=100000&realshare=1');
  await senior.getByTestId('to-field').click();
  await senior.getByTestId('search-input').fill('陈笃生');
  await senior.getByTestId('search-result-0').click();
  await senior.getByTestId('route-option-0').click();
  await senior.getByTestId('start-guide').click();
  await senior.getByTestId('guide-share').click();
  await senior.getByTestId('share-wa').click();
  await expect(senior.getByTestId('share-pill')).toHaveAttribute('data-state', 'sharing');
  const id = await senior.evaluate(() => (window as unknown as W).__howtogo.store.trip.value.share.id as string);

  const fam = await b.newPage();
  await quiet(fam);
  await fam.goto(`/t/${id}`);
  const v = fam.getByTestId('viewer');
  await expect(v).toHaveAttribute('data-state', 'walk', { timeout: 8000 });
  await expect(fam.getByRole('heading', { level: 1 })).toHaveText('妈妈正在去 Tan Tock Seng Hospital');
  await expect(fam.getByTestId('viewer-pill')).toContainText('正在走路去');

  await senior.getByTestId('guide-help').click();
  await senior.getByTestId('help-call').click();
  await expect(v).toHaveAttribute('data-state', 'help', { timeout: 5000 });
  await senior.getByTestId('help-ok').click();
  await expect(v).toHaveAttribute('data-state', 'helpcleared', { timeout: 8000 });

  await senior.getByTestId('share-pill').click();
  await senior.getByTestId('share-stop').click();
  // Creative m34-fix-b M2: a share stopped after "I'm okay" ends as `endedOk` ("妈妈说自己没事了。分享结束了。").
  await expect(v).toHaveAttribute('data-state', 'endedOk', { timeout: 8000 });
  await a.close();
  await b.close();
});
