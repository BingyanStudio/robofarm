// Reusable login user card: avatar + name (+ dev badge), click-to-login when signed out.
// Backend only returns id/name/dev (name is the github login), so the avatar is a
// deterministic, offline-safe initial-tile derived from the login name.
import { el } from './ui';
import { fetchUser, loginUrl } from '../core/net';

/** Deterministic hue from a username, so the same user always gets the same avatar color. */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Build a signed-in avatar card (avatar tile + name + optional dev badge). */
function signedIn(name: string, dev: boolean): HTMLElement {
  const avatar = el('span', {
    class: 'user-avatar',
    text: (name[0] ?? '?').toUpperCase(),
    style: `background: hsl(${hueOf(name)} 42% 38%)`,
  });
  const info = el('span', { class: 'user-card-meta' }, [el('span', { class: 'user-name', text: name })]);
  if (dev) info.append(el('span', { class: 'user-dev', text: '本地' }));
  return el('span', { class: 'user-card user-on' }, [avatar, info]);
}

/** Build a signed-out card that navigates to GitHub OAuth on click. */
function signedOut(): HTMLElement {
  const avatar = el('span', { class: 'user-avatar user-avatar-off', text: '?' });
  const label = el('span', { class: 'user-card-meta' }, [el('span', { class: 'user-name', text: '未登录' })]);
  const card = el('span', { class: 'user-card', title: '点击登录' }, [avatar, label]);
  card.addEventListener('click', () => (location.href = loginUrl));
  return card;
}

/** Create a user card that fills itself in once /auth/me resolves. */
export function userCard(): HTMLElement {
  const host = el('span', { class: 'user-card-pending' }, [el('span', { class: 'user-avatar user-avatar-off', text: '…' })]);
  void fetchUser().then((user) => {
    const card = user ? signedIn(user.name, user.dev) : signedOut();
    host.replaceWith(card);
  });
  return host;
}