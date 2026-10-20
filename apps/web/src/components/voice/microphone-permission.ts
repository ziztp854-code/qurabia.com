/** Ask only after an explicit microphone action; never keep a preview stream open. */
export async function requestVoiceMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext)
    throw new Error('الميكروفون يحتاج متصفحًا حديثًا واتصال HTTPS آمنًا.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    throw new Error(
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'لم تسمح بالميكروفون. فعّل إذنه من إعدادات الموقع في المتصفح ثم اطلب المايك مجددًا.'
        : 'تعذر الوصول للميكروفون. تحقق من توصيله وأنه غير مستخدم ثم حاول مجددًا.',
    );
  }
}
