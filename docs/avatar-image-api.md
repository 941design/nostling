# API Documentation

## Overview

The Avatar Search CGI provides a simple HTTP GET-based API for querying avatar images by metadata attributes.

**Base URL**: `https://wp10665333.server-he.de`

**Protocol**: HTTPS

**Method**: GET

**Response Format**: JSON

---

## Endpoint: Search Avatars

### Request

```
GET /cgi/search?<query-parameters>
```

### Query Parameters

#### Filter Parameters

Filter parameters are used to specify search criteria. Parameters can be repeated to express OR logic within a key.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `<key>` | string | Yes (at least one) | Filter key from vocabulary | `color=red` |

**Filter Logic**:
- **AND across keys**: `color=red&style=anime` returns avatars matching BOTH conditions
- **OR within keys**: `color=red&color=blue` returns avatars matching EITHER color
- **Combined**: `color=red&color=blue&style=anime` returns `(red OR blue) AND anime`

**Validation**:
- All keys must exist in `vocab.json`
- All values must be valid for their respective keys
- Unknown keys or values return 400 error

#### Pagination Parameters

| Parameter | Type | Required | Default | Description | Constraints |
|-----------|------|----------|---------|-------------|-------------|
| `limit` | integer | No | 50 | Number of results to return | 1 ≤ limit ≤ 500 |
| `offset` | integer | No | 0 | Number of results to skip | offset ≥ 0 |

**Pagination Behavior**:
- Results are stable and deterministic (same query always returns same page)
- Results ordered by ascending UUID
- Empty array returned when `offset` exceeds total matches

### Request Examples

**Single filter**:
```
GET /cgi/search?color=red
```

**Multiple filters (AND)**:
```
GET /cgi/search?color=red&style=anime
```

**OR within key**:
```
GET /cgi/search?color=red&color=blue
```

**Complex query with pagination**:
```
GET /cgi/search?color=red&color=blue&style=anime&style=flat&limit=20&offset=40
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "items": [
    {
      "url": "/avatars/11111111-1111-1111-1111-111111111111.png"
    },
    {
      "url": "/avatars/22222222-2222-2222-2222-222222222222.png"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `items` | array | Array of search result objects |
| `items[].url` | string | Relative URL path to avatar image |
| `limit` | integer | Limit used for this query (from request or default) |
| `offset` | integer | Offset used for this query (from request or 0) |

**Properties**:
- `items` array is ordered by ascending UUID
- `items` array length ≤ `limit`
- `items` array may be empty (no matches or offset beyond results)
- URLs are relative paths; prepend base URL to construct full image URLs

### Error Response (400 Bad Request)

```json
{
  "error": "invalid_query",
  "message": "Unknown filter key: foo"
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | Error code (always `"invalid_query"` for 400 errors) |
| `message` | string | Human-readable error description |

**Common Error Messages**:

| Message Pattern | Cause |
|----------------|-------|
| `"Unknown filter key: <key>"` | Filter key not in vocabulary |
| `"Unknown value '<value>' for key '<key>'"` | Value not valid for the key |
| `"Too many filter keys"` | Exceeds 10 keys per query |
| `"Too many values for key '<key>'"` | Exceeds 50 values per key |
| `"Too many total filters"` | Exceeds 200 total filter pairs |
| `"Invalid limit: <limit>"` | Limit out of range (must be 1-500) |
| `"Invalid offset: <offset>"` | Offset is negative |

### Error Response (500 Internal Server Error)

```json
{
  "error": "server_error",
  "message": "Internal server error"
}
```

Server errors indicate a problem on the server side. Retry later or contact the service operator.

---

## Vocabulary Endpoint

The vocabulary file lists all available filter keys and their valid values.

### Request

```
GET /vocab.json
```

### Response (200 OK)

```json
{
  "color": ["blue", "green", "red"],
  "style": ["anime", "flat", "minimalist"]
}
```

**Response Format**:

```typescript
{
  [key: string]: string[]
}
```

- **Keys**: Available filter keys
- **Values**: Sorted arrays of valid values for each key

**Usage**:
- Retrieve vocabulary before constructing queries to discover available filters
- Use for client-side validation of filter parameters
- Use for building dynamic filter UIs

---

## HTTP Headers

### Request Headers

No special headers required.

### Response Headers

**Success Response**:
```
Content-Type: application/json
```

**Error Response (400)**:
```
Status: 400 Bad Request
Content-Type: application/json
```

**Error Response (500)**:
```
Status: 500 Internal Server Error
Content-Type: application/json
```

---

## Response Examples

### Example 1: Successful Search

**Request**:
```
GET /cgi/search?color=red&limit=2
```

**Response** (200 OK):
```json
{
  "items": [
    {
      "url": "/avatars/11111111-1111-1111-1111-111111111111.png"
    },
    {
      "url": "/avatars/33333333-3333-3333-3333-333333333333.png"
    }
  ],
  "limit": 2,
  "offset": 0
}
```

---

### Example 2: Pagination

**Request**:
```
GET /cgi/search?color=red&limit=2&offset=2
```

**Response** (200 OK):
```json
{
  "items": [
    {
      "url": "/avatars/55555555-5555-5555-5555-555555555555.png"
    }
  ],
  "limit": 2,
  "offset": 2
}
```

**Explanation**: Skipped first 2 results (offset=2), returned next 2 (but only 1 remained).

---

### Example 3: No Results

**Request**:
```
GET /cgi/search?color=red&style=flat
```

**Response** (200 OK):
```json
{
  "items": [],
  "limit": 50,
  "offset": 0
}
```

**Explanation**: No avatars match both `color=red` AND `style=flat`.

---

### Example 4: Unknown Filter Key

**Request**:
```
GET /cgi/search?invalid_key=value
```

**Response** (400 Bad Request):
```json
{
  "error": "invalid_query",
  "message": "Unknown filter key: invalid_key"
}
```

---

### Example 5: Unknown Filter Value

**Request**:
```
GET /cgi/search?color=invalid_color
```

**Response** (400 Bad Request):
```json
{
  "error": "invalid_query",
  "message": "Unknown value 'invalid_color' for key 'color'"
}
```

---

### Example 6: Exceeding Limit

**Request**:
```
GET /cgi/search?color=red&limit=1000
```

**Response** (400 Bad Request):
```json
{
  "error": "invalid_query",
  "message": "Invalid limit: 1000 (max: 500)"
}
```

**Explanation**: Requested limit exceeds maximum of 500.

---

### Example 7: No Filters Provided (Returns All Avatars)

**Request**:
```
GET /cgi/search?limit=10
```

**Response** (200 OK):
```json
{
  "items": [
    { "url": "/avatars/00000000-0000-0000-0000-000000000001.png" },
    { "url": "/avatars/00000000-0000-0000-0000-000000000002.png" }
  ],
  "limit": 10,
  "offset": 0
}
```

**Explanation**: When no filters are provided, all avatars are returned (paginated).

---

## Client Implementation Guide

### Basic Client (JavaScript)

```javascript
const BASE_URL = 'https://wp10665333.server-he.de';

async function searchAvatars(filters, limit = 50, offset = 0) {
  // Build query string
  const params = new URLSearchParams();

  // Add filters
  for (const [key, values] of Object.entries(filters)) {
    for (const value of values) {
      params.append(key, value);
    }
  }

  // Add pagination
  params.set('limit', limit);
  params.set('offset', offset);

  // Execute request
  const response = await fetch(`${BASE_URL}/cgi/search?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
const results = await searchAvatars(
  { color: ['red', 'blue'], style: ['anime'] },
  20,
  0
);

console.log(results.items); // Array of {url: "..."}
```

### Fetching Vocabulary

```javascript
async function getVocabulary() {
  const response = await fetch(`${BASE_URL}/vocab.json`);
  return await response.json();
}

// Usage
const vocab = await getVocabulary();
console.log(vocab);
// {
//   "color": ["blue", "green", "red"],
//   "style": ["anime", "flat", "minimalist"]
// }
```

### Building Dynamic Filters

```javascript
async function buildFilterUI() {
  const vocab = await getVocabulary();

  for (const [key, values] of Object.entries(vocab)) {
    // Create filter section
    const section = document.createElement('div');
    section.innerHTML = `<h3>${key}</h3>`;

    // Create checkboxes for each value
    for (const value of values) {
      const label = document.createElement('label');
      label.innerHTML = `
        <input type="checkbox" name="${key}" value="${value}">
        ${value}
      `;
      section.appendChild(label);
    }

    document.body.appendChild(section);
  }
}
```

### Pagination Helper

```javascript
class AvatarSearchPaginator {
  constructor(filters, pageSize = 50) {
    this.filters = filters;
    this.pageSize = pageSize;
    this.currentPage = 0;
  }

  async nextPage() {
    const offset = this.currentPage * this.pageSize;
    const results = await searchAvatars(this.filters, this.pageSize, offset);

    if (results.items.length > 0) {
      this.currentPage++;
    }

    return results;
  }

  async prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      const offset = this.currentPage * this.pageSize;
      return await searchAvatars(this.filters, this.pageSize, offset);
    }
    return null;
  }

  reset() {
    this.currentPage = 0;
  }
}

