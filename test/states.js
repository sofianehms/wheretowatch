import { installStateRules } from './states-sim.js';

const targets = 'button, a[href], input, select, summary, label:has(input[type="radio"]), [role="option"], [tabindex]';
const minimumTargetSize = 44;

function checkTargets(container) {
  const problems = [];
  for (const target of container.querySelectorAll(targets)) {
    const shown = target.checkVisibility({ visibilityProperty: true });
    if (!shown || !target.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
      // A control hidden on purpose says so in the markup (`hidden`, `aria-hidden` or `inert`); one hidden only by CSS is a defect.
      // Opacity alone does not count (entrance animations start at 0), and a native input drawn by its visible label is fine.
      const drawnByLabel = target.localName === 'input' && target.closest('label')?.checkVisibility({ visibilityProperty: true });
      if (!shown && !drawnByLabel && !target.closest('[hidden], [aria-hidden="true"], [inert]')) {
        const label = target.getAttribute('aria-label') || target.textContent.trim() || target.id;
        problems.push(`<${target.localName}>${label ? ` "${label}"` : ''} is hidden by CSS only (expected control must be visible)`);
      }
      continue;
    }
    // WCAG 2.5.8: a link inside a sentence is exempt from the minimum target size.
    const insideSentence = target.localName === 'a' && getComputedStyle(target).display === 'inline'
      && [...target.parentElement.childNodes].some((node) => node !== target && node.textContent.trim());
    if (insideSentence) continue;
    const { width, height } = target.getBoundingClientRect();
    if (width < minimumTargetSize || height < minimumTargetSize) {
      const label = target.getAttribute('aria-label') || target.textContent.trim() || target.id;
      problems.push(`<${target.localName}>${label ? ` "${label}"` : ''} is ${width} × ${height} px (minimum 44 × 44 px)`);
    }
  }
  return problems;
}

// Steps the verify runner replays with trusted key presses (see scripts/verify.mjs).
const keySteps = [];

async function renderView() {
  const view = new URLSearchParams(location.search).get('view');
  if (!view || !/^[a-z][a-z0-9-]*$/.test(view)) return ['Choose a valid states view.'];

  installStateRules();
  const { default: scenarios, check } = await import(`./states/${view}.js`);
  const list = document.querySelector('#scenarios');
  const problems = [];
  const rendered = [];
  window.statesKeySteps = keySteps;
  for (const scenario of scenarios) {
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = scenario.name;
    const container = document.createElement('div');
    section.append(heading, container);
    list.append(section);
    try {
      await scenario.render(container);
      rendered.push({ scenario, container });
    } catch (error) {
      problems.push(`${scenario.name}: ${error.message}`);
    }
  }

  await document.fonts.ready;
  for (const { scenario, container } of rendered) {
    if (scenario.realKeys) keySteps.push(...scenario.realKeys.map((step) => ({ ...step, container })));
    problems.push(...checkTargets(container).map((problem) => `${scenario.name}: ${problem}`));
    try {
      const issues = await scenario.check?.(container) ?? [];
      problems.push(...issues.map((problem) => `${scenario.name}: ${problem}`));
    } catch (error) {
      problems.push(`${scenario.name}: ${error.message}`);
    }
  }
  const issues = await check?.() ?? [];
  problems.push(...issues.map((problem) => `${view}: ${problem}`));
  restoreInitialFocus();
  return problems;
}

// The checks move focus around; put the keyboard starting point back at the top of the page so a reviewer tabs in document order.
function restoreInitialFocus() {
  const sentinel = document.createElement('span');
  sentinel.tabIndex = -1;
  document.body.prepend(sentinel);
  sentinel.focus();
  sentinel.remove();
  document.activeElement?.blur?.();
  window.scrollTo(0, 0);
}

// Wait for imports and asynchronous renders before capturing or auditing the page.
window.statesRunKeyStep = async (index, phase) => {
  const step = keySteps[index];
  if (phase === 'before') return step.before?.(step.container) ?? [];
  return step.after(step.container);
};
window.statesReady = renderView().catch((error) => [error.message]);
