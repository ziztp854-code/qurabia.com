"""Real Chromium flows; fake hardware replaces only camera/microphone devices."""
from pathlib import Path
import json, os, tempfile, subprocess, atexit, time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('WASL_URL', 'http://127.0.0.1:4178')
if 'WASL_URL' not in os.environ:
    runtime = tempfile.TemporaryDirectory(prefix='wasl-browser-')
    command = "import {createApp} from './server/index.mjs'; const app=await createApp({dataDir:process.argv[1]}); console.log(app.url);"
    server_process = subprocess.Popen(['node', '--input-type=module', '-e', command, runtime.name], cwd=ROOT, stdout=subprocess.PIPE, text=True)
    BASE = server_process.stdout.readline().strip()
    def cleanup():
        server_process.terminate()
        server_process.wait(timeout=10)
        runtime.cleanup()
    atexit.register(cleanup)
errors = []
observations = []
instrument = """(() => {
window.observedPeers = []; window.observedTracks = [];
const Original = window.RTCPeerConnection;
window.RTCPeerConnection = class extends Original {
constructor(...args) { super(...args); window.observedPeers.push(this); }
};
const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (...args) => {
 const stream = await get(...args); window.observedTracks.push(...stream.getTracks()); return stream;
};
})();"""

def observe(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)

def open_app(context):
    page = context.new_page()
    observe(page)
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    expect(page.locator('#connection-label')).to_have_text('متصل بالخادم المحلي')
    return page

