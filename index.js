/**
 * Host half of the enhance bundle.
 *
 * Everything shipped so far is Client-side, so `apply` is empty on purpose: the
 * row exists so Plugin Manager can list, disable, and remove the bundle, and so
 * a future Host feature (a tool, a service, a config schema) has a home without
 * adding a second Loader row.
 *
 * @returns nothing.
 */
export function apply() {}
