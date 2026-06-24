// Write-back: create an asset in Freshservice from a locally-entered record.
//
// Why this exists: the auto-sync wipes and replaces our `assets` table from FS on
// every run, so an asset created only locally (no external_id) is destroyed on the
// next sync. Pushing it to FS first — and storing the returned FS id as external_id
// — is what lets a manually-created asset survive and become reconciled on re-sync.
//
// Tenant-specific facts this relies on (see the Freshservice reference notes):
//  - BMAG scans the unit serial into the FS asset *Name*, so we put the serial
//    (falling back to model) in `name`.
//  - model/manufacturer in FS derive from a linked Product record. We reuse an
//    existing Product matching the model, or create one, then link it via the
//    asset's `product` type_field so both round-trip correctly on the next sync.
//  - type_fields keys are suffixed with the asset type id (e.g. asset_state_3200…).
//    A freshly-created asset's response carries those keys, so we discover them from
//    the create response (like the bulk-restate script does) rather than guessing.

import { FreshserviceClient } from './freshservice.js';

// Reverse of sync's normalizeStatus, limited to the state labels this tenant uses.
// New assets created from the UI are always in_stock, which is also the value the
// tenant's workflow automator is happy to keep on an unassigned asset.
const STATE_LABEL = {
  in_stock: 'In Stock',
  deployed: 'In Use',
  retired: 'Retired',
  maintenance: 'In Repair',
  reserved: 'Reserved',
  lost: 'Lost',
};

// Return the matching KEY (with any type-id suffix) for a logical field, given a
// type_fields blob. PUT/POST need the same suffixed key the GET response uses.
function findFieldKey(typeFields, candidates) {
  if (!typeFields) return null;
  for (const c of candidates) {
    if (c in typeFields) return c;
    for (const k of Object.keys(typeFields)) {
      if (k === c || k.startsWith(`${c}_`)) return k;
    }
  }
  return null;
}