def set_name(page, name):
    page.locator('.sidebar [data-page="profile"]').click()
    page.locator('#profile-name').fill(name)
    page.locator('#profile-form button').click()
    expect(page.locator('#toast')).to_have_text('تم حفظ اسمك')
    page.locator('.sidebar [data-page="discover"]').click()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
    host_context = browser.new_context(viewport={'width': 1440, 'height': 1000}, permissions=['camera', 'microphone'])
    guest_context = browser.new_context(viewport={'width': 1280, 'height': 900}, permissions=['camera', 'microphone'])
    for context in [host_context, guest_context]: context.add_init_script(instrument)
    host, guest = open_app(host_context), open_app(guest_context)
    host.screenshot(path=str(ROOT / 'preview-desktop.png'), full_page=True)
    set_name(host, 'سلمان')
    set_name(guest, 'نورة')
    host.locator('.page-heading [data-action="create"]').click()
    host.locator('#create-title').fill('مجلس الأصدقاء')
    host.locator('input[name="mode"][value="video"]').check()
    host.locator('#create-form button[type="submit"]').click()
    expect(host.locator('#room-page')).to_be_visible()
    room_id = host.url.split('#room/')[1]
    guest.locator('#room-code').fill(room_id)
    guest.locator('#join-code-form button').click()
    expect(guest.locator('#active-room-title')).to_have_text('مجلس الأصدقاء')
    expect(host.locator('#participant-count')).to_have_text('٢ / ٤ أشخاص')
    host.locator('#chat-input').fill('أهلًا من المتصفح الأول <script>')
    host.locator('#chat-form button').click()
    expect(guest.locator('.chat-message span').last).to_have_text('أهلًا من المتصفح الأول <script>')
    guest.locator('#chat-input').fill('وصلت رسالتك، أهلًا!')
    guest.locator('#chat-form button').click()
    expect(host.locator('.chat-message span').last).to_have_text('وصلت رسالتك، أهلًا!')
    host.locator('#enable-media').click()
    guest.locator('#enable-media').click()
    for page in [host, guest]:
        page.wait_for_function("() => observedPeers.some(p => p.connectionState === 'connected')", timeout=25000)
        page.wait_for_function("() => document.querySelector('#remote-media audio')?.srcObject?.getAudioTracks().length === 1", timeout=15000)
        expect(page.locator('#participants video')).to_have_count(2)
        deadline = time.monotonic() + 20
        while True:
            stats = page.evaluate("""async () => {
              const results = await Promise.all(observedPeers.map(p => p.getStats()));
              return results.flatMap(r => [...r.values()]).filter(s => s.type === 'inbound-rtp').map(s => ({kind:s.kind, bytesReceived:s.bytesReceived}));
            }""")
            received = {item['kind'] for item in stats if item['bytesReceived'] > 0}
            if received >= {'audio', 'video'}: break
            assert time.monotonic() < deadline, f'No bidirectional media packets: {stats}'
            page.wait_for_timeout(150)
        observations.append({'inboundRtp': stats})
    guest.locator('#toggle-mic').click()
    expect(guest.locator('#toggle-mic')).to_have_attribute('aria-pressed', 'true')
    assert guest.evaluate("observedTracks.filter(t => t.kind === 'audio').every(t => !t.enabled)")
    guest.locator('#toggle-mic').click()
    guest.locator('#toggle-camera').click()
    expect(guest.locator('#toggle-camera')).to_have_attribute('aria-pressed', 'true')
    host.locator('#start-pk').click()
    expect(guest.locator('#pk-panel')).to_be_visible()
    guest.locator('#gift-open').click()
    guest.locator('[data-gift="rose"]').click()
    expect(guest.locator('#balance')).to_have_text('٤٩٠')
    expect(host.locator('.pk-sides b').first).to_have_text('١٠')
    expect(host.locator('#chat-messages')).to_contain_text('أرسل وردة')
    host.screenshot(path=str(ROOT / 'preview-room.png'), full_page=True)
    guest.locator('#leave-room').click()
    expect(guest.locator('#discover-page')).to_be_visible()
    expect(host.locator('#participant-count')).to_have_text('١ / ٤ أشخاص')
    assert guest.evaluate("observedTracks.length === 2 && observedTracks.every(t => t.readyState === 'ended')")
    assert guest.evaluate("observedPeers.every(p => p.connectionState === 'closed')")
    expect(host.locator('#pk-panel')).to_be_hidden()
    host.locator('#leave-room').click()
    assert host.evaluate("observedTracks.every(t => t.readyState === 'ended')")
    assert host.evaluate("observedPeers.every(p => p.connectionState === 'closed')")
    # Favorites, search, filtering, profile and real video upload.
    host.locator('.save-room').first.click()
    host.locator('.sidebar [data-page="following"]').click()
    expect(host.locator('#following-grid .room-card')).to_have_count(1)
    host.locator('.sidebar [data-page="discover"]').click()
    host.locator('[data-filter="video"]').click()
    expect(host.locator('#room-grid .room-card')).to_have_count(4)
    host.locator('#room-search').fill('كلمة لا توجد')
    expect(host.locator('#room-grid .empty')).to_be_visible()
    host.locator('#room-search').fill('')
    host.locator('.sidebar [data-page="clips"]').click()
    host.locator('#upload-open').click()
    host.locator('#clip-title').fill('لحظة تجريبية')
    host.locator('#clip-file').set_input_files(str(ROOT / 'server/fixtures/tiny.mp4'))
    host.locator('#upload-form button[type="submit"]').click()
    expect(host.locator('#upload-dialog')).not_to_be_visible()
    expect(host.locator('.clip-card').first).to_contain_text('لحظة تجريبية')
    host.locator('.clip-card video').first.evaluate('(video) => video.play()')
    host.wait_for_function("() => document.querySelector('.clip-card video').readyState >= 2")
    # Voice-only capture uses no camera.
    host.locator('.sidebar [data-page="discover"]').click()
    assert host.locator('.clip-card video').first.evaluate('(video) => video.paused'), 'hidden clips must stop playing'
    host.locator('[data-filter="all"]').click()
    host.locator('#room-grid [data-join="demo-1"]').click()
    expect(host.locator('#room-page')).to_be_visible()
    host.locator('#enable-media').click()
    expect(host.locator('#toggle-mic')).to_be_visible()
    assert host.evaluate("observedTracks.filter(t => t.readyState === 'live').map(t => t.kind)") == ['audio']
    host.locator('#leave-room').click()
    # Device permission denial leaves the user in a working chat room.
    denied_context = browser.new_context(viewport={'width': 1100, 'height': 900})
    denied_context.add_init_script("navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };")
    denied = open_app(denied_context)
    denied.locator('.sidebar [data-page="discover"]').click()
    denied.locator('#room-grid [data-join="demo-1"]').click()
    denied.locator('#enable-media').click()
    expect(denied.locator('#media-hint')).to_contain_text('لم تسمح')
    expect(denied.locator('#chat-input')).to_be_visible()
    denied.locator('#leave-room').click()
    # Mobile and reduced motion: real layout, no horizontal overflow.
    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, device_scale_factor=1, reduced_motion='reduce')
    phone = open_app(mobile)
    assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth')
    phone.screenshot(path=str(ROOT / 'preview-mobile.png'), full_page=True)
    phone.locator('.mobile-nav [data-page="profile"]').click()
    expect(phone.locator('#profile-name')).to_be_visible()
    phone.locator('.mobile-nav [data-page="discover"]').click()
    phone.locator('.mobile-create').click()
    expect(phone.locator('#create-dialog')).to_be_visible()
    phone.keyboard.press('Escape')
    assert phone.evaluate('document.activeElement.classList.contains("mobile-create")')
    for width, height in [(375, 812), (844, 390), (768, 1024)]:
        phone.set_viewport_size({'width': width, 'height': height})
        assert phone.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow {width}'
    browser.close()

assert not errors, errors
result = {'passed': True, 'flows': ['create/join', 'cross-browser chat and escaped content', 'real local WebRTC audio/video with fake devices', 'mute/camera', 'gift debit and PK score', 'leave stops tracks and closes peers', 'favorites/search', 'clip upload/playback', 'voice without camera', 'permission refusal', 'mobile/reduced-motion/keyboard'], 'mediaObservations': observations, 'browserErrors': errors}
(ROOT / 'browser-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True))
