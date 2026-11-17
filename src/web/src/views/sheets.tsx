/** Sheets/dialogs: each is a history entry (router.openSheet); Back or "No" closes it. */
import { useServices, useT } from '../context';

export function EndTripSheet() {
  const { router, runtime } = useServices();
  const t = useT();
  return (
    <dialog open aria-modal="true" aria-labelledby="end-trip-title" data-testid="sheet-end-trip">
      <h2 id="end-trip-title">{t('end_trip_confirm')}</h2>
      <button
        type="button"
        data-testid="end-trip-yes"
        onClick={async () => {
          await runtime.end();
          router.navigate('/', { replace: true });
        }}
      >
        {t('yes')}
      </button>{' '}
      <button type="button" data-testid="end-trip-no" onClick={() => router.closeSheet()}>
        {t('no')}
      </button>
    </dialog>
  );
}
