// The stores a telescope can be bought from, shared by the vendor section
// (Affiliates.astro) and the review header's "Check price" menu so both
// always list the same stores in the same order. Region is where the store
// mainly sells.

const VENDORS = [
  { key: 'amazon', name: 'Amazon', region: 'Global', desc: 'Recommended for smaller purchases.' },
  { key: 'highpointscientific', name: 'HighPoint Scientific', region: 'US', desc: 'Great customer support & expert guidance.' },
  { key: 'astroshop', name: 'AstroShop', region: 'EU', desc: 'Recommended for EU customers.' },
];

/** The stores that have a link for this telescope, with their links. */
export function getVendors(affiliate = {}) {
  return VENDORS.map((v) => ({ ...v, link: affiliate?.[v.key] })).filter((v) => v.link);
}
