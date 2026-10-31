"""Real Chromium acceptance checks for the Arabic vertical video-room browser."""
from pathlib import Path
import atexit, json, re, subprocess, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
runtime = tempfile.TemporaryDirectory(prefix='wasl-feed-')
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
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, permissions=['clipboard-read', 'clipboard-write'], reduced_motion='reduce')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    expect(page.locator('#video-page')).to_be_visible()
    expect(page.locator('body')).to_have_class(re.compile(r'view-video'))
    expect(page.locator('#video-feed .feed-slide')).to_have_count(3)
    expect(page.locator('[data-feed-room="demo-1"]')).to_have_count(0)
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*١\s*/'))

    # Users can move one room per button or key and return using the room list.
    page.locator('.feed-enter[data-feed-enter="demo-2"]').focus()
    page.keyboard.press('ArrowDown')
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*٢\s*/'))
    expect(page.locator('#video-feed')).to_be_focused()
    page.locator('#feed-prev').click()
    page.locator('#feed-next').click()
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*٢\s*/'))
    page.keyboard.press('ArrowDown')
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*٣\s*/'))
    page.keyboard.press('ArrowUp')
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*٢\s*/'))
    page.locator('#feed-prev').click()
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*١\s*/'))
    page.locator('[data-feed-select="demo-4"]').click()
    expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*٣\s*/'))
    assert page.locator('#video-feed').evaluate('(el) => el.scrollTop > el.clientHeight'), 'room list must scroll to selected room'

    # Search uses room titles/category and handles no matches without stale slides.
    page.locator('#video-search').fill('مقهى الموسيقى')
    expect(page.locator('#video-feed .feed-slide')).to_have_count(1)
    expect(page.locator('[data-feed-room="demo-2"]')).to_have_count(1)
    page.locator('#video-search').fill('سفر')
    expect(page.locator('[data-feed-room="demo-4"]')).to_have_count(1)
    page.locator('#video-search').fill('غرفة غير موجودة بتاتًا')
    expect(page.locator('#video-feed .feed-slide')).to_have_count(0)
    expect(page.locator('#video-feed')).to_contain_text(re.compile('غرف|غرفة'))
    page.locator('#video-search').fill('')
    expect(page.locator('#video-feed .feed-slide')).to_have_count(3)

    # Saved filter, persisted save and unsave are the same real local user state.
    page.locator('#feed-tab-saved').click()
    expect(page.locator('#video-feed .feed-slide')).to_have_count(0)
    page.locator('#feed-tab-all').click()
    page.locator('[data-feed-save="demo-2"]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-feed-save="demo-2"]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('[data-feed-save="demo-2"]')).to_be_focused()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#feed-tab-saved').click()
    expect(page.locator('#video-feed .feed-slide')).to_have_count(1)
    expect(page.locator('[data-feed-room="demo-2"]')).to_have_count(1)
    page.locator('[data-feed-save="demo-2"]').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#video-feed .feed-slide')).to_have_count(0)
    expect(page.locator('#video-feed')).to_be_focused()
    page.locator('#feed-tab-all').click()

    # Sharing writes a usable real room URL; joining enters existing chat room.
    page.locator('[data-feed-share="demo-2"]').click()
    assert page.evaluate('navigator.clipboard.readText()') == BASE + '/#room/demo-2'
    recipient_context = browser.new_context()
    recipient = recipient_context.new_page()
    recipient.goto(BASE + '/#room/demo-2')
    expect(recipient.locator('#room-page')).to_be_visible()
    expect(recipient.locator('#active-room-title')).to_have_text('مقهى الموسيقى')
    recipient.locator('#leave-room').click()
    expect(recipient.locator('#video-page')).to_be_visible()
    recipient_context.close()
    page.locator('.feed-enter[data-feed-enter="demo-2"]').click()
    expect(page.locator('#room-page')).to_be_visible()
    expect(page.locator('#active-room-title')).to_have_text('مقهى الموسيقى')
    page.locator('#leave-room').click()
    expect(page.locator('#video-page')).to_be_visible()

    # Arrow keys inside search inputs/dialogs must not navigate the background feed.
    page.locator('#video-search').focus()
    before = page.locator('#feed-counter').inner_text()
    page.keyboard.press('ArrowDown')
    assert page.locator('#feed-counter').inner_text() == before
    page.locator('.sidebar [data-action="create"]').click()
    expect(page.locator('#create-dialog')).to_be_visible()
    page.locator('#create-title').focus()
    page.keyboard.press('ArrowDown')
    assert page.locator('#feed-counter').inner_text() == before
    page.keyboard.press('Escape')

    # Responsive feed has no horizontal overflow at phone, tablet or landscape sizes.
    for width, height in [(390, 844), (375, 812), (844, 390), (768, 1024)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}x{height}'
        feed = page.locator('#video-feed')
        assert feed.bounding_box()['width'] <= width
        page.locator('#feed-tab-all').click()
        feed.evaluate('(el) => el.scrollTo({top:0, behavior:"instant"})')
        expect(page.locator('#feed-counter')).to_have_text(re.compile(r'^\s*١\s*/'))
        feed.hover()
        page.mouse.wheel(0, height)
        page.wait_for_function('() => document.querySelector("#video-feed").scrollTop > 30')
        assert feed.evaluate('(el) => getComputedStyle(el).scrollSnapType.includes("y")')
    assert not errors, errors
    browser.close()

result = {'passed': True, 'checks': ['default video-only feed', 'button/keyboard/list navigation', 'title/category search', 'saved persistence and empty state', 'clipboard room URL and fresh-context recipient join', 'real join and return to feed', 'input/dialog keyboard isolation', 'focus preserved on save and moved safely from departing or removed slides', 'responsive scroll-snap and reduced motion'], 'browserErrors': errors}
(ROOT / 'feed-browser-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('FEED_BROWSER_PASSED')
