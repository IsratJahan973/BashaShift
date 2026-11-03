"""Check the existing React workflow against a running dev or production server."""
import argparse
import os
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:8787')
args = parser.parse_args()
storage_key = 'bashashift-prototype-v1'

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'),
    )
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(5000)

    def navigate(name):
        page.get_by_role('navigation', name='Main navigation').get_by_role(
            'button', name=name, exact=True
        ).click()

    def db():
        return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', storage_key)

    page.goto(args.base_url)
    expect(page.locator('.home-card')).to_have_count(6)
    health = page.request.get(args.base_url + '/api/health')
    assert health.ok and health.json()['ok'] is True
    assert page.locator('.home-card').first.evaluate(
        'el => getComputedStyle(el).borderTopLeftRadius'
    ) != '0px', 'React stylesheet did not load'

    page.get_by_label('Search homes', exact=True).fill('Bonosree')
    expect(page.locator('.home-card')).to_have_count(2)
    page.get_by_label('Maximum monthly rent').select_option('20000')
    expect(page.locator('.home-card')).to_have_count(1)
    page.get_by_role('button', name='Reset', exact=True).click()

    navigate('Owner desk')
    page.get_by_label('Property title *', exact=True).fill('Smoke test apartment')
    page.get_by_label('Block / road *', exact=True).fill('Test Block')
    page.get_by_label('Monthly rent (BDT) *', exact=True).fill('18000')
    page.get_by_label('Owner name *', exact=True).fill('Test Owner')
    page.get_by_label('Bangladesh phone *').fill('01712345678')
    page.get_by_role('button', name='Publish property', exact=True).click()
    expect(page.locator('.mini-entry').filter(has_text='Smoke test apartment')).to_have_count(1)

    navigate('Explore homes')
    page.get_by_label('Search homes', exact=True).fill('Smoke test apartment')
    expect(page.locator('.home-card')).to_have_count(1)
    page.get_by_role('button', name='View details', exact=True).click()
    dialog = page.get_by_role('dialog', name='Property details')
    dialog.get_by_label('Your name', exact=True).fill('Test Renter')
    dialog.get_by_label('Your phone', exact=True).fill('01812345678')
    dialog.get_by_role('button', name='Send inquiry', exact=True).click()
    expect(page.get_by_role('heading', name='My requests', exact=True)).to_be_visible()
    assert db()['inquiries'][0]['status'] == 'requested'
    navigate('Owner desk')
    page.get_by_role('button', name='Acknowledge', exact=True).click()
    assert db()['inquiries'][0]['status'] == 'acknowledged'

    navigate('Explore homes')
    page.get_by_role('button', name='View details', exact=True).click()
    page.get_by_role('button', name='Plan move here', exact=True).click()
    expect(page.get_by_role('combobox', name='Moving to', exact=True)).to_have_value('Banasree')
    page.get_by_label('Your name *', exact=True).fill('Test Renter')
    page.get_by_label('Phone number *', exact=True).fill('01812345678')
    page.get_by_label('I agree to share my phone number').check()
    page.get_by_role('button', name='Publish moving request', exact=True).click()
    expect(page.get_by_role('heading', name='My requests', exact=True)).to_be_visible()
    assert db()['requests'][0]['status'] == 'open'

    navigate('Mover desk')
    assert page.get_by_role('link', name='Call customer:').count() == 0
    page.get_by_role('button', name='Accept / Offer', exact=True).click()
    expect(page.get_by_role('button', name='Offer sent', exact=True)).to_be_disabled()
    navigate('My requests 1')
    page.get_by_role('button', name='Choose', exact=True).click()
    assert db()['requests'][0]['status'] == 'awaiting_call'
    page.get_by_role('button', name='Decline & reopen', exact=True).click()
    assert db()['requests'][0]['status'] == 'open'
    navigate('Mover desk')
    page.get_by_role('button', name='Accept / Offer', exact=True).click()
    navigate('My requests 1')
    page.get_by_role('button', name='Choose', exact=True).click()
    page.get_by_role('button', name='Mark confirmed after call', exact=True).click()
    assert db()['requests'][0]['status'] == 'confirmed'
    navigate('Mover desk')
    expect(page.get_by_role('link', name='Call customer: 01812345678')).to_be_visible()
    page.reload()
    expect(page.locator('.home-card')).to_have_count(7)
    assert db()['requests'][0]['status'] == 'confirmed'

    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), \
        'Horizontal overflow on mobile'
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS React: filters, owner listing/inquiry/acknowledgment, property-to-move, '
          'offer/decline/reoffer/confirmation, contact visibility, persistence, '
          'mobile width, stylesheet, health endpoint, no JS errors.')
