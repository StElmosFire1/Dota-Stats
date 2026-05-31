import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement layout APIs like scrollIntoView. Components that call
// it (e.g. the command palette keeping the active option in view) would throw
// in tests, so provide a no-op stub.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