// Usage
const paginator = new AvatarSearchPaginator(
  { color: ['red'], style: ['anime'] },
  20
);

const page1 = await paginator.nextPage();
const page2 = await paginator.nextPage();
```

---

## Performance Considerations

### Query Optimization

- **Minimize filter count**: Fewer filters = faster queries
- **Use specific filters first**: More selective filters reduce intermediate result sizes
- **Reasonable limits**: Use pagination with moderate `limit` values (50-100)

### Client-Side Optimization

- **Debounce filter changes**: Avoid excessive requests while user is typing/selecting
- **Cache vocabulary**: Fetch once, reuse for session
- **Prefetch next page**: Load next page in background for smoother pagination

### Expected Latency

| Query Type | Typical Latency | Notes |
|------------|----------------|-------|
| Single filter | < 20ms | Direct posting list read |
| 2-3 filters (AND) | < 50ms | Small intersection |
| 5+ filters (AND/OR) | < 100ms | Multiple intersections |
| Max filters (200 pairs) | < 200ms | Stress test case |
| Empty results | < 10ms | Early termination possible |

**Latency depends on**:
- Number of filter pairs
- Size of result set

---

## Testing

Use `curl` to test the API:

```bash
# Successful query
curl -v 'https://wp10665333.server-he.de/cgi/search?subject=strawberry&limit=5'

# Error case (unknown filter)
curl -v 'https://wp10665333.server-he.de/cgi/search?invalid=value'

# Vocabulary
curl -v 'https://wp10665333.server-he.de/vocab.json'
```

---

## Error Handling Best Practices

### Client Error Handling

```javascript
async function safeSearch(filters) {
  try {
    const results = await searchAvatars(filters);
    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Usage
const result = await safeSearch({ color: ['red'] });

if (result.success) {
  displayResults(result.data.items);
} else {
  showError(result.error);
}
```

### Retry Logic

```javascript
async function searchWithRetry(filters, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await searchAvatars(filters);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

---

## API Versioning

The current API is **unversioned** (MVP). Future versions may introduce versioning:

- **Path-based**: `/cgi/v2/search`
- **Header-based**: `X-API-Version: 2`
- **Query param**: `?version=2`

Breaking changes will require a new version. Non-breaking additions (new optional parameters) can be added to existing version.
