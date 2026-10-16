// modules/reverseGeocode.js
// ── Choosing between two Nominatim zoom levels ──────────────────────
//
// Nominatim's reverse endpoint answers differently depending on the detail
// level asked for, and at the extremes it produces genuinely wrong labels:
//
//   zoom 14 -> "Gaunipalli"   (the settlement)
//   zoom 18 -> "Kottahudya"   (the parent of the nearest road node)
//
// Both are true responses for the *same* coordinate, 7 m from Gaunipalli's own
// centroid. At high zoom Nominatim walks down to the nearest address node and
// reports whichever administrative boundary contains that node; when the point
// falls just outside a small settlement's polygon, that boundary belongs to a
// different, larger village.
//
// The rule this module encodes:
//   * zoom 14 resolves to the settlement level — what a person means by
//     "where am I" — so it owns the settlement name.
//   * zoom 18 carries the finer levels (suburb / quarter / neighbourhood)
//     that matter inside a city but which zoom 14 omits, so it still
//     contributes those.
//   * When the two disagree about the settlement, the coarser one wins.

import { formatPlaceName } from './geo.js';

/** Settlement-level parts, in priority order, per Nominatim's address schema. */
const SETTLEMENT_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet'];

/**
 * Picks the settlement name out of a Nominatim address object.
 * @returns {string} '' when the address has no settlement at all.
 */
export function pickSettlement(address) {
  if (!address || typeof address !== 'object') return '';
  for (const key of SETTLEMENT_KEYS) {
    const v = address[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Merges a coarse (zoom 14) and a fine (zoom 18) response into the address
 * that should drive the label.
 *
 * @param {object|null} coarseAddr - address from the zoom-14 response
 * @param {object|null} fineAddr - address from the zoom-18 response
 * @returns {{ address: object, settlement: string, disagreed: boolean }}
 */
export function mergeReverseAddresses(coarseAddr, fineAddr) {
  const coarseSettlement = pickSettlement(coarseAddr);
  const fineSettlement = pickSettlement(fineAddr);
  const disagreed = Boolean(coarseSettlement) && coarseSettlement !== fineSettlement;

  if (disagreed) {
    // Keep every fine detail (suburb, quarter, postcode...) but overwrite the
    // settlement with the one zoom 14 is confident about.
    const merged = { ...(fineAddr || {}) };
    // Clear all settlement keys so none can shadow the authoritative one.
    for (const key of SETTLEMENT_KEYS) delete merged[key];
    merged[coarseAddr && SETTLEMENT_KEYS.find((k) => coarseAddr[k])] = coarseSettlement;
    return { address: merged, settlement: coarseSettlement, disagreed: true };
  }

  // Agreement (or only one response): the finer address is strictly richer.
  const address = fineAddr || coarseAddr || {};
  return {
    address,
    settlement: fineSettlement || coarseSettlement,
    disagreed: false,
  };
}

/**
 * Builds the final place label from the two responses.
 *
 * @param {object|null} coarse  full zoom-14 response
 * @param {object|null} fine    full zoom-18 response
 * @param {object} [opts]
 * @param {(s:string)=>string} [opts.sanitize]
 * @param {string} [opts.describeFallback] - used when neither response names a place
 * @param {string} [opts.fallback] - used when the address carries no usable parts
 */
export function labelFromReverse(coarse, fine, opts = {}) {
  const sanitize = opts.sanitize || ((s) => String(s || ''));
  const merged = mergeReverseAddresses(coarse?.address, fine?.address);

  let name = formatPlaceName(merged.address, {
    fallback: sanitize(fine?.display_name || coarse?.display_name),
  });

  if (!name) {
    name = sanitize(fine?.name || coarse?.name) || opts.describeFallback || '';
  }

  return { name, ...merged };
}

/**
 * The two URLs a reverse lookup needs. Kept here so the query is testable
 * without touching the network.
 */
export function reverseUrls(lat, lng, lang = 'en') {
  const base = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2'
    + `&lat=${lat}&lon=${lng}&accept-language=${encodeURIComponent(lang)}`;
  return {
    coarse: `${base}&zoom=14&addressdetails=1`,
    fine: `${base}&zoom=18&addressdetails=1`,
  };
}