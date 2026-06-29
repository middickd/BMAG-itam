// Freshservice REST API client.
// Auth: HTTP Basic with `${API_KEY}:X` per their docs.
// Pagination: per_page=100, follow `Link: <...>; rel="next"` header (FS standard).
// Rate limits: respects Retry-After on 429.

function authHeader(apiKey) {
  const buf = Buffer.from(`${apiKey}:X`, 'utf8').toString('base64');
  return `Basic ${buf}`;
}

function baseUrl(domain) {
  const d = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${d}/api/v2`;
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  // e.g. <https://x.freshservice.com/api/v2/assets?page=2>; rel="next"
  const match = linkHeader.split(',').find((part) => /rel="next"/.test(part));
  if (!match) return null;
  const url = match.match(/<([^>]+)>/);
  return url ? url[1] : null;
}

// FS's `Link: rel="next"` URL carries only `page=N` — it drops the query params we
// sent on page 1 (notably `include=type_fields` and `per_page`). Without them, page 2+
// come back WITHOUT type_fields, so every asset past the first page maps with an empty
// custom-field blob (no cost, purchase_date, warranty, serial). Re-apply any param from
// the page we just fetched that the next-link is missing, so includes/per_page persist
// across the entire pagination.
function carryQueryParams(nextUrl, prevUrl) {
  const next = new URL(nextUrl);
  const prev = new URL(prevUrl);
  for (const [k, v] of prev.searchParams) {
    if (!next.searchParams.has(k)) next.searchParams.set(k, v);
  }
  return next.toString();
}

export class FreshserviceClient {
  constructor({ domain, apiKey, fetchImpl = globalThis.fetch }) {
    if (!domain) throw new Error('Freshservice domain required (e.g. company.freshservice.com)');
    if (!apiKey) throw new Error('Freshservice API key required');
    this.base = baseUrl(domain);
    this.auth = authHeader(apiKey);
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET' } = {}) {
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetch(url, {
        method,
        headers: { Authorization: this.auth, Accept: 'application/json' },
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') || '5');
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Freshservice ${res.status} ${res.statusText} on ${url}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      return { json, link: res.headers.get('link') };
    }
    throw new Error(`Freshservice rate-limited repeatedly on ${url}`);
  }

  // Shared body-bearing write (POST/PUT) with the same 429 retry + error surfacing
  // as request(). Returns the parsed JSON body on success.
  async write(method, url, body) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.fetch(url, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') || '5');
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let body = null;
        try { body = JSON.parse(text); } catch { /* non-JSON error body */ }
        const err = new Error(`Freshservice ${res.status} ${res.statusText} on ${method} ${url}: ${text.slice(0, 300)}`);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      // DELETE (and some PUTs) return 204 with no body — don't choke parsing JSON.
      const text = await res.text().catch(() => '');
      return text ? JSON.parse(text) : null;
    }
    throw new Error(`Freshservice rate-limited repeatedly on ${method} ${url}`);
  }

  // POST /api/v2/assets — create an asset. `body` is the flat asset object
  // (name, asset_type_id, asset_tag, type_fields, …). Returns { asset: {...} }.
  async createAsset(body) {
    return this.write('POST', `${this.base}/assets`, body);
  }

  // PUT /api/v2/assets/{display_id} — partial update; type_fields merges with existing.
  async updateAsset(displayId, body) {
    return this.write('PUT', `${this.base}/assets/${displayId}`, body);
  }

  // GET /api/v2/assets/{display_id}?include=type_fields — single asset with its
  // (suffixed) custom field keys. Used to discover type_field keys for a write.
  async getAsset(displayId) {
    const { json } = await this.request(`/assets/${displayId}?include=type_fields`);
    return json.asset || json;
  }

  // DELETE /api/v2/assets/{display_id} — moves the asset to FS Trash (recoverable
  // ~30 days; a second DELETE on /assets/{id}/delete_forever would be permanent).
  async deleteAsset(displayId) {
    return this.write('DELETE', `${this.base}/assets/${displayId}`);
  }

  // POST /api/v2/products — create a product (model). FS derives an asset's model +
  // manufacturer from its linked Product, so write-back creates/links one. Returns
  // { product: {...} }. Body is flat: { name, asset_type_id, manufacturer, ... }.
  async createProduct(body) {
    return this.write('POST', `${this.base}/products`, body);
  }

  // Paginate through `${path}?per_page=100` until no `next` link. `key` is the JSON envelope key
  // (FS wraps lists like { "assets": [...] }, { "requesters": [...] }, etc).
  async *paginate(path, key) {
    const sep = path.includes('?') ? '&' : '?';
    let next = `${this.base}${path}${sep}per_page=100`;
    while (next) {
      const { json, link } = await this.request(next);
      const rows = Array.isArray(json) ? json : json[key] || [];
      for (const row of rows) yield row;
      const nextLink = parseNextLink(link);
      // FS drops our query params on the next-link; carry them forward (see carryQueryParams).
      next = nextLink ? carryQueryParams(nextLink, next) : null;
    }
  }

  async listAll(path, key) {
    const out = [];
    for await (const row of this.paginate(path, key)) out.push(row);
    return out;
  }

  // ----- Convenience wrappers -----
  listAssetTypes()  { return this.listAll('/asset_types',  'asset_types'); }
  listAssets()      { return this.listAll('/assets?include=type_fields', 'assets'); }
  listRequesters()  { return this.listAll('/requesters',   'requesters'); }
  listAgents()      { return this.listAll('/agents',       'agents'); }
  listLocations()   { return this.listAll('/locations',    'locations'); }
  listProducts()    { return this.listAll('/products',     'products'); }
  listVendors()     { return this.listAll('/vendors',      'vendors'); }
}
