// Pointer and keyboard states cannot be forced from a script, so the page derives its simulated
// states from the production stylesheets: every rule that mentions :hover, :focus, :focus-visible
// or :focus-within is copied with that pseudo-class replaced by a class. Removing or changing a
// production rule therefore changes what the scenarios show and measure.
const hoverPattern = /:hover(?![\w-])/g;
const focusPattern = /:focus(-visible|-within)?(?![\w-])/g;

function collect(rules, out) {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText;
      if (hoverPattern.test(selector) || focusPattern.test(selector)) {
        const copy = selector.replace(hoverPattern, '.is-hover').replace(focusPattern, '.is-focus');
        out.push(`${copy} { ${rule.style.cssText} }`);
      }
      hoverPattern.lastIndex = 0;
      focusPattern.lastIndex = 0;
    } else if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches) {
      collect(rule.cssRules, out);
    }
  }
}

export function installStateRules() {
  const css = [];
  for (const sheet of document.styleSheets) collect(sheet.cssRules, css);
  const simulated = new CSSStyleSheet();
  simulated.replaceSync(css.join('\n'));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, simulated];
  return css.length;
}

// Computed difference between the resting and the hovered control.
export function hoverChanges(control) {
  const read = () => {
    const style = getComputedStyle(control);
    return `${style.backgroundColor}|${style.boxShadow}|${style.transform}`;
  };
  const hovered = read();
  control.classList.remove('is-hover');
  const resting = read();
  control.classList.add('is-hover');
  return hovered !== resting;
}
