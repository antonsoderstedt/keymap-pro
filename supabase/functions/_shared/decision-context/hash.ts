/**
 * Re-export hashing primitives from commercial-intent so the worker has a
 * single import path for `inputs_hash` computation.
 */

export { canonicalJSON, hashCanonical, sha256Hex } from "../commercial-intent/hash.ts";
