/** M5 integration: Home's help note, split from the lazy Help sheet so Home does not load the whole sheet (M5 AC 3). */
import { useServices, useT } from '../context';
import { family } from '../state/family';
import { helpShare } from '../state/helpShare';
import { Icon, showToast } from '../ui/kit';

/**
 * Note while help is showing on family's page (6e.3): "I'm okay now". Trip share → back to travelling.
 * Help-only share (QA-37, not on a trip; shown on Home) → the share ends (AC 35).
 */
export function HelpNote() {
  const { store, runtime, api, platform } = useServices();
  const t = useT();
  const trip = store.trip.value;
  const s = trip?.share;
  // Creative m34-fix-b M4: a live help-only share always shows its off switch, on a trip too.
  const hs = helpShare.current.value;
  if (s?.status !== 'help' && !hs) return null;
  const fam = (hs ? hs.fam : null) ?? family.contacts.value[0]?.name ?? t('sh_family_fb');
  return (
    <div class="tripnote helpnote" role="status" data-testid="help-note">
      <Icon name="help" />
      <div class="tx">
        <b>{t('hp_note', { fam })}</b>
      </div>
      <button
        type="button"
        class="btn btn-secondary"
        data-testid="help-ok"
        onClick={() => {
          void platform.vibrate('confirm');
          if (hs) {
            void helpShare.end(api);
            showToast('help-ok', t('hp_ok_end', { fam }));
          } else {
            runtime.clearHelp();
            showToast('help-ok', t('hp_ok_toast', { fam }));
          }
        }}
      >
        {t('hp_ok')}
      </button>
    </div>
  );
}
