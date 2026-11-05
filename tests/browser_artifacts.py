"""Optional local review artifacts. Screenshots contain synthetic test data, not live evidence."""
import os
import re
from pathlib import Path


def capture(page, name):
    directory=os.environ.get('BASHASHIFT_SCREENSHOT_DIR')
    if not directory:
        return
    target=Path(directory)
    target.mkdir(parents=True,exist_ok=True)
    dismiss=page.get_by_role('button',name='Dismiss',exact=True)
    if dismiss.is_visible():
        dismiss.click()
    viewport=page.viewport_size
    for width in [1440,390,360]:
        page.set_viewport_size({'width':width,'height':1000 if width==1440 else 844})
        page.evaluate('window.scrollTo(0,0)')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name+' overflows'
        private_inputs=page.locator('input[aria-label*="phone" i], input[aria-label*="ফোন"], input[type="email"], input[type="password"]')
        private_text=page.get_by_text(re.compile(r'\b01[3-9]\d{8}\b|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))
        page.screenshot(path=str(target/(name+'-'+str(width)+'.png')),full_page=True,
            mask=[private_inputs,private_text,page.locator('a[href^="tel:"]')],mask_color='#64786b')
    page.set_viewport_size(viewport)
