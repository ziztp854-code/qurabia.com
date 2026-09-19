(() => {
  const overlayId = 'tahaddi-desktop-offline';

  addEventListener('keydown', (event) => {
    if (event.key !== 'F11') return;
    event.preventDefault();
    location.href = 'tahaddi-fullscreen://toggle';
  });

  function showOffline() {
    if (location.hostname !== 'qurabia.com' || document.getElementById(overlayId)) return;

    const overlay = document.createElement('section');
    overlay.id = overlayId;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${overlayId}-title`);
    overlay.innerHTML = `
      <div>
        <strong id="${overlayId}-title">انقطع الاتصال</strong>
        <p>تحقق من الشبكة، ثم حاول العودة إلى منصة تحدي.</p>
        <button type="button">إعادة المحاولة</button>
      </div>`;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:1rem;background:#070a0ff2;color:#f5f0e6;font-family:"Segoe UI",Tahoma,sans-serif;text-align:center;direction:rtl';
    overlay.firstElementChild.style.cssText = 'width:min(32rem,100%);padding:2.5rem 2rem;border:1px solid #ffb00080;border-radius:1.5rem;background:#0d121b;box-shadow:0 1.5rem 5rem #0008';
    overlay.querySelector('strong').style.cssText = 'display:block;font-size:2rem;margin-bottom:.75rem';
    overlay.querySelector('p').style.cssText = 'color:#b8c1cc;line-height:1.7;margin:0 0 1.5rem';
    const button = overlay.querySelector('button');
    button.style.cssText = 'min-width:10rem;min-height:3rem;border:0;border-radius:.8rem;background:#ffb000;color:#070a0f;font:inherit;font-weight:800;cursor:pointer';
    button.addEventListener('click', () => location.reload());
    document.documentElement.append(overlay);
    button.focus();
  }

  addEventListener('offline', showOffline);
  addEventListener('online', () => document.getElementById(overlayId)?.remove());
  if (!navigator.onLine) addEventListener('DOMContentLoaded', showOffline, { once: true });
})();
