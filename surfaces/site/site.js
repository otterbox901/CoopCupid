const dialog = document.getElementById('release-details');
for (const link of document.querySelectorAll('[data-release]')) {
  const url = window.COOPMATCH_RELEASES?.[link.dataset.release];
  if (url && /^https:\/\//.test(url)) {
    link.href = url;
    link.rel = 'noopener noreferrer';
  } else {
    link.addEventListener('click', event => {
      event.preventDefault();
      dialog.showModal();
    });
  }
}
document.getElementById('close-release').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
const configured = ['chrome', 'github'].filter(key => /^https:\/\//.test(window.COOPMATCH_RELEASES?.[key] || ''));
if (configured.length) document.querySelector('.release-caption').textContent = configured.length === 2 ? 'Available for Chrome. Source available on GitHub.' : `${configured[0] === 'chrome' ? 'Chrome release available. GitHub download' : 'GitHub download available. Chrome release'} coming soon.`;
