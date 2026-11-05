"""Authenticated route UI with mocked road API and tiles; no live route/tile requests."""
import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from playwright.async_api import async_playwright,expect

parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--base-url',required=True);args=parser.parse_args()
centers={'Banasree':[90.43128,23.76171],'Mirpur':[90.36409,23.81236],'Mohammadpur':[90.36033,23.76324],'Rampura':[90.42057,23.76261],'Uttara':[90.39269,23.86933]}
pixel=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
expect.set_options(timeout=20000)
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
        page=await browser.new_page(viewport={'width':390,'height':844});page.set_default_timeout(20000)
        errors=[];requests=[];chunks=[];tiles=[];mode={'value':'normal','tile_fail':False}
        held=asyncio.Event();release=asyncio.Event();settled=asyncio.Event()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('request',lambda request:chunks.append(request.url) if 'leaflet-src-' in request.url else None)
        await page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        await page.route('https://fonts.gstatic.com/**',lambda route:route.abort())
        async def tile(route):
            tiles.append(route.request.url)
            if mode['tile_fail']:await route.abort()
            else:await route.fulfill(status=200,content_type='image/png',body=pixel)
        await page.route('https://tile.openstreetmap.org/**',tile)
        def response(start,end,km):
            a,b=centers[start],centers[end]
            return {'from':start,'to':end,'source':'heigit','approximate':True,'distanceKm':km,
                'geometry':{'type':'LineString','coordinates':[a,[(a[0]+b[0])/2,(a[1]+b[1])/2+.001],b]}}
        async def routes(route):
            query=parse_qs(urlparse(route.request.url).query);start,end=query['from'][0],query['to'][0];requests.append((start,end))
            assert route.request.headers.get('authorization','').startswith('Bearer ')
            if start==end:
                await route.fulfill(status=422,json={'error':'Same neighborhood. Enter distance manually.'});return
            if mode['value']=='error':await route.fulfill(status=503,json={'error':'Driving distance is unavailable. Enter distance manually.'});return
            if mode['value']=='malformed':await route.fulfill(status=200,json={**response(start,end,12),'distanceKm':'invented'});return
            if mode['value']=='held' and end=='Mirpur':
                held.set();await release.wait()
                try:await route.fulfill(status=200,json=response(start,end,30))
                except Exception:pass  # The actual browser aborts a stale request.
                settled.set();return
            await route.fulfill(status=200,json=response(start,end,30 if end=='Mirpur' else 10))
        await page.route('**/api/route?**',routes)
        await page.goto(args.base_url)
        await page.get_by_role('button',name='Sign in',exact=True).click()
        dialog=page.get_by_role('dialog',name='Account access')
        await dialog.locator('.role-options button').nth(1).click()
        await dialog.get_by_label('Email address',exact=True).fill('R1@example.test')
        await dialog.get_by_label('Password',exact=True).fill('isolated-test-password')
        await dialog.get_by_role('button',name='Sign in',exact=True).click();await expect(dialog).not_to_be_visible()
        await page.get_by_role('button',name='Toggle navigation / মেনু').click()
        await page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Moving services',exact=True).click()
        km=page.get_by_label('Approx. distance (km)',exact=True);destination=page.get_by_label('Moving to',exact=True)
        await expect(km).to_have_value('');await km.fill('2')
        await page.get_by_role('button',name='Continue to furniture',exact=True).click()
        await page.locator('.manual-inventory>summary').click();await page.get_by_role('button',name='Add Bed',exact=True).click()
        await page.get_by_role('button',name='Previous step',exact=True).click()
        await destination.select_option('Mirpur');await expect(km).to_have_value('30')
        await expect(page.locator('.budget-range')).to_have_text('৳2,120–৳3,180')
        assert not chunks and not tiles,'Map must be lazy'
        await page.get_by_text('View route',exact=True).click()
        await expect(page.locator('.leaflet-overlay-pane path')).to_have_count(1)
        await expect(page.get_by_title('Start near Banasree',exact=True)).to_be_visible()
        await expect(page.get_by_title('End near Mirpur',exact=True)).to_be_visible()
        await expect(page.locator('.leaflet-control-attribution').get_by_role('link',name='OpenStreetMap',exact=True)).to_be_visible()
        assert chunks and tiles
        for width in [360,390,1440]:
            await page.set_viewport_size({'width':width,'height':844})
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            await page.get_by_role('button',name='Reset map view',exact=True).click()
            if os.environ.get('BASHASHIFT_SCREENSHOT_DIR'):
                folder=Path(os.environ['BASHASHIFT_SCREENSHOT_DIR']);folder.mkdir(parents=True,exist_ok=True)
                await page.screenshot(path=str(folder/f'route-map-mocked-{width}.png'),full_page=True,mask=[page.locator('input[aria-label*="Phone" i],input[aria-label*="phone" i],input[type=email],input[type=password]')],mask_color='#64786b')
        mode['tile_fail']=True
        await page.get_by_role('button',name='Zoom in',exact=True).click()
        await expect(page.get_by_text('Map tiles are unavailable.',exact=False)).to_be_visible()
        await expect(km).to_have_value('30')
        await destination.select_option('Mohammadpur');await expect(km).to_have_value('10')
        await expect(page.locator('.budget-range')).to_have_text('৳1,400–৳2,100')
        assert ('Banasree','Mirpur') in requests and ('Banasree','Mohammadpur') in requests
        print('PASS routing UI: distinct authenticated area requests → road distance → immediate budget, lazy map/polyline/markers/attribution, tile failure, 360/390/desktop (mocked API/tiles)')
        mode['value']='held';await destination.select_option('Mirpur');await asyncio.wait_for(held.wait(),10)
        await expect(km).to_have_value('');await expect(page.locator('.budget-range')).to_have_count(0)
        await destination.select_option('Mohammadpur');await expect(km).to_have_value('10')
        release.set();await asyncio.wait_for(settled.wait(),10);await expect(km).to_have_value('10')
        mode['value']='normal';await km.fill('7');await expect(page.get_by_text('Manual distance — not verified by a routing service.',exact=True)).to_be_visible()
        # A manual override is preserved across step changes and component remounts.
        await page.get_by_role('button',name='Continue to furniture',exact=True).click()
        await page.get_by_role('button',name='Previous step',exact=True).click();await expect(km).to_have_value('7')
        before=len(requests)
        await page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Explore homes',exact=True).click()
        await page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Moving services',exact=True).click()
        await expect(km).to_have_value('7');assert len(requests)==before
        await page.get_by_role('button',name='Use road distance',exact=True).click();await expect(km).to_have_value('10')
        mode['value']='held';held.clear();release.clear();settled.clear()
        await destination.select_option('Mirpur');await asyncio.wait_for(held.wait(),10);await km.fill('9')
        release.set();await asyncio.wait_for(settled.wait(),10);await expect(km).to_have_value('9')
        print('PASS routing stale-response cancellation, pending budget suppression, explicit manual override and deliberate recalculation')
        mode['value']='error';await destination.select_option('Uttara');await expect(km).to_have_value('')
        await expect(page.get_by_text('Driving distance is unavailable. Enter distance manually.',exact=True)).to_be_visible()
        await km.fill('6');await expect(page.locator('.budget-range')).to_have_text('৳1,256–৳1,884')
        mode['value']='malformed';await page.get_by_label('Moving from',exact=True).select_option('Rampura')
        await expect(page.get_by_text('Driving distance could not be verified. Enter distance manually.',exact=True)).to_be_visible();await expect(km).to_have_value('')
        await km.fill('6');await page.get_by_role('button',name='Continue to furniture',exact=True).click()
        await expect(page.get_by_role('heading',name='Furniture · Scan with AI',exact=True)).to_be_visible()
        assert not errors,errors
        print('PASS routing outage/malformed output: no invented or old distance, manual fallback preserves submission flow. Live routing NOT VERIFIED.')
        await browser.close()
asyncio.run(main())
