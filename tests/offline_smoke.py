"""Exercise both offline demos with real browser storage (Playwright + Chromium)."""
import os
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parent.parent


@contextmanager
def demo_server():
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()
            thread.join()


with demo_server() as base_url, sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'),
    )
    for filename in ['standalone-demo.html', 'standalone-selfcontained.html']:
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(5000)
        page.on('dialog', lambda dialog: dialog.accept())
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'{base_url}/{filename}')
        expect(page.locator('.home-card')).to_have_count(6)
        assert page.locator('.home-card').first.evaluate(
            "el => getComputedStyle(el).borderTopLeftRadius"
        ) != '0px', 'Demo stylesheet did not load'

        page.get_by_label('Search area').fill('Bonosree')
        expect(page.locator('.home-card')).to_have_count(2)
        page.get_by_label('Maximum budget').select_option('20000')
        expect(page.locator('.home-card')).to_have_count(1)
        page.get_by_label('Search area').fill('')
        page.get_by_label('Maximum budget').select_option('')

        page.get_by_role('button', name='Plan a move', exact=True).click()
        page.locator('input[name=name]').fill('Demo Customer')
        page.locator('input[name=phone]').fill('01712345678')
        page.locator('input[name=consent]').check()
        page.get_by_role('button', name='Create moving request').click()
        assert page.evaluate('db.requests.length') == 1
        page.get_by_role('button', name='Mover desk', exact=True).click()
        assert page.get_by_role('link', name='Call customer:').count() == 0
        page.get_by_role('button', name='Accept / Send offer').click()
        assert page.evaluate('db.requests[0].offers.length') == 1
        page.get_by_role('button', name='My requests', exact=True).click()
        page.get_by_role('button', name='Choose', exact=True).click()
        assert page.evaluate('db.requests[0].status') == 'awaiting_call'
        page.get_by_role('button', name='Confirm after phone call').click()
        assert page.evaluate('db.requests[0].status') == 'confirmed'
        page.reload()
        assert page.evaluate('db.requests[0].status') == 'confirmed'

        page.set_viewport_size({'width': 390, 'height': 844})
        assert page.evaluate(
            'document.documentElement.scrollWidth <= window.innerWidth'
        ), 'Horizontal overflow on mobile'
        assert not errors, errors
        context.close()
        print(f'PASS {filename}: search/budget, moving offer/selection/confirmation, '
              'storage persistence, mobile width, stylesheet, no JS errors.')
    browser.close()
