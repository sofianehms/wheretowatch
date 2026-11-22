import { installStateRules } from './states-sim.js';

const targets = 'button, a[href], input, select, summary, label:has(input[type="radio"]), [role="option"], [tabindex]';
const minimumTargetSize = 44;

function checkTargets(container) {
  const problems = [];
  for (const target of container.querySelectorAll(targets)) {
    if (!target.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
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
