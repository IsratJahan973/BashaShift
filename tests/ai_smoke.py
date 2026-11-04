"""Real photo-upload route with mocked OpenAI, and a browser-local moving request."""
import argparse
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

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
        page.goto(args.base_url+'?demo=1')
        page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Moving services',exact=True).click()

    def contact(page):
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
    expect(page.get_by_role('button',name='Publish moving request',exact=True)).to_be_disabled()
    assert page.locator('.inventory-list').inner_text()==initial,'AI must not auto-add to example inventory'
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests.length',storage)==0
    page.get_by_label('Detected Bed quantity',exact=True).fill('3')
    page.get_by_label('Detected Refrigerator quantity',exact=True).fill('0')
    page.get_by_label('Detected Boxes quantity',exact=True).fill('5')
    page.get_by_role('button',name='Apply reviewed inventory',exact=True).click()
    page.get_by_role('button',name='Add Sofa',exact=True).click()
    page.get_by_label('Approx. distance (km)',exact=True).fill('8')
    page.get_by_label('Destination floor',exact=True).fill('3')
    page.get_by_label('Working lift accessible at both buildings').uncheck()
    expect(page.locator('.quote-total strong')).to_have_text('৳3,800')
    expect(page.get_by_label('Moving cost breakdown')).to_contain_text('Furniture handling')
    expect(page.get_by_label('Moving cost breakdown')).to_contain_text('৳2,080')
    for width in [390,360]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Photo review overflows mobile width'
    page.set_viewport_size({'width':1440,'height':1000})
    contact(page)
    page.get_by_role('button',name='Publish moving request',exact=True).click()
    expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
    data=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',storage)
    request=data['requests'][0]
    assert {item['name']:item['qty'] for item in request['items']}=={'Bed':3,'Boxes':5,'Sofa':1}
    assert request['estimate']==3800 and request['status']=='open' and request['offers']==[] and request['selectedOfferId'] is None
    assert all(worker['sample'] for worker in data['workers'])
    assert not errors,errors
    context.close()
    print('PASS photo → real validated backend → mocked OpenAI → edited/approved inventory → manual addition → transparent ৳3,800 estimate → open demo moving request; 360/390px responsive.')

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
    page.get_by_role('button',name='Add Refrigerator',exact=True).click()
    contact(page)
    page.get_by_role('button',name='Publish moving request',exact=True).click()
    expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
    assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).requests[0].status',storage)=='open'
    context.close();browser.close()
    print('PASS unconfigured-AI UI fallback: manual inventory unchanged, editable, and publishable; no fabricated detections or bookings.')
