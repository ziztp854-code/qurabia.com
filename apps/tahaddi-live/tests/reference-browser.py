"""Reference-driven responsive studio checks using real application state."""
from pathlib import Path
import atexit, json, re, subprocess, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
runtime = tempfile.TemporaryDirectory(prefix='wasl-reference-')
command = "import {createApp} from './server/index.mjs'; const app=await createApp({dataDir:process.argv[1]}); console.log(app.url);"
server = subprocess.Popen(['node', '--input-type=module', '-e', command, runtime.name], cwd=ROOT, stdout=subprocess.PIPE, text=True)
BASE = server.stdout.readline().strip()

def cleanup():
    server.terminate()
    server.wait(timeout=10)
    runtime.cleanup()
atexit.register(cleanup)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1672, 'height': 960}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    # First tracer: these two surfaces distinguish the supplied references.
    expect(page.locator('#browse-chat')).to_be_visible()
    expect(page.locator('#studio-gift-tray')).to_be_visible()
    feed = page.locator('#video-feed').bounding_box()
    chat = page.locator('#browse-chat').bounding_box()
    side = page.locator('.feed-sidecar').bounding_box()
    assert feed['width'] > feed['height'], f'Desktop video must be landscape: {feed}'
    assert chat['x'] + chat['width'] <= feed['x'] + 3, 'chat belongs to left column'
    assert side['x'] >= feed['x'] + feed['width'] - 3, 'suggested rooms belong to right column'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / 'preview-desktop.png'), full_page=True)
    # Enter a real voice room, with one real user and three explicitly vacant seats.
    page.goto(BASE + '/#room/demo-1')
    expect(page.locator('#room-page')).to_be_visible()
    expect(page.locator('.room-presenter')).to_be_visible()
    expect(page.locator('#room-page')).to_have_attribute('data-mode', 'voice')
    expect(page.locator('.room-presenter')).to_contain_text(re.compile('صورة توضيحية|غلاف توضيحي'))
    expect(page.locator('#participants .empty-seat')).to_have_count(3)
    expect(page.locator('#participants video')).to_have_count(0)
    expect(page.locator('#toggle-mic')).to_be_hidden()
    expect(page.locator('#toggle-camera')).to_be_hidden()
    expect(page.locator('#room-gift-bar')).to_be_visible()
    expect(page.locator('[data-room-gift]')).to_have_count(3)
    # No invented transaction or balance debit when no recipient exists.
    balance = page.locator('#balance').inner_text()
    page.locator('[data-room-gift="rose"]').click()
    expect(page.locator('#gift-dialog')).not_to_be_visible()
    expect(page.locator('#balance')).to_have_text(balance)
    # The mobile reference uses a voice hero, seats, controls, real chat and composer.
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('.room-presenter')).to_be_visible()
    expect(page.locator('#chat-input')).to_be_visible()
    expect(page.locator('#enable-media')).to_be_visible()
    for width, height in [(390, 844), (375, 812), (844, 390), (768, 1024)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}x{height}'
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(page.locator('#toast')).to_be_hidden(timeout=5500)
    page.screenshot(path=str(ROOT / 'preview-mobile-voice.png'), full_page=True)
    page.locator('#chat-input').fill('جلسة جميلة من الهاتف')
    page.locator('#chat-form button').click()
    expect(page.locator('#chat-messages')).to_contain_text('جلسة جميلة من الهاتف')
    page.locator('#leave-room').click()
    expect(page.locator('#video-page')).to_be_visible()
    assert not errors, errors
    browser.close()

result = {'passed': True, 'checks': ['desktop landscape studio', 'left chat and right suggested rooms', 'desktop gift tray', 'voice presenter with cover disclosure', 'real user and empty seats', 'devices off on entry', 'gift recipient guard', 'mobile chat and no overflow'], 'browserErrors': errors}
(ROOT / 'reference-browser-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('REFERENCE_BROWSER_PASSED')
