"""HTTP-mocked Auth UI checks. Does not verify hosted Auth, mail, or live Storage."""
import argparse
import base64
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import secrets
from threading import Thread
import time
from urllib.parse import parse_qs, urlparse
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright
from browser_artifacts import capture

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--app-dir', required=True)
args = parser.parse_args()
# Auth callbacks cross SDK/session and React updates; keep assertions bounded together.
expect.set_options(timeout=15000)


@contextmanager
def app_server():
    with ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=args.app_dir)) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()
            thread.join()


with app_server() as base_url, sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'))
    for role, workspace in [('owner', 'Owner desk'), ('renter', 'Moving services'), ('mover', 'Mover desk')]:
        context = browser.new_context(viewport={'width':1440,'height':1000})
        page = context.new_page()
        page.set_default_timeout(15000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        uid = str(uuid4())
        email = role+'-'+str(uuid4())[:8]+'@example.test'
        password = secrets.token_urlsafe(24)
        profile = {'id':uid,'role':role,'display_name':'UI fixture '+role,'phone':'01812345678','service_area':'Banasree','is_available':True}
        user = {'id':uid,'email':email,'aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}
        encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
        token = '.'.join([encode({'alg':'HS256','typ':'JWT'}), encode({'sub':uid,'aud':'authenticated','role':'authenticated','exp':int(time.time())+3600}), secrets.token_urlsafe(32)])
        signup_roles = []
        recovery_requests = []
        password_updates = []
        auth_state={'signed_in':False}
        scan_requests=[]
        property_fixture={'id':str(uuid4()),'owner_id':str(uuid4()),'owner_name':'Fixture owner','title':'Browser test apartment (synthetic)',
            'status':'published','is_demo':False,'rent':19000,'beds':2,'baths':1,'sqft':1100,'floor':3,'lift':True,'parking':False,'balcony':True,
            'area':'Banasree','block':'Test Block','available':'2026-11-15','description':'Synthetic browser fixture','property_images':[]}

        def respond(route, body, status=200):
            route.fulfill(status=status, content_type='application/json', body=json.dumps(body), headers={
                'Access-Control-Allow-Origin':'*',
                'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version,accept-profile,content-profile,prefer,range',
                'Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS',
            })

        def api(route):
            request = route.request
            if request.method == 'OPTIONS':
                respond(route, {})
            elif '/auth/v1/signup' in request.url:
                signup_roles.append(request.post_data_json['data']['role'])
                respond(route, user)  # Confirmation required: deliberately no session.
            elif '/auth/v1/token' in request.url:
                if request.post_data_json['email'] != email:
                    respond(route, {'error':'invalid_grant','error_description':'Invalid login credentials'}, 400)
                else:
                    auth_state['signed_in']=True
                    respond(route, {'access_token':token,'refresh_token':secrets.token_urlsafe(32),'expires_in':3600,'token_type':'bearer','user':user})
            elif '/auth/v1/user' in request.url:
                if request.method == 'PUT':
                    password_updates.append(request.post_data_json.get('password'))
                respond(route, user)
            elif '/auth/v1/recover' in request.url:
                recovery_requests.append({'url':request.url,'body':request.post_data_json})
                respond(route, {})
            elif '/auth/v1/logout' in request.url:
                auth_state['signed_in']=False
                respond(route, {})
            elif '/rest/v1/properties' in request.url:
                respond(route,[property_fixture])
            elif '/rest/v1/profiles' in request.url:
                respond(route, profile)
            elif '/rest/v1/rpc/mover_summaries' in request.url:
                respond(route, [profile] if role == 'mover' else [])
            else:
                respond(route, [])

        page.route('http://127.0.0.1:54329/**', api)
        page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
        page.route('https://fonts.gstatic.com/**', lambda route: route.abort())
        page.goto(base_url+'?demo=1', wait_until='domcontentloaded')
        expect(page.locator('.home-card')).to_have_count(1)
        assert 'demo=' not in page.url
        expect(page.get_by_text('Exact preference match',exact=True)).to_have_count(0)
        page.get_by_role('button',name='Plan a move',exact=True).click()
        expect(page.get_by_role('heading',name='Renter / ভাড়াটিয়া account required')).to_be_visible()
        page.get_by_role('button',name='BashaShift home',exact=True).click()
        page.get_by_role('button', name='Sign in', exact=True).click()
        dialog = page.get_by_role('dialog', name='Account access')
        dialog.get_by_role('button', name='New here? Create an account', exact=True).click()
        dialog.get_by_role('combobox', name='Account role').select_option(role)
        dialog.get_by_label('Full name', exact=True).fill(profile['display_name'])
        dialog.get_by_label('Bangladesh phone number', exact=True).fill(profile['phone'])
        dialog.get_by_label('Email address', exact=True).fill(email)
        dialog.get_by_label('Password', exact=True).fill(password)
        dialog.get_by_role('button', name='Create account', exact=True).click()
        expect(dialog.get_by_role('status')).to_contain_text('Check your email')
        assert signup_roles == [role]
        assert page.get_by_role('button', name='Sign out', exact=True).count() == 0
        dialog.get_by_role('button', name='Already registered? Sign in', exact=True).click()
        dialog.get_by_role('button', name='Forgot password?', exact=True).click()
        dialog.get_by_label('Email address', exact=True).fill(email)
        dialog.get_by_role('button', name='Send reset link', exact=True).click()
        expect(dialog.get_by_role('status')).to_contain_text('If an account exists for this email')
        assert len(recovery_requests) == 1
        assert recovery_requests[0]['body']['email'] == email
        assert parse_qs(urlparse(recovery_requests[0]['url']).query)['redirect_to'] == [base_url]
        dialog.get_by_role('button', name='Back to sign in', exact=True).click()
        dialog.get_by_label('Email address', exact=True).fill('invalid@example.test')
        dialog.get_by_label('Password', exact=True).fill(password)
        dialog.get_by_role('button', name='Sign in', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Invalid login credentials')
        dialog.get_by_label('Email address', exact=True).fill(email)
        dialog.get_by_role('button', name='Sign in', exact=True).click()
        dialog.wait_for(state='hidden')
        page.get_by_role('button', name='Sign out', exact=True).wait_for()
        page.get_by_role('navigation', name='Main navigation').get_by_role('button', name=workspace, exact=True).click()
        if role == 'owner':
            expect(page.get_by_label('Owner name *', exact=True)).to_have_value(profile['display_name'])
        elif role == 'renter':
            # Authenticated UI journey; both Auth and the provider endpoint are HTTP fixtures.
            page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Explore homes',exact=True).click()
            expect(page.locator('.home-card')).to_have_count(1)
            expect(page.locator('.match-reasons li')).to_have_count(0)
            expect(page.get_by_label('Maximum monthly rent',exact=True)).to_have_count(1)
            page.get_by_label('Maximum monthly rent',exact=True).fill('20000')
            expect(page.get_by_text('Matches your filters',exact=True)).to_be_visible()
            expect(page.get_by_text('Preference/value score:',exact=False)).not_to_be_visible()
            page.get_by_text('More preferences',exact=False).click()
            page.get_by_label('Lift / লিফট required',exact=True).check()
            page.get_by_label('Preferred area',exact=True).select_option('Mirpur')
            expect(page.get_by_text('Partial preference match',exact=True)).to_be_visible()
            expect(page.locator('.home-card')).to_have_count(1)
            page.get_by_label('Preferred area',exact=True).select_option('Banasree')
            expect(page.get_by_text('Exact preference match',exact=True)).to_be_visible()
            page.get_by_text('More preferences',exact=False).click()
            capture(page,'home-search-auth-mocked')
            page.get_by_role('navigation',name='Main navigation').get_by_role('button',name='Moving services',exact=True).click()
            expect(page.locator('.budget-range')).to_have_count(0)
            page.get_by_role('button',name='Continue to furniture',exact=True).click()
            def scan(route):
                assert route.request.headers.get('authorization')=='Bearer '+token
                assert 'x-bashashift-demo' not in route.request.headers
                body=route.request.post_data_json
                assert body['consent'] is True and len(body['images'])==1
                scan_requests.append(True)
                respond(route,{'source':'cloudflare','model':'@cf/mistralai/mistral-small-3.1-24b-instruct','reviewRequired':True,'items':[
                    {'name':'Bed','qty':2,'confidence':'high'},{'name':'Boxes','qty':4,'confidence':'medium'}]})
            page.route('**/api/scan',scan)
            initial=page.locator('.inventory-list').inner_text()
            page.get_by_label('Furniture photos',exact=True).set_input_files('docs/prototype-desktop.png')
            expect(page.get_by_role('button',name='Analyze photos',exact=True)).to_be_disabled()
            page.get_by_label('I have permission to send these photos').check()
            page.get_by_role('button',name='Analyze photos',exact=True).click()
            expect(page.locator('.scan-review-row')).to_have_count(2)
            assert page.locator('.inventory-list').inner_text()==initial
            expect(page.get_by_role('button',name='Continue to estimate',exact=True)).to_be_disabled()
            capture(page,'ai-review-auth-mocked')
            page.get_by_label('Detected Bed quantity',exact=True).fill('3')
            page.get_by_role('button',name='Apply reviewed inventory',exact=True).click()
            expect(page.locator('.budget-range')).to_have_text('৳2,420–৳3,630')
            assert page.locator('.budget-range').inner_text()
            page.get_by_role('button',name='Continue to estimate',exact=True).click()
            expect(page.get_by_label('Your name *', exact=True)).to_have_value(profile['display_name'])
            assert scan_requests==[True]
            capture(page,'moving-estimate-auth-mocked')
        else:
            page.get_by_text('Profile & service area · আপনার তথ্য',exact=True).click()
            expect(page.get_by_role('button', name='Save mover profile', exact=True)).to_be_visible()
            assert page.get_by_text('Choose demo worker / registered worker', exact=True).count() == 0
        assert page.evaluate("localStorage.getItem('bashashift-prototype-v1')") is None
        capture(page,role+'-authenticated-mocked')
        for width in [360,390]:
            page.set_viewport_size({'width':width,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile overflow'
        page.get_by_role('button', name='Sign out', exact=True).click()
        page.get_by_role('button', name='Sign in', exact=True).wait_for()
        recovery_token = secrets.token_urlsafe(32)
        page.goto(f'{base_url}/?callback=1#access_token={token}&refresh_token={recovery_token}&expires_in=3600&token_type=bearer&type=recovery', wait_until='domcontentloaded')
        dialog = page.get_by_role('dialog', name='Account access')
        expect(dialog.get_by_role('heading', name='Choose a new password')).to_be_visible()
        dialog.get_by_label('Password', exact=True).fill('a-new-secure-password')
        dialog.get_by_label('Confirm new password', exact=True).fill('a-different-password')
        dialog.get_by_role('button', name='Update password', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Passwords do not match')
        assert password_updates == []
        dialog.get_by_label('Password', exact=True).fill('a-new-secure-password')
        dialog.get_by_label('Confirm new password', exact=True).fill('a-new-secure-password')
        dialog.get_by_role('button', name='Update password', exact=True).click()
        expect(dialog.get_by_role('status')).to_contain_text('Your password has been updated')
        assert password_updates == ['a-new-secure-password']
        dialog.get_by_role('button', name='Continue to BashaShift', exact=True).click()
        assert not errors, errors
        context.close()
        print(f'PASS mocked Auth UI ({role}): signup, reset email, reset callback, password update, login, sign out, role workspace, mobile layout, demo isolation.')
    browser.close()
