const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('🔍 Starting supplier phone validation test...\n');

    // Navigate to app
    console.log('1. Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if we're on login page
    const isLoginPage = await page.locator('input[type="text"]').isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoginPage) {
      console.log('   ✅ Detected login page');
      // Try default credentials (check if there are any test users)
      const userInput = page.locator('input[type="text"]');
      const passInput = page.locator('input[type="password"]');
      const submitBtn = page.locator('button[type="submit"]');

      // Try common test credentials
      await userInput.fill('admin');
      await passInput.fill('admin');
      await submitBtn.click();

      // Wait for navigation
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // Try to navigate to treasury
    console.log('\n2. Looking for treasury/suppliers page...');
    await page.goto('http://localhost:5173/treasury/suppliers', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
      console.log('   ⚠️  Could not navigate directly to suppliers, trying from nav');
    });

    // Look for "إضافة مورد" button
    const addSupplierBtn = page.locator('button:has-text("إضافة مورد"), button:has-text("add supplier")').first();
    const isVisible = await addSupplierBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) {
      console.log('   ❌ Could not find "إضافة مورد" button - page might need authentication');
      console.log('\n   Checking page title:', await page.title());
      console.log('   Checking if login is still visible:', await page.locator('input[type="password"]').isVisible().catch(() => false));

      // Take screenshot for debugging
      await page.screenshot({ path: '/tmp/supplier-page-debug.png', fullPage: true });
      console.log('   📸 Screenshot saved to /tmp/supplier-page-debug.png');

      process.exit(1);
    }

    console.log('   ✅ Found "إضافة مورد" button');

    // Test 1: Valid phone number
    console.log('\n3. Testing valid Egyptian phone number (01012345678)...');
    await addSupplierBtn.click();
    await page.waitForTimeout(500);

    const phoneInput = page.locator('input[inputmode="tel"], input[placeholder="01012345678"]').first();
    await phoneInput.fill('01012345678');
    await page.waitForTimeout(300);

    const phoneError = await page.locator('text=رقم الهاتف يجب أن يكون').first().isVisible().catch(() => false);
    const formatHint = await page.locator('text=الصيغة:').first().isVisible().catch(() => false);

    if (phoneError) {
      console.log('   ❌ ERROR: Valid phone number showed error message');
    } else if (formatHint) {
      console.log('   ✅ Valid phone shows format hint (good UX)');
    } else {
      console.log('   ✅ Valid phone accepted without error');
    }

    // Test 2: Invalid phone number
    console.log('\n4. Testing invalid phone number (5551234567)...');
    await phoneInput.clear();
    await phoneInput.fill('5551234567');
    await page.waitForTimeout(300);

    const invalidPhoneError = await page.locator('text=رقم الهاتف يجب أن يكون').first().isVisible().catch(() => false);

    if (invalidPhoneError) {
      console.log('   ✅ Invalid phone shows error message');
      const errorText = await page.locator('text=رقم الهاتف يجب أن يكون').first().textContent();
      console.log(`   Message: "${errorText}"`);
    } else {
      console.log('   ❌ Invalid phone did NOT show error message');
    }

    // Check if submit button is disabled
    const submitBtn = page.locator('button[type="submit"]:has-text("حفظ"), button[type="submit"]:has-text("save")').first();
    const isDisabled = await submitBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      console.log('   ✅ Submit button is disabled for invalid phone');
    } else {
      console.log('   ⚠️  Submit button is NOT disabled for invalid phone');
    }

    // Test 3: Empty phone (should be allowed)
    console.log('\n5. Testing empty phone field...');
    await phoneInput.clear();
    await page.waitForTimeout(300);

    const emptyPhoneError = await page.locator('text=رقم الهاتف يجب أن يكون').first().isVisible().catch(() => false);
    const emptyPhoneHint = await page.locator('text=الصيغة:').first().isVisible().catch(() => false);

    if (emptyPhoneError) {
      console.log('   ❌ Empty phone shows error (should be optional)');
    } else if (emptyPhoneHint) {
      console.log('   ✅ Empty phone shows format hint');
    } else {
      console.log('   ✅ Empty phone allowed (no error)');
    }

    // Take final screenshot
    await page.screenshot({ path: '/tmp/supplier-form-final.png', fullPage: true });
    console.log('\n📸 Screenshot saved to /tmp/supplier-form-final.png');

    console.log('\n✅ All tests completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    await page.screenshot({ path: '/tmp/supplier-form-error.png', fullPage: true }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
