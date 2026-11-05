"""Seven isolated authenticated browsers: real embedded RLS/RPCs, mocked Auth and Cloudflare.
Never creates hosted accounts, changes production data or proves live AI accuracy.
"""
import argparse
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from browser_artifacts import capture

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',required=True)
args=parser.parse_args()
photo=Path(__file__).resolve().parent.parent/'docs/prototype-desktop.png'
expect.set_options(timeout=30000)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    pages={};errors=[]
    def new_page():
        page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(30000)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
        return page
    def nav(page,name):
        if page.viewport_size['width']<1000:
            page.get_by_role('button',name='Toggle navigation / মেনু').click()
        page.get_by_role('navigation',name='Main navigation').get_by_role('button',name=name,exact=True).click()
    def login(key):
        page=new_page();page.goto(args.base_url+'?demo=1')
        page.get_by_role('button',name='Sign in',exact=True).click()
        dialog=page.get_by_role('dialog',name='Account access')
        role='renter' if key.startswith('R') else 'owner' if key.startswith('O') else 'mover'
        dialog.locator('.role-options button').nth({'owner':0,'renter':1,'mover':2}[role]).click()
        dialog.get_by_label('Email address',exact=True).fill(key+'@example.test')
        dialog.get_by_label('Password',exact=True).fill('isolated-test-password')
        dialog.get_by_role('button',name='Sign in',exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(page.get_by_role('button',name='Sign out',exact=True)).to_be_visible()
        assert 'demo=' not in page.url
        pages[key]=page;return page
    def refresh(page):
        page.get_by_role('button',name='Refresh listings',exact=True).click()
        expect(page.get_by_role('button',name='Refresh listings',exact=True)).to_be_enabled()
    def moving(page,origin='Rampura',destination='Banasree'):
        nav(page,'Explore homes')
        nav(page,'Moving services')
        page.get_by_label('Moving from',exact=True).select_option(origin)
        page.get_by_label('Moving to',exact=True).select_option(destination)
        page.get_by_label('Approx. distance (km)',exact=True).fill('8')
        page.get_by_label('Destination floor',exact=True).fill('3')
        page.get_by_label('Working lift accessible at both buildings').uncheck()
        page.get_by_role('button',name='Continue to furniture',exact=True).click()
    def upload(page):
        page.get_by_label('Furniture photos',exact=True).set_input_files([str(photo),str(photo)])
        expect(page.get_by_role('button',name='Analyze photos',exact=True)).to_be_disabled()
        page.get_by_label('I have permission to send these photos').check()
        with page.expect_response(lambda r:r.url.endswith('/api/scan') and r.request.method=='POST') as pending:
            page.get_by_role('button',name='Analyze photos',exact=True).click()
        return pending.value
    def publish(page):
        page.get_by_role('button',name='Continue to estimate',exact=True).click()
        page.get_by_label('I agree to share my phone number').check()
        page.get_by_role('button',name='Publish moving request',exact=True).click()
        expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
        expect(page.locator('.request-card')).to_have_count(1)
    def responsive(page,name):
        capture(page,name)
        for width in [360,390,1440]:
            page.set_viewport_size({'width':width,'height':844 if width<1000 else 1000})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),name+' overflow '+str(width)

    owner=login('O1')
    # All data is explicitly labeled synthetic and stored only in this embedded DB.
    homes=[('P1','Banasree',15000,2,True,False),('P2','Banasree',22000,3,True,True),('P3','Rampura',18000,2,True,False),('P4','Mirpur',12000,1,False,False),('P5','Banasree',14000,2,False,False)]
    for key,area,rent,beds,lift,parking in homes:
        owner.get_by_role('button',name='Add property',exact=True).click()
        owner.get_by_label('Property title *',exact=True).fill('TEST '+key+' synthetic apartment')
        owner.get_by_label('Area *',exact=True).select_option(area)
        owner.get_by_label('Block / road *',exact=True).fill('TEST ONLY — not an available home')
        owner.get_by_label('Monthly rent (BDT) *',exact=True).fill(str(rent))
        owner.get_by_label('Bedrooms',exact=True).fill(str(beds))
        if lift:owner.get_by_role('checkbox',name='Lift / লিফট আছে',exact=True).check()
        if parking:owner.get_by_role('checkbox',name='Parking / গাড়ি রাখার জায়গা',exact=True).check()
        owner.get_by_role('button',name='Publish property',exact=True).click()
        expect(owner.get_by_role('heading',name='Your properties / আপনার বাসা')).to_be_visible()
    responsive(owner,'owner-live-only-isolated')

    guest=new_page()
    # A previously saved local demo must not activate, even through its old URL.
    guest.add_init_script("localStorage.setItem('bashashift-prototype-v1',JSON.stringify({listings:[{id:'fake-local',title:'LEGACY FAKE LISTING'}],requests:[],inquiries:[],workers:[]}))")
    guest.goto(args.base_url+'?demo=1')
    expect(guest.locator('.home-card')).to_have_count(5)
    expect(guest.get_by_text('LEGACY FAKE LISTING',exact=True)).to_have_count(0)
    expect(guest.get_by_text('Exact preference match',exact=True)).to_have_count(0)
    assert 'demo=' not in guest.url
    guest.get_by_role('button',name='Save listing',exact=True).first.click()
    expect(guest.get_by_role('dialog',name='Account access')).to_be_visible()
    guest.get_by_role('button',name='Close account dialog',exact=True).click()
    assert guest.locator('.hero').evaluate('(e)=>e.nextElementSibling.classList.contains("workflow-section")')
    guest.get_by_role('button',name='Plan a move',exact=True).click()
    expect(guest.get_by_role('heading',name='Renter / ভাড়াটিয়া account required')).to_be_visible()
    guest.get_by_role('button',name='BashaShift home',exact=True).click()
    responsive(guest,'home-live-only-public')

    for key,area,budget,beds,facility,expected in [('R1','Banasree','20000','2','Lift / লিফট required','P1'),('R2','Banasree','25000','3','Parking / পার্কিং required','P2'),('R3','Mirpur','14000','1',None,'P4')]:
        page=login(key);nav(page,'Explore homes')
        page.get_by_label('Area',exact=True).select_option(area)
        page.get_by_label('Maximum monthly rent',exact=True).fill(budget)
        page.get_by_label('Minimum bedrooms',exact=True).select_option(beds)
        page.get_by_text('More preferences',exact=False).click()
        if facility:page.get_by_label(facility,exact=True).check()
        expect(page.locator('.home-card')).to_have_count(1)
        expect(page.locator('.home-card h3')).to_have_text('TEST '+expected+' synthetic apartment')
        expect(page.get_by_text('Matches your filters',exact=True)).to_be_visible()
        expect(page.get_by_text('Exact preference match',exact=True)).to_have_count(0)
        assert page.locator('.match-reasons li').count()<=2
        page.get_by_text('Why this match?',exact=True).click()
        expect(page.get_by_text('Preference/value score:',exact=False)).to_have_count(0)
        if key=='R1':
            page.get_by_label('Maximum monthly rent',exact=True).fill('22500')
            page.get_by_label('Parking / পার্কিং preferred',exact=True).check()
            page.get_by_label('Apartment priority',exact=True).select_option('affordability')
            expect(page.locator('.home-card h3').first).to_have_text('TEST P1 synthetic apartment')
            page.get_by_label('Apartment priority',exact=True).select_option('facilities')
            expect(page.locator('.home-card h3').first).to_have_text('TEST P2 synthetic apartment')
            # Viewing request through the protected shared repository path.
            page.locator('.home-card').filter(has_text='TEST P1 synthetic apartment').get_by_role('button',name='View details',exact=True).click()
            dialog=page.get_by_role('dialog',name='Property details')
            expect(dialog.get_by_role('link',name='Call owner')).to_have_count(0)
            dialog.get_by_role('button',name='Send inquiry',exact=True).click()
            expect(page.get_by_role('heading',name='My requests',exact=True)).to_be_visible()
        print('PASS '+key+' hard filters and recommendation order (isolated RLS browser)')
    refresh(owner)
    expect(owner.get_by_text('TEST R1 · TEST P1 synthetic apartment',exact=True)).to_be_visible()
    owner.get_by_role('button',name='Acknowledge',exact=True).click()
    expect(owner.get_by_role('button',name='Undo',exact=True)).to_be_visible()

    renter=pages['R1'];moving(renter)
    initial=renter.locator('.inventory-list').inner_text()
    response=upload(renter);assert response.status==200,response.text()
    expect(renter.locator('.scan-review-row')).to_have_count(3)
    assert renter.locator('.inventory-list').inner_text()==initial
    expect(renter.get_by_role('button',name='Continue to estimate',exact=True)).to_be_disabled()
    expect(renter.get_by_role('button',name='Publish moving request',exact=True,include_hidden=True)).to_be_disabled()
    responsive(renter,'ai-review-authenticated-mocked-provider')
    renter.get_by_role('button',name='Previous step',exact=True).click()
    expect(renter.get_by_label('Approx. distance (km)',exact=True)).to_have_value('8')
    renter.get_by_role('button',name='Continue to furniture',exact=True).click()
    renter.get_by_label('Detected Bed quantity',exact=True).fill('3')
    renter.get_by_label('Detected Refrigerator quantity',exact=True).fill('0')
    renter.get_by_label('Detected Boxes quantity',exact=True).fill('5')
    renter.get_by_role('button',name='Apply reviewed inventory',exact=True).click()
    renter.locator('.manual-inventory>summary').click()
    renter.get_by_role('button',name='Add Sofa',exact=True).click()
    expect(renter.locator('.budget-range')).to_have_text('৳4,368–৳6,552')
    # Existing formula must react to all route/access inputs and keep reviewed items.
    renter.get_by_role('button',name='Previous step',exact=True).click()
    for field,value in [('Approx. distance (km)','9'),('Current floor','4'),('Destination floor','4')]:
        before=renter.locator('.budget-range').inner_text()
        renter.get_by_label(field,exact=True).fill(value)
        assert renter.locator('.budget-range').inner_text()!=before
    before=renter.locator('.budget-range').inner_text()
    renter.get_by_label('Working lift accessible at both buildings').check()
    assert renter.locator('.budget-range').inner_text()!=before
    renter.get_by_label('Approx. distance (km)',exact=True).fill('8')
    renter.get_by_label('Current floor',exact=True).fill('2')
    renter.get_by_label('Destination floor',exact=True).fill('3')
    renter.get_by_label('Working lift accessible at both buildings').uncheck()
    renter.get_by_role('button',name='Continue to furniture',exact=True).click()
    renter.get_by_role('button',name='Continue to estimate',exact=True).click()
    expect(renter.get_by_text('Illustrative estimate — not a mover quotation',exact=True)).to_be_visible()
    renter.get_by_text('How calculated · Edit assumptions',exact=True).click()
    renter.get_by_label('Base (BDT)',exact=True).fill('1000')
    expect(renter.locator('.budget-range')).to_have_text('৳4,488–৳6,732')
    responsive(renter,'moving-budget-authenticated-isolated')
    renter.get_by_role('button',name='Previous step',exact=True).click()
    publish(renter)
    print('PASS R1 authenticated sanitized photo → real parser (mocked provider) → mandatory review → reactive budget → request')

    # Remaining real parser cases keep manual inventory intact and never publish.
    for scenario in ['wrapped','malformed','empty','unconfigured']:
        moving(renter);initial=renter.locator('.inventory-list').inner_text()
        if scenario=='unconfigured':renter.route('**/api/scan',lambda route:route.fulfill(status=503,content_type='application/json',body='{"error":"AI is not configured. Enter items manually."}'))
        response=upload(renter)
        assert response.status==(502 if scenario=='malformed' else 503 if scenario=='unconfigured' else 200)
        if scenario=='wrapped':
            expect(renter.locator('.scan-review-row')).to_have_count(3)
            renter.get_by_role('button',name='Keep manual inventory',exact=True).click()
        elif scenario=='malformed':
            assert response.json()['code']=='invalid_ai_response' and response.headers.get('x-request-id')
            expect(renter.get_by_role('alert')).to_contain_text('could not be read')
        elif scenario=='empty':expect(renter.get_by_text('No furniture was identified.',exact=False)).to_be_visible()
        else:expect(renter.get_by_role('alert')).to_contain_text('not configured')
        expect(renter.locator('.scan-review')).to_have_count(0)
        assert renter.locator('.inventory-list').inner_text()==initial
        expect(renter.get_by_role('button',name='Continue to estimate',exact=True)).to_be_enabled()
        print('PASS '+scenario+' authenticated scan: manual fallback unchanged, no fabricated detections')

    for key,origin,destination in [('R2','Banasree','Rampura'),('R3','Rampura','Mirpur')]:
        page=pages[key];moving(page,origin,destination)
        page.locator('.manual-inventory>summary').click()
        page.get_by_role('button',name='Add Bed',exact=True).click()
        publish(page)
        expect(page.locator('a[href^="tel:"]')).to_have_count(0)

    for key,amount in [('M1','2500'),('M2','3000'),('M3','3400')]:
        page=login(key)
        expect(page.locator('.worker-job')).to_have_count(2)
        expect(page.locator('.worker-job').filter(has_text='Banasree → Rampura')).to_have_count(0)
        expect(page.locator('a[href^="tel:"]')).to_have_count(0)
        for destination in ['Banasree','Mirpur']:
            job=page.locator('.worker-job').filter(has_text='Rampura → '+destination)
            expect(job.get_by_label('Your quotation (BDT)',exact=True)).to_have_value('')
            job.get_by_text('Optional pricing helper',exact=False).click()
            expect(job.get_by_label('Your quotation (BDT)',exact=True)).to_have_value('')
            job.get_by_label('Your quotation (BDT)',exact=True).fill(amount)
            job.get_by_role('button',name='Submit quotation',exact=True).click()
            expect(job.get_by_role('button',name='Quotation submitted',exact=True)).to_be_disabled()
        responsive(page,'mover-'+key+'-authenticated-isolated')
        print('PASS '+key+' eligible pickup jobs, independent quotation, protected contacts (isolated RLS browser)')
    nav(renter,'My requests 1');refresh(renter)
    expect(renter.locator('.offer')).to_have_count(3)
    expect(renter.get_by_text('No reviews yet / এখনো রিভিউ নেই',exact=True)).to_have_count(3)
    expect(renter.locator('a[href^="tel:"]')).to_have_count(0)
    renter.locator('.offer').filter(has_text='TEST M2').get_by_role('button',name='Choose',exact=True).click()
    expect(renter.get_by_role('button',name='Mark confirmed after call',exact=True)).to_be_visible()
    expect(renter.locator('.offer')).to_have_count(0)
    expect(renter.locator('a[href^="tel:"]')).to_have_count(1)
    for key in ['M1','M2','M3']:
        page=pages[key];refresh(page)
        expect(page.locator('a[href^="tel:"]')).to_have_count(1 if key=='M2' else 0)
    renter.get_by_role('button',name='Mark confirmed after call',exact=True).click()
    expect(renter.get_by_text('Confirmed by customer / গ্রাহক নিশ্চিত করেছেন',exact=True)).to_be_visible()
    refresh(pages['M2'])
    expect(pages['M2'].locator('.worker-confirmed')).to_have_count(1)
    responsive(renter,'renter-confirmed-authenticated-isolated')
    print('PASS R1 selects non-cheapest M2; competing offers excluded, only selected mover receives contact; renter confirms')
    r3=pages['R3'];refresh(r3)
    r3.locator('.offer').filter(has_text='TEST M1').get_by_role('button',name='Choose',exact=True).click()
    expect(r3.get_by_role('button',name='Decline & reopen',exact=True)).to_be_visible()
    r3.get_by_role('button',name='Decline & reopen',exact=True).click()
    expect(r3.get_by_text('Waiting for mover quotations.',exact=True)).to_be_visible()
    expect(r3.locator('a[href^="tel:"]')).to_have_count(0)
    refresh(pages['M1']);expect(pages['M1'].locator('a[href^="tel:"]')).to_have_count(0)
    print('PASS R3 reopens own request and revokes prior mover contact; R1 booking remains confirmed')
    # Owner editing/unpublishing uses the same hosted repository functions.
    row=owner.locator('.mini-entry').filter(has_text='TEST P5 synthetic apartment')
    row.get_by_role('button',name='Edit / বদলান',exact=True).click()
    expect(owner.get_by_label('Size (sqft)',exact=True)).to_have_value('')
    owner.get_by_label('Monthly rent (BDT) *',exact=True).fill('14500')
    owner.get_by_role('button',name='Save and publish',exact=True).click()
    expect(owner.get_by_role('heading',name='Your properties / আপনার বাসা')).to_be_visible()
    row.get_by_role('button',name='Unpublish / সরান',exact=True).click()
    expect(row).to_contain_text('archived')
    refresh(guest);expect(guest.locator('.home-card')).to_have_count(4)
    print('PASS O1 published, edited, unpublished and acknowledged a viewing; public feed excludes archived property')
    assert not errors,errors
    browser.close()
    print('PASS all seven actors; desktop/360/390px; ?demo=1 cannot activate local fake data. Hosted Auth/live AI NOT TESTED.')