// Find an existing FS Product whose name matches the model (case-insensitive). When
// several share a name, prefer the one matching the asset type + manufacturer — the
// same Product fields the sync reads back as model/manufacturer.
function pickProduct(products, { model, manufacturer, assetTypeId }) {
  const wantName = String(model || '').trim().toLowerCase();
  if (!wantName) return null;
  const sameName = products.filter((p) => String(p.name || '').trim().toLowerCase() === wantName);
  if (sameName.length <= 1) return sameName[0] || null;
  const wantMfr = String(manufacturer || '').trim().toLowerCase();
  return sameName
    .map((p) => {
      let score = 0;
      if (assetTypeId && p.asset_type_id === assetTypeId) score += 2;
      if (wantMfr && String(p.manufacturer || '').trim().toLowerCase() === wantMfr) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)[0].p;
}

/**
 * Create `asset` (a row shaped like our assets table) in Freshservice.
 * Resolves the FS asset type from `asset.category` by name (case-insensitive),
 * falling back to `defaultTypeName` ("Hardware") when there's no exact match.
 *
 * Returns { fsId, displayId, usedTypeName, typeMatched, warnings[] }.
 * Throws on a hard failure (no resolvable type, create rejected). Soft failures
 * applying type_fields are collected into `warnings` — the asset still exists in FS.
 */
export async function createAssetInFreshservice({
  domain, apiKey, asset, defaultTypeName = 'Hardware', createMissingProduct = true,
  assetTypes, products: providedProducts, fetchImpl,
}) {
  const client = new FreshserviceClient({ domain, apiKey, fetchImpl });
  const warnings = [];

  // Callers doing a batch (CSV import) can pass prefetched lists to avoid an
  // asset_types + products fetch per row. `products` may be a live array the
  // caller mutates so products created mid-batch are reused by later rows.
  const types = assetTypes || await client.listAssetTypes();
  const products = providedProducts || await client.listProducts().catch((e) => {
    warnings.push(`could not list Freshservice products to set model/manufacturer: ${e.message}`);
    return [];
  });

  const byName = new Map(types.map((t) => [String(t.name).trim().toLowerCase(), t]));
  const wanted = String(asset.category || '').trim().toLowerCase();
  const match = byName.get(wanted) || byName.get(defaultTypeName.toLowerCase());
  if (!match) {
    const names = types.map((t) => t.name).join(', ');
    const err = new Error(
      `No Freshservice asset type matches category "${asset.category}" and no "${defaultTypeName}" fallback exists. Available types: ${names}`,
    );
    err.code = 'FS_NO_ASSET_TYPE';
    throw err;
  }
  const typeMatched = byName.get(wanted) === match;

  // Resolve the Product that carries model + manufacturer in FS: reuse an existing
  // one by name, else create it (so manufacturer/model actually persist on re-sync).
  let productId = null;
  let productInfo = null;
  if (asset.model) {
    const existing = pickProduct(products, {
      model: asset.model, manufacturer: asset.manufacturer, assetTypeId: match.id,
    });
    if (existing) {
      productId = existing.id;
      productInfo = { action: 'linked', id: existing.id, name: existing.name };
    } else if (createMissingProduct) {
      try {
        const body = { name: asset.model, asset_type_id: match.id };
        if (asset.manufacturer) body.manufacturer = asset.manufacturer;
        const resp = await client.createProduct(body);
        const created = resp.product || resp;
        productId = created.id;
        productInfo = { action: 'created', id: created.id, name: created.name || asset.model };
        // Make the new product visible to later rows in this batch.
        products.push({ id: created.id, name: created.name || asset.model, manufacturer: asset.manufacturer || null, asset_type_id: match.id });
      } catch (e) {
        warnings.push(`could not create Freshservice product "${asset.model}": ${e.message}`);
      }
    }
  }

  // Phase 1 — create with the fields FS accepts natively and reliably.
  const serial = asset.serial_number != null ? String(asset.serial_number).trim() : '';
  const stateValue = STATE_LABEL[asset.status] || STATE_LABEL.in_stock;
  const createBody = {
    name: serial || asset.model || asset.asset_tag,
    asset_type_id: match.id,
    asset_tag: asset.asset_tag,
  };
  if (asset.notes) createBody.description = String(asset.notes);

  // Some asset types make product/asset_state (and possibly other) type_fields
  // required AT CREATE TIME. We don't know the type-id-suffixed keys up front, so we
  // attempt the create and, on a 400 "missing_field" validation, fill the exact keys
  // FS reports (product → the product we resolved; asset_state → the mapped state)
  // and retry once. Required fields we can't fill become a clear, actionable error.
  const appliedAtCreate = new Set();
  let createdResp;
  try {
    createdResp = await client.createAsset(createBody);
  } catch (e) {
    const fieldErrors = e.status === 400 && Array.isArray(e.body?.errors)
      ? e.body.errors.filter((x) => x.code === 'missing_field' || /empty|blank/i.test(x.message || ''))
      : [];
    if (fieldErrors.length === 0) throw e;

    const tf = {};
    const unfillable = [];
    for (const { field } of fieldErrors) {
      if (/^product(_\d+)?$/.test(field)) {
        if (productId != null) { tf[field] = productId; appliedAtCreate.add('product'); }
        else unfillable.push(`${field} (no model provided to resolve a product)`);
      } else if (/^(asset_state|state|status)(_\d+)?$/.test(field)) {
        tf[field] = stateValue;
        appliedAtCreate.add('state');
      } else {
        unfillable.push(field);
      }
    }
    if (unfillable.length > 0) {
      const err = new Error(
        `Freshservice requires field(s) the New Asset form can't fill: ${unfillable.join(', ')}. `
        + `Make them optional in Freshservice, or create this asset directly in FS.`,
      );
      err.code = 'FS_REQUIRED_FIELDS';
      throw err;
    }
    createBody.type_fields = tf;
    createdResp = await client.createAsset(createBody);
  }

  const created = createdResp.asset || createdResp;
  if (!created || created.id == null) {
    throw new Error('Freshservice create returned no asset id');
  }

  // Phase 2 — best-effort custom fields not already set during create. Failures here
  // are non-fatal: the asset already exists in FS, so we record a warning not abort.
  let tf = created.type_fields;
  // The create response usually echoes the (empty) suffixed keys; if it didn't,
  // fetch the asset once to learn them.
  if (!tf || Object.keys(tf).length === 0) {
    try {
      const full = await client.getAsset(created.display_id);
      tf = full.type_fields || {};
    } catch (e) {
      tf = {};
      warnings.push(`could not read type_fields to set status/cost: ${e.message}`);
    }
  }

  const patch = {};
  if (!appliedAtCreate.has('product') && productId != null) {
    const productKey = findFieldKey(tf, ['product']);
    if (productKey) patch[productKey] = productId;
    else warnings.push('product link not applied — this asset type has no product field');
  }
  if (!appliedAtCreate.has('state')) {
    const stateKey = findFieldKey(tf, ['asset_state', 'state', 'status']);
    if (stateKey) {
      patch[stateKey] = stateValue;
    } else if (asset.status && asset.status !== 'in_stock') {
      warnings.push(`status "${asset.status}" not written to FS (no asset_state field found)`);
    }
  }

  if (asset.purchase_cost != null && asset.purchase_cost !== '') {
    const costKey = findFieldKey(tf, ['cost', 'purchase_cost']);
    if (costKey) patch[costKey] = Number(asset.purchase_cost);
  }
  if (asset.purchase_date) {
    const dateKey = findFieldKey(tf, ['acquisition_date', 'purchase_date']);
    if (dateKey) patch[dateKey] = asset.purchase_date;
  }
  if (asset.warranty_expires_at) {
    const warrKey = findFieldKey(tf, ['warranty_expiry_date', 'warranty_end_date', 'warranty']);
    if (warrKey) patch[warrKey] = asset.warranty_expires_at;
  }

  if (Object.keys(patch).length > 0) {
    try {
      await client.updateAsset(created.display_id, { type_fields: patch });
    } catch (e) {
      warnings.push(`custom fields (status/cost/dates) not applied: ${e.message}`);
    }
  }

  return {
    fsId: String(created.id),
    displayId: created.display_id,
    usedTypeName: match.name,
    typeMatched,
    product: productInfo,
    warnings,
  };
}

/**
 * Apply an assignment / state change to an EXISTING Freshservice asset, addressed
 * by its display_id. Used by Assign / Check In / Retire.
 *  - `status`  our enum (in_stock|deployed|retired|…) → mapped to the FS state label
 *              and written to the (suffixed) asset_state field. Optional.
 *  - `user`    { externalId } to assign to that FS user, 'clear' to unassign,
 *              or undefined to leave the assignee untouched.
 *  - `notes`   a string to write to the FS asset `description` (the native field the
 *              sync reads back into our `notes` column); undefined leaves it untouched.
 *              Pass '' to clear it.
 * Throws on a failed write (so the caller can avoid mutating local state).
 */
export async function applyAssetChangeInFreshservice({
  domain, apiKey, displayId, status, user, warranty, notes, fetchImpl,
}) {
  const client = new FreshserviceClient({ domain, apiKey, fetchImpl });
  const warnings = [];
  const body = {};

  if (user === 'clear') {
    body.user_id = null;
  } else if (user && user.externalId != null) {
    const n = Number(user.externalId);
    body.user_id = Number.isFinite(n) ? n : user.externalId;
  }

  // description is a native FS field, so no type_fields key discovery is needed.
  if (notes !== undefined) body.description = notes == null ? '' : String(notes);

  // status and warranty both live in (suffixed) custom type_fields — fetch the live asset
  // once if either is requested so we can resolve the real keys.
  if (status || warranty) {
    const full = await client.getAsset(displayId);
    const tf = full.type_fields || {};
    const typeFields = {};
    if (status) {
      const stateKey = findFieldKey(tf, ['asset_state', 'state', 'status']);
      if (stateKey) typeFields[stateKey] = STATE_LABEL[status] || status;
      else warnings.push(`asset_state field not found; "${status}" not written to FS`);
    }
    if (warranty) {
      const warrKey = findFieldKey(tf, ['warranty_expiry_date', 'warranty_end_date', 'warranty']);
      if (warrKey) typeFields[warrKey] = warranty;
      else warnings.push('warranty field not found; warranty date not written to FS');
    }
    if (Object.keys(typeFields).length > 0) body.type_fields = typeFields;
  }

  if (Object.keys(body).length === 0) return { warnings };
  await client.updateAsset(displayId, body);
  return { warnings };
}

/** Delete (trash) an existing Freshservice asset by display_id. Throws on failure. */
export async function deleteAssetInFreshservice({ domain, apiKey, displayId, fetchImpl }) {
  const client = new FreshserviceClient({ domain, apiKey, fetchImpl });
  await client.deleteAsset(displayId);
}
