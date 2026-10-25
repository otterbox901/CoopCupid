/** Brief success feedback. Keep it outside result cards, which rerender on save. */
export function shootCupid(origin) {
  if (!origin || !document.body.animate) return;
  document.querySelector('.cupid-flight')?.remove();
  const arrow = document.createElement('span');
  arrow.className = 'cupid-flight';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.style.left = `${Math.max(8, Math.min(origin.right - 92, innerWidth - 100))}px`;
  arrow.style.top = `${Math.max(8, Math.min(origin.top - 8, innerHeight - 48))}px`;
  arrow.innerHTML = '<svg viewBox="0 0 100 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 28 78 14M15 27l-9-8m13 7-6 11M25 25l-9-8m14 7-6 11"/><path d="M78 14c-11-2-14-8-10-12 4-3 8 0 9 3 3-4 8-3 10 1 2 5-3 8-9 8Z" fill="currentColor"/></svg>';
  document.body.append(arrow);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = arrow.animate(reduced ? [{ opacity: 1 }, { opacity: 0 }] : [
    { transform: 'translate(-32px, 12px)', opacity: 0 },
    { transform: 'translate(-12px, 4px)', opacity: 1, offset: .3 },
    { transform: 'translate(24px, -12px)', opacity: 0 }
  ], { duration: reduced ? 160 : 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  animation.finished.then(() => arrow.remove(), () => arrow.remove());
}
