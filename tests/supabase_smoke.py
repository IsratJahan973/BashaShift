"""Real local Supabase UI journey across isolated owner, renter and mover browsers."""
import argparse
import os
import re
import secrets
from urllib.parse import urlparse
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:8787')
args = parser.parse_args()
if urlparse(os.environ.get('BASHASHIFT_TEST_SUPABASE_URL', '')).hostname not in ['127.0.0.1', 'localhost', '::1']:
    raise RuntimeError('Run through npm run test:browser:live against local Supabase only.')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    contexts = []
    errors = []
    password = secrets.token_urlsafe(30)
    title = 'Local browser test apartment '+str(uuid4())[:8]

    def navigate(page, name):
        page.get_by_role('navigation', name='Main navigation').get_by_role(
            'button', name=re.compile('^'+re.escape(name)+r'(?:\s*\d+)?$')
        ).click()

    def signup(role, display_name, phone):
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        contexts.append(context)
        page = context.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.base_url)
        page.get_by_role('button', name='Sign in', exact=True).click()
        dialog = page.get_by_role('dialog', name='Account access')
        dialog.get_by_role('button', name='New here? Create an account', exact=True).click()
        dialog.get_by_role('combobox', name='Account role').select_option(role)
        dialog.get_by_label('Full name', exact=True).fill(display_name)
        dialog.get_by_label('Bangladesh phone number', exact=True).fill(phone)
        email = 'ui-'+os.environ['BASHASHIFT_TEST_RUN_ID']+'-'+str(uuid4())[:8]+'@example.test'
        dialog.get_by_label('Email address', exact=True).fill(email)
        dialog.get_by_label('Password', exact=True).fill(password)
        dialog.get_by_role('button', name='Create account', exact=True).click()
        # wait_for avoids printing password-field snapshots if Auth fails.
        dialog.wait_for(state='hidden')
        page.get_by_role('button', name='Sign out', exact=True).wait_for()
        assert page.evaluate("localStorage.getItem('bashashift-prototype-v1')") is None
        return page, email

    owner, owner_email = signup('owner', 'Local UI Owner', '01712345678')
    renter, _ = signup('renter', 'Local UI Renter', '01812345678')
    mover, _ = signup('mover', 'Local UI Mover', '01912345678')
    unrelated_owner, _ = signup('owner', 'Unrelated UI Owner', '01612345678')

    navigate(owner, 'Owner desk')
    owner.get_by_label('Property title *', exact=True).fill(title)
    owner.get_by_label('Block / road *', exact=True).fill('Test Block')
    owner.get_by_label('Monthly rent (BDT) *', exact=True).fill('19000')
    owner.get_by_role('button', name='Publish property', exact=True).click()
    expect(owner.locator('.mini-entry').filter(has_text=title)).to_have_count(1)

    renter.get_by_role('button', name='Refresh listings', exact=True).click()
    renter.get_by_label('Search homes', exact=True).fill(title)
    expect(renter.locator('.home-card')).to_have_count(1)
    renter.get_by_role('button', name='View details', exact=True).click()
    details = renter.get_by_role('dialog', name='Property details')
    assert details.get_by_role('link', name='Call owner').count() == 0
    details.get_by_role('button', name='Send inquiry', exact=True).click()
    expect(renter.get_by_role('heading', name='My requests', exact=True)).to_be_visible()
    owner.get_by_role('button', name='Refresh listings', exact=True).click()
    owner.get_by_role('button', name='Acknowledge', exact=True).click()

    navigate(renter, 'Explore homes')
    renter.get_by_role('button', name='Refresh listings', exact=True).click()
    renter.get_by_role('button', name='View details', exact=True).click()
    expect(renter.get_by_role('link', name='Call owner', exact=True)).to_be_visible()
    renter.get_by_role('button', name='Plan move here', exact=True).click()
    renter.get_by_label('Notes for movers', exact=True).fill('Private local test unit and access notes')
    renter.get_by_label('I agree to share my phone number').check()
    renter.get_by_role('button', name='Publish moving request', exact=True).click()
    expect(renter.get_by_role('heading', name='My requests', exact=True)).to_be_visible()

    navigate(mover, 'Mover desk')
    mover.get_by_role('button', name='Refresh listings', exact=True).click()
    expect(mover.locator('.worker-job')).to_have_count(1)
    assert '01812345678' not in mover.locator('body').inner_text()
    assert 'Private local test unit' not in mover.locator('body').inner_text()
    mover.get_by_role('button', name='Accept / Offer', exact=True).click()
    expect(mover.get_by_role('button', name='Offer sent', exact=True)).to_be_disabled()
    renter.get_by_role('button', name='Refresh listings', exact=True).click()
    renter.get_by_role('button', name='Choose', exact=True).click()
    expect(renter.get_by_role('link', name='Call mover: 01912345678', exact=True)).to_be_visible()
    mover.get_by_role('button', name='Refresh listings', exact=True).click()
    expect(mover.get_by_role('link', name='Call customer: 01812345678', exact=True)).to_be_visible()
    renter.get_by_role('button', name='Mark confirmed after call', exact=True).click()
    expect(renter.get_by_text('Confirmed by customer (self-reported)', exact=True)).to_be_visible()
    renter.reload()
    navigate(renter, 'My requests')
    expect(renter.get_by_text('Confirmed by customer (self-reported)', exact=True)).to_be_visible()
    assert renter.evaluate("localStorage.getItem('bashashift-prototype-v1')") is None

    navigate(unrelated_owner, 'Owner desk')
    unrelated_owner.get_by_role('button', name=re.compile('Listings & inquiries')).click()
    expect(unrelated_owner.locator('.mini-entry').filter(has_text=title)).to_have_count(0)

    owner.get_by_role('button', name='Sign out', exact=True).click()
    owner.get_by_role('button', name='Sign in', exact=True).click()
    dialog = owner.get_by_role('dialog', name='Account access')
    dialog.get_by_label('Email address', exact=True).fill(owner_email)
    dialog.get_by_label('Password', exact=True).fill(password)
    dialog.get_by_role('button', name='Sign in', exact=True).click()
    dialog.wait_for(state='hidden')
    navigate(owner, 'Owner desk')
    owner.get_by_role('button', name=re.compile('Listings & inquiries')).click()
    expect(owner.locator('.mini-entry').filter(has_text=title)).to_have_count(1)

    for page in [owner, renter, mover]:
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
    assert not errors, errors
    for context in contexts:
        context.close()
    browser.close()
    print('PASS live Supabase UI: registration for all three roles, login/logout, owner-only management, '
          'shared property/inquiry, moving offer/booking, contact privacy, reload persistence, mobile width, no page errors.')
