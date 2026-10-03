// Shared Google Analytics (GA4) event tracking. Every page loads gtag.js
// globally (see Layout.astro), but only in production, and there's no
// guarantee `window.gtag` exists by the time someone clicks — so every
// call here is defensive: no-op outside the browser, no-op if gtag isn't
// present, and never throws into the caller.
//
// `pagePath`/`pageSlug` are attached automatically so every event is
// self-identifying without every call site needing to know its own slug.

// GA4 event names may only contain letters, digits and underscores, must
// start with a letter, and are capped at 40 characters. Call sites use
// kebab-case names ("sim-jupiter-play"), so normalize them here.
export function toGaEventName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `e_${cleaned}`.slice(0, 40);
}

export function trackEvent(name, data = {}) {
  try {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const pagePath = window.location.pathname;
    const pageSlug = pagePath === "/" ? "home" : pagePath.split("/").filter(Boolean).pop();
    window.gtag("event", toGaEventName(name), { pagePath, pageSlug, ...data });
  } catch {
    // Analytics errors should never break the UI.
  }
}
