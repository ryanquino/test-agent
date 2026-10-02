# Test Spec Rules

## 1. Import test and expect from the feature fixture — NEVER from @playwright/test

```javascript
// ✅ CORRECT
const { test, expect } = require('../fixtures/candidates-fixture');

// ❌ WRONG — bypasses login and page setup
const { test, expect } = require('@playwright/test');
```

## 2. Use Kiwi TCMS case IDs in test names

```javascript
test('[C291] save search', async ({ candidatesEllipsisActionsPage, candidatesEllipsisActionsData }) => {
    // ...
});
```

Format: `[CXXX]` where XXX is the Kiwi TCMS case number.

## 3. Use fixtures for page objects and data — NEVER instantiate pages in tests

```javascript
// ✅ CORRECT — page and data come from fixtures
test('[C001] upload candidate', async ({ candidatesPage, candidateData }) => {
    await candidatesPage.uploadResume(candidateData.filename);
});

// ❌ WRONG — manual instantiation
test('[C001] upload candidate', async ({ page }) => {
    const candidatesPage = new UploadCandidatesPage(page);
    await candidatesPage.goToUpload();
});
```

## 4. Use `test.describe.serial()` for dependent tests

```javascript
test.describe.serial('Candidates Ellipsis Action', () => {
    test('[C291] save search', async ({ candidatesEllipsisActionsPage, candidatesEllipsisActionsData }) => {
        // Creates a saved search
    });

    test('[C292] my search', async ({ candidatesEllipsisActionsPage, candidatesEllipsisActionsData }) => {
        // Depends on saved search existing from previous test
    });

    test('[C293] manage my search', async ({ candidatesEllipsisActionsPage, candidatesEllipsisActionsData }) => {
        // Cleans up the saved search
    });
});
```

Use serial only when tests have execution order dependencies. Independent tests should NOT be in a serial block.

## 5. Assertions belong in tests, not in page objects

```javascript
// ✅ CORRECT
test('[C289] edit columns', async ({ candidatesEllipsisActionsPage }) => {
    await candidatesEllipsisActionsPage.addTableColumn();
    await expect(candidatesEllipsisActionsPage.tableHeading).toContainText('City');
    await expect(candidatesEllipsisActionsPage.tableHeading).toContainText('Disposition');
});
```

## 6. Common assertion patterns

```javascript
await expect(locator).toBeVisible();
await expect(locator).not.toBeVisible();
await expect(locator).toContainText('expected text');
await expect(locator).toHaveText('exact text');
await expect(locator).toBeChecked();
await expect(locator).toHaveValue('value');
await expect(locator).toHaveCount(3);
```

## 7. No login steps in tests — handled by base-fixture

The `base-fixture.js` handles:
- Navigating to the base URL (`page.goto('/')`)
- Logging in via `basePage.login()`
- Providing `basePage` to feature fixtures

Never include login logic in spec files.

## 8. No hard-coded URLs — use relative paths or page navigation methods

```javascript
// ✅ CORRECT — navigation is in the page object or fixture
await candidatesPage.goToAdvancedSearchPage();

// ❌ WRONG
await page.goto('https://playwrightqa-openhire.silkroad-eng.com/candidates');
```

## 9. Keep tests focused — one workflow per test

Each test should verify one distinct behavior or user flow. Don't combine unrelated assertions in a single test.

## 10. Cleanup: first test in serial block should handle pre-existing state

```javascript
test('[C291] save search', async ({ candidatesEllipsisActionsPage, candidatesEllipsisActionsData }) => {
    // Clean up any leftover state from previous failed runs
    await candidatesEllipsisActionsPage.deleteExistingSavedSearch(candidatesEllipsisActionsData.name);
    // Then perform the actual test action
    await candidatesEllipsisActionsPage.saveSearch(candidatesEllipsisActionsData.name);
    // Assert
    const pageHeading = await candidatesEllipsisActionsPage.getPageHeading(candidatesEllipsisActionsData.name);
    await expect(pageHeading).toBeVisible();
});
```
