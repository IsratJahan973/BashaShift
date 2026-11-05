"""Real photo-upload route with mocked Cloudflare, and a browser-local moving request."""
import argparse
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from browser_artifacts import capture

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',required=True)
args=parser.parse_args()
photo=Path(__file__).resolve().parent.parent/'docs/prototype-desktop.png'
storage='bashashift-prototype-v1'

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.set_default_timeout(7000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))

    def moving(page):
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
        page.goto(args.base_url+'?demo=1')
        page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Moving services',exact=True).click()
        page.get_by_label('Approx. distance (km)',exact=True).fill('8')
        page.get_by_label('Destination floor',exact=True).fill('3')
        page.get_by_label('Working lift accessible at both buildings').uncheck()
        expect(page.locator('.budget-range')).to_have_text('৳2,768–৳4,152')
        page.get_by_role('button',name='Continue to furniture',exact=True).click()

    def contact(page):
        page.get_by_role('button',name='Continue to estimate',exact=True).click()
        page.get_by_label('Your name *',exact=True).fill('AI workflow test renter')
        page.get_by_label('Phone number *',exact=True).fill('01812345678')
        page.get_by_label('I agree to share my phone number').check()

    moving(page)
    initial=page.locator('.inventory-list').inner_text()
    page.get_by_label('Furniture photos',exact=True).set_input_files([str(photo),str(photo)])
    expect(page.locator('.scan-photos figure')).to_have_count(2)
    expect(page.get_by_role('button',name='Analyze photos',exact=True)).to_be_disabled()
    page.get_by_label('I have permission to send these photos').check()
    page.get_by_role('button',name='Analyze photos',exact=True).click()
    expect(page.locator('.scan-review-row')).to_have_count(3)
    expect(page.get_by_role('button',name='Publish moving request',exact=True,include_hidden=True)).to_be_disabled()
    expect(page.get_by_role('button',name='Continue to estimate',exact=True)).to_be_disabled()
    capture(page,'ai-review-mocked')
    page.get_by_role('button',name='Previous step',exact=True).click()
    expect(page.get_by_label('Approx. distance (km)',exact=True)).to_have_value('8')
    page.get_by_role('button',name='Continue to furniture',exact=True).click()
    expect(page.locator('.scan-review-row')).to_have_count(3)
    expect(page.locator('.scan-photos figure')).to_have_count(2)
    assert page.locator('.inventory-list').inner_text()==initial,'AI must not auto-add to example inventory'
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests.length',storage)==0
    page.get_by_label('Detected Bed quantity',exact=True).fill('3')
    page.get_by_label('Detected Refrigerator quantity',exact=True).fill('0')
    page.get_by_label('Detected Boxes quantity',exact=True).fill('5')
    page.get_by_role('button',name='Apply reviewed inventory',exact=True).click()
    page.locator('.manual-inventory>summary').click()
    page.get_by_role('button',name='Add Sofa',exact=True).click()
    expect(page.locator('.budget-range')).to_have_text('৳4,368–৳6,552')
    for width in [390,360]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Photo review overflows mobile width'
    page.set_viewport_size({'width':1440,'height':1000})
    contact(page)
    expect(page.locator('.budget-range')).to_be_visible()
    expect(page.get_by_text('Demo assumptions, not verified market rates or a guaranteed quote.',exact=False)).to_be_visible()
    capture(page,'moving-estimate-demo')
    page.get_by_role('region',name='Illustrative moving budget').get_by_text('How calculated · Edit assumptions',exact=True).click()
    page.get_by_label('Base (BDT)',exact=True).fill('1000')
    expect(page.locator('.budget-range')).to_have_text('৳4,488–৳6,732')
    page.get_by_role('button',name='Previous step',exact=True).click()
    page.get_by_role('button',name='Continue to estimate',exact=True).click()
    expect(page.get_by_label('Your name *',exact=True)).to_have_value('AI workflow test renter')
    expect(page.get_by_label('Base (BDT)',exact=True)).to_have_value('1000')
    page.get_by_role('button',name='Publish moving request',exact=True).click()
    expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
    expect(page.get_by_text('Waiting for mover quotations.',exact=True)).to_be_visible()
    data=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',storage)
    request=data['requests'][0]
    assert {item['name']:item['qty'] for item in request['items']}=={'Bed':3,'Boxes':5,'Sofa':1}
    assert request['estimate']==0 and request['status']=='open' and request['offers']==[] and request['selectedOfferId'] is None
    assert all(worker['sample'] for worker in data['workers'])
    page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Mover desk',exact=True).click()
    expect(page.get_by_label('Your quotation (BDT)')).to_have_value('')
    page.get_by_label('Your quotation (BDT)').fill('3850')
    capture(page,'mover-quote-demo')
    page.get_by_role('button',name='Submit quotation',exact=True).click()
    page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='My requests 1').click()
    expect(page.get_by_text('৳3,850',exact=True)).to_be_visible()
    page.get_by_role('button',name='Choose',exact=True).click()
    capture(page,'renter-booking-demo')
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests[0].offers[0].amount',storage)==3850
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests[0].status',storage)=='awaiting_call'
    assert not errors,errors
    context.close()
    print('PASS AI review, step/data preservation, immediate editable demo range, independent quote, renter selection; 360/390px responsive.')

    context=browser.new_context(viewport={'width':1440,'height':1000})
    page=context.new_page();page.set_default_timeout(7000)
    page.route('**/api/scan',lambda route:route.fulfill(status=503,content_type='application/json',body='{"error":"AI photo analysis is not configured in this test.","code":"ai_not_configured"}'))
    moving(page)
    initial=page.locator('.inventory-list').inner_text()
    page.get_by_label('Furniture photos',exact=True).set_input_files(str(photo))
    page.get_by_label('I have permission to send these photos').check()
    page.get_by_role('button',name='Analyze photos',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('not configured')
    assert page.locator('.inventory-list').inner_text()==initial
    expect(page.locator('.scan-review')).to_have_count(0)
    page.locator('.manual-inventory>summary').click()
    page.get_by_role('button',name='Add Refrigerator',exact=True).click()
    contact(page)
    page.get_by_role('button',name='Publish moving request',exact=True).click()
    expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests[0].status',storage)=='open'
    context.close()
    print('PASS unconfigured-AI UI fallback: manual inventory unchanged, editable, and publishable; no fabricated detections or bookings.')

    # These use the real local /api/scan parser with provider responses mocked by the fixture.
    for scenario in ['wrapped', 'malformed', 'empty']:
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page();page.set_default_timeout(7000)
        moving(page)
        initial=page.locator('.inventory-list').inner_text()
        page.get_by_label('Furniture photos',exact=True).set_input_files(str(photo))
        page.get_by_label('I have permission to send these photos').check()
        with page.expect_response(lambda response:response.url.endswith('/api/scan') and response.request.method=='POST') as pending:
            page.get_by_role('button',name='Analyze photos',exact=True).click()
        response=pending.value
        assert response.status==(502 if scenario=='malformed' else 200)
        if scenario=='wrapped':
            expect(page.locator('.scan-review-row')).to_have_count(3)
            expect(page.get_by_role('button',name='Publish moving request',exact=True,include_hidden=True)).to_be_disabled()
            page.get_by_role('button',name='Keep manual inventory',exact=True).click()
        elif scenario=='malformed':
            assert response.json()['code']=='invalid_ai_response'
            assert response.headers.get('x-request-id')
            expect(page.get_by_role('alert')).to_contain_text('could not be read')
        else:
            expect(page.get_by_text('No furniture was identified.',exact=False)).to_be_visible()
        expect(page.locator('.scan-review')).to_have_count(0)
        assert page.locator('.inventory-list').inner_text()==initial
        page.locator('.manual-inventory>summary').click()
        page.get_by_role('button',name='Add Sofa',exact=True).click()
        assert page.locator('.inventory-list').inner_text()!=initial
        page.get_by_role('button',name='Continue to estimate',exact=True).click()
        expect(page.get_by_role('button',name='Publish moving request',exact=True)).to_be_enabled()
        assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests.length',storage)==0
        for width in [360,390]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        context.close()
        print('PASS '+scenario+' provider response: real parser, mandatory review/manual fallback, no request auto-published, 360/390px.')
    browser.close()
