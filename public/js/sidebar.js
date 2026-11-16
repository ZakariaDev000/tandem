// Le volet des salons : il se replie pour laisser plus de largeur au bureau,
// et le navigateur se souvient de son état.
import { t } from './i18n/index.js';
import { byId } from './dom.js';
import { readPref, writePref } from './prefs.js';

const PREF = 'sidebar';
const COLLAPSED = 'collapsed';

export function createSidebar() {
  const panel = byId('sidebar');
  const toggle = byId('sidebar-toggle');

  function setCollapsed(collapsed) {
    panel.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = t(collapsed ? 'sidebar.show' : 'sidebar.hide');
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    writePref(PREF, collapsed ? COLLAPSED : '');
  }

  toggle.addEventListener('click', () => setCollapsed(!panel.hidden));
  setCollapsed(readPref(PREF) === COLLAPSED);

  return {
    expand() {
      if (panel.hidden) setCollapsed(false);
    },
    /** Replié, le volet ne montre plus les salons non lus : son bouton le signale à sa place. */
    flagUnread(any) {
      toggle.classList.toggle('has-unread', any);
    },
  };
}
