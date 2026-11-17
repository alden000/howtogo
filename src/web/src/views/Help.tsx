/** Help (M4 builds the full screen: call family, show-my-location card, taxi card). */
import { Header } from '../app';
import { useServices, useT } from '../context';

export function Help() {
  const { store, runtime } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const sharing = !!trip?.share;
  const helping = trip?.share?.status === 'help';
  return (
    <main>
      <Header title={t('help')} />
      {sharing ? (
        <button type="button" data-testid="help-send" disabled={helping} onClick={() => runtime.help()}>
          {helping ? t('help_sent') : t('need_help')}
        </button>
      ) : (
        <p>{t('share_none')}</p>
      )}
      {trip?.guidance.fix && (
        <p data-testid="help-location">
          {trip.guidance.fix.lat.toFixed(5)}, {trip.guidance.fix.lng.toFixed(5)}
        </p>
      )}
    </main>
  );
}
