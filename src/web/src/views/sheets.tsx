/** End-trip sheet (STYLE-GUIDE §6 "End-trip sheet", D8 guard): a history entry; Back or "Keep going" closes it. */
import { useServices, useT } from '../context';
import { Icon, Sheet } from '../ui/kit';

export function EndTripSheet() {
  const { router, runtime } = useServices();
  const t = useT();
  return (
    <Sheet id="end-trip" title={t('end_trip_confirm')} close={false}>
      <p class="lead">{t('end_lead')}</p>
      <div class="opts">
        <button type="button" class="btn btn-primary" data-testid="end-trip-no" onClick={() => router.closeSheet()}>
          <Icon name="nav" />
          {t('keep_going')}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="end-trip-yes"
          onClick={async () => {
            await runtime.end();
            router.navigate('/', { replace: true });
          }}
        >
          <Icon name="close" />
          {t('end_trip')}
        </button>
      </div>
    </Sheet>
  );
}
