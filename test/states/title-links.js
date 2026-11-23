// Production detail routing lands with the title screen; until then each fixture link opens the served
// title fixture, so following a link from the states page reaches a real title page. Resolved by test/title-links.test.js.
export const titleFixture = '../design/mockups/result-available.html';
export const hrefFor = (chosen) => `${titleFixture}?ref=${encodeURIComponent(chosen.ref)}`;
