# Fixture Rules

## 1. Always extend from base-fixture

```javascript
const { test: baseFixture, expect } = require('./base-fixture');

const test = baseFixture.extend({
    // fixtures go here
});

module.exports = { test, expect };
```

## 2. Page fixtures: initialize page object using basePage.page, then navigate

```javascript
candidatesPoolPage: async ({ basePage }, use) => {
    const page = new CandidatesPoolPage(basePage.page);
    await page.goToAdvancedSearchPage();
    await use(page);
},
```

Pattern:
1. Instantiate page class with `basePage.page`
2. Call the page's navigation method
3. `await use(page)` to provide it to the test

## 3. Data fixtures: import JSON and expose as simple values

```javascript
const candidateData = require('../../test-data/candidates/candidate.json');

const test = baseFixture.extend({
    candidateData: candidateData,
});
```

Data fixtures are plain value assignments — no async function needed.

## 4. Import page classes from the pages folder

```javascript
const UploadCandidatesPage = require('../../pages/candidates/upload-candidates.page');
const CandidatesPoolPage = require('../../pages/candidates/candidates_pool.page');
```

## 5. Import test data from the test-data folder

```javascript
const candidateData = require('../../test-data/candidates/candidate.json');
const candidateSearchFiltersData = require('../../test-data/candidates/candidate_search_filters.json');
```

## 6. One fixture file per feature area

- `candidates-fixture.js` — all candidate-related pages and data
- `jobs-fixture.js` — all job-related pages and data
- `administration-fixture.js` — all admin pages and data

## 7. Naming conventions

| Item | Convention |
|------|-----------|
| Fixture file | `feature-fixture.js` |
| Page fixture name | `camelCase` matching the page class (e.g., `candidatesPoolPage`) |
| Data fixture name | `camelCase` + `Data` suffix (e.g., `candidateData`) |

## 8. If a page needs test data in its constructor, pass it during initialization

```javascript
candidatesPage: async ({ basePage }, use) => {
    const page = new UploadCandidatesPage(basePage.page, candidateData);
    await page.goToUpload();
    await use(page);
},
```

## 9. Do NOT add login or authentication logic — base-fixture handles it

The `base-fixture.js` provides `basePage` which is already logged in:
```javascript
const test = base.extend({
    basePage: async ({ page }, use) => {
        const basePage = new BasePage(page);
        await page.goto('/');
        await basePage.login();
        await use(basePage);
    },
});
```

## 10. Export both test and expect

```javascript
module.exports = { test, expect };
```

Tests import both from the fixture file:
```javascript
const { test, expect } = require('../fixtures/candidates-fixture');
```
