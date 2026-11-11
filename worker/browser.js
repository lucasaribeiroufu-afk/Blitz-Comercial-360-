import {chromium as playwright} from 'playwright-core';

export async function launchBrowser(options={}) {
  if (process.env.VERCEL) {
    const {default: chromium}=await import('@sparticuz/chromium');
    // Vercel isolates each function; Chromium's OS sandbox cannot run there.
    // Keep TLS and browser origin protections enabled.
    const args=chromium.args.filter(arg => ![
      '--disable-web-security','--allow-running-insecure-content',
      '--disable-site-isolation-trials',
    ].includes(arg));
    return playwright.launch({...options,executablePath:await chromium.executablePath(),args,headless:true});
  }
  return playwright.launch({...options,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
}
