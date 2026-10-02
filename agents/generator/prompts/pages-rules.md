# Page Object Rules

## 1. Always extend BasePage

```javascript
const BasePage = require('../base.page.js');

class FeatureNamePage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
    }
}

module.exports = FeatureNamePage;
```

## 2. Define all locators as properties in the constructor

```javascript
constructor(page) {
    super(page);
    this.page = page;

    // Navigation locators
    this.candidateNavLocator = this.page.getByLabel('Candidates', { exact: true });
    this.candidatePoolNavLocator = this.page.getByLabel('Candidate Pool');

    // Action locators
    this.saveButtonLocator = this.page.getByRole('button', { name: 'Save' });
    this.nameField = this.page.getByLabel('Name', { exact: true });
}
```

## 3. Prefer semantic locators over CSS selectors

Use in this order of preference:
1. `getByRole()` — buttons, headings, links, menuitem
2. `getByLabel()` — form fields, nav items
3. `getByText()` — text content
4. `page.locator('#id')` — when IDs are stable and semantic selectors are not available
5. `page.locator('css')` — last resort only

```javascript
// ✅ CORRECT
this.saveButton = this.page.getByRole('button', { name: 'Save' });
this.nameField = this.page.getByLabel('Name', { exact: true });

// ❌ AVOID when semantic alternative exists
this.saveButton = this.page.locator('button.btn-primary');
```

## 4. Locator naming conventions

| Suffix/Pattern | Element |
|----------------|---------|
| `NavLocator` | Navigation menu items |
| `Button` / `ButtonLocator` | Buttons |
| `Link` | Clickable links |
| `Field` | Form inputs |
| `Column` | Table column selectors |
| `Locator` | Generic fallback suffix |

## 5. Navigation method — one per page, called from fixture

```javascript
async goToFeaturePage() {
    await this.featureNavLocator.click();
    await this.subFeatureNavLocator.click();
    await this.page.waitForLoadState('load');
}
```

## 6. Action methods — one user action per method

```javascript
async saveSearch(name) {
    await this.ellipsisButton.click();
    await this.saveSearchLink.click();
    await this.nameField.fill(name);
    await this.saveButton.click();
    await this.page.waitForLoadState('networkidle');
}
```

## 7. Return locators for assertions in tests (don't assert inside page objects)

```javascript
// ✅ CORRECT — return the locator, let test assert
async getPageHeading(heading) {
    return this.page.getByRole('heading', { name: heading, level: 1 });
}

// ❌ WRONG — asserting inside the page object
async verifyHeading(heading) {
    await expect(this.page.getByRole('heading', { name: heading })).toBeVisible();
}
```

## 8. Use proper waits after actions

```javascript
await this.page.waitForLoadState('load');           // after navigation
await this.page.waitForLoadState('networkidle');     // after save/submit
await this.page.waitForLoadState('domcontentloaded'); // after UI interactions
```

Never use hard-coded timeouts like `page.waitForTimeout(3000)`.

## 9. File uploads — use path module

```javascript
const BasePage = require('../base.page.js');

class UploadPage extends BasePage {
    constructor(page) {
        super(page);
        this.page = page;
        this.path = require('path');
        this.uploadInput = this.page.locator('input[type="file"]');
    }

    async uploadFile(filename) {
        const filePath = this.path.join(__dirname, '../../test-data/files/' + filename);
        await this.uploadInput.setInputFiles(filePath);
    }
}
```

## 10. Cleanup methods — if the test creates data, add cleanup in the page

```javascript
async deleteEntity(name) {
    // Navigate to list, find item, delete it
    await this.page.waitForLoadState('networkidle');
}
```

## 11. Conditional logic for setup/cleanup is acceptable

```javascript
async deleteExistingSavedSearch(name) {
    await this.ellipsisButton.click();
    if (await this.manageMySearchesLink.isVisible()) {
        await this.manageMySearchesLink.click();
        const checkbox = this.page.locator('.control-group', { hasText: name }).locator('input[type="checkbox"]');
        if (await checkbox.isVisible()) {
            await checkbox.check();
        }
        await this.saveButton.click();
        await this.page.waitForLoadState('domcontentloaded');
    } else {
        await this.page.keyboard.press('Escape');
    }
}
```
