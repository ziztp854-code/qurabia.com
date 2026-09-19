const retryButton = document.querySelector('#retry');
const status = document.querySelector('#status');
let retryTimer;

function openProduction() {
  clearTimeout(retryTimer);
  retryButton.disabled = true;
  status.textContent = 'جارٍ التحقق من الاتصال…';

  window.location.href = 'tahaddi-retry://production';
  retryTimer = setTimeout(() => {
    status.textContent = 'لا يوجد اتصال متاح الآن. تحقق من الشبكة ثم أعد المحاولة.';
    retryButton.disabled = false;
  }, 5000);
}

retryButton.addEventListener('click', openProduction);
window.addEventListener('online', openProduction);
openProduction();
