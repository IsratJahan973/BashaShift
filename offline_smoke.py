"""Optional browser smoke test (requires playwright + Chromium).
Tests HTML using set_content and a mocked localStorage because this sandbox forbids local file/navigation.
In a normal development environment prefer launching a local http.server and testing live origin persistence.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).parent.parent
html=(root/'standalone-demo.html').read_text().replace('<link rel="stylesheet" href="src/styles.css">','<style>'+(root/'src/styles.css').read_text()+'</style>')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page();page.set_default_timeout(4000)
    page.evaluate("Object.defineProperty(window,'localStorage',{configurable:true,value:{data:{},getItem(k){return this.data[k]||null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}}})")
    page.on('dialog',lambda d:d.accept())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html)
    assert page.locator('.home-card').count()==6
    page.evaluate("go('moving')")
    page.locator('input[name=name]').fill('Demo Customer')
    page.locator('input[name=phone]').fill('01712345678')
    page.locator('input[name=consent]').check()
    page.get_by_role('button',name='Create moving request').click()
    assert page.evaluate('db.requests.length')==1
    page.evaluate("go('worker')")
    page.get_by_role('button',name='Accept / Send offer').click()
    assert page.evaluate('db.requests[0].offers.length')==1
    page.evaluate("go('activity')")
    page.get_by_role('button',name='Choose').click()
    assert page.evaluate('db.requests[0].status')=='awaiting_call'
    page.get_by_role('button',name='Confirm after phone call').click()
    assert page.evaluate('db.requests[0].status')=='confirmed'
    assert not errors,errors
    print('PASS: 6 sample listings; renter creates request; local mover offers; customer selects and confirms; 0 page errors.')
    browser.close()
