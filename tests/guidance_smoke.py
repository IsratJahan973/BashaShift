"""Synthetic fixtures exercise real guidance components; no live accounts or APIs."""
import os
from playwright.sync_api import expect, sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    for width in [360,390]:
        page=browser.new_page(viewport={'width':width,'height':844})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/api/scan',lambda route:route.fulfill(
            status=200,content_type='application/json',
            body='{"source":"cloudflare","reviewRequired":true,"items":[{"name":"Bed","qty":2,"confidence":"medium"}]}'))
        page.goto(os.environ.get('BASHASHIFT_GUIDANCE_URL','http://127.0.0.1:5192')+'/tests/fixtures/guidance.html')
        results=page.get_by_label('Ranked apartments')
        expect(results.locator('article')).to_have_count(2)
        expect(results.locator('article').nth(0).get_by_role('heading')).to_have_text('Test apartment B')
        page.get_by_text('More preferences',exact=False).click()
        page.get_by_label('Lift / লিফট required',exact=True).check()
        expect(results.locator('article')).to_have_count(1)
        expect(results.get_by_text('Matches your requirements',exact=True)).to_be_visible()
        results.get_by_text('Why this match?',exact=True).click()
        expect(results.get_by_text('৳0 below your limit.',exact=False)).to_be_visible()
        expect(results.get_by_text('Preference/value score:',exact=False)).to_be_visible()
        page.get_by_label('Parking / পার্কিং preferred',exact=True).check()
        expect(results.get_by_text('Partial preference match',exact=True)).to_be_visible()
        page.get_by_label('Maximum monthly rent',exact=True).fill('10000')
        expect(results.locator('article')).to_have_count(0)
        page.get_by_label('Maximum monthly rent',exact=True).fill('20000')
        page.get_by_label('Quotation priority').select_option('reliability')
        expect(page.get_by_text('No reviews yet / এখনো রিভিউ নেই',exact=True)).to_have_count(2)
        page.get_by_role('button',name='Choose',exact=True).nth(1).click()
        expect(page.get_by_text('Selected: b; statuses: not_selected,selected',exact=True)).to_be_visible()
        panel=page.get_by_role('region',name='Mover pricing assistant')
        panel.get_by_text('Optional pricing helper',exact=False).first.click()
        panel.get_by_text('How calculated · Edit assumptions',exact=True).click()
        for name,value in [('Base (BDT)','100'),('Per km (BDT)','20'),('Per effort unit (BDT)','30'),('Per stair-floor × unit (BDT)','5')]:
            panel.get_by_label(name,exact=True).fill(value)
        expect(panel.locator('.budget-range')).to_have_text('৳680–৳1,020')
        expect(page.get_by_label('Independent quotation')).to_have_value('4500')
        page.get_by_label('Furniture photos',exact=True).set_input_files('docs/prototype-desktop.png')
        expect(page.get_by_role('button',name='Analyze photos',exact=True)).to_be_disabled()
        page.get_by_label('I have permission to send these photos').check()
        page.get_by_role('button',name='Analyze photos',exact=True).click()
        expect(page.get_by_label('Detected Bed quantity',exact=True)).to_be_visible()
        expect(page.get_by_label('Approved inventory',exact=True)).to_have_text('Bed 2, Boxes 4')
        page.get_by_label('Detected Bed quantity',exact=True).fill('3')
        page.get_by_role('button',name='Apply reviewed inventory',exact=True).click()
        expect(page.get_by_label('Approved inventory',exact=True)).to_have_text('Bed 3')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'Horizontal overflow'
        assert errors==[],errors
        page.close()
        print(f'Guidance smoke passed: {width}px, deterministic rankings, renter choice, editable budgets, consent and manual review (mocked AI).')
    browser.close()
