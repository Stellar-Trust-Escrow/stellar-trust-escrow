# API Client Usage

This project uses an auto-generated TypeScript SDK from the OpenAPI specification. The SDK is located in `frontend/lib/api-client/`.

## Installation

The SDK is generated automatically by the GitHub Actions workflow when changes are made to `backend/api/routes/**` or `backend/openapi.yaml`.

## Usage

### Basic Example

```typescript
import { Api, Configuration } from '@/lib/api-client/api';

// Create a configuration
const config = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  accessToken: 'your-access-token', // optional, for authenticated endpoints
});

// Initialize the API client
const api = new Api(config);

// Use the generated methods
async function getEscrows() {
  const escrows = await api.escrows.listEscrows({ status: 'Active' });
  return escrows;
}
```

### With SWR (React)

```typescript
import useSWR from 'swr';
import { Api, Configuration } from '@/lib/api-client/api';

const config = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
});

const api = new Api(config);

const fetcher = async (url: string) => {
  // Map URL to API method (or use api directly)
  if (url.startsWith('/api/escrows')) {
    const id = url.split('/').pop();
    if (id &amp;&amp; id !== 'escrows') {
      return api.escrows.getEscrow(id);
    }
    return api.escrows.listEscrows();
  }
  throw new Error('Unknown endpoint');
};

export function useEscrow(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/escrows/${id}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  );
  return { escrow: data, isLoading, error, mutate };
}
```

## Updating the SDK

To regenerate the SDK locally:

1. Make changes to `backend/openapi.yaml` or add new routes in `backend/api/routes/`
2. Run:
   ```bash
   npx swagger-typescript-api -p backend/openapi.yaml -o frontend/lib/api-client -n api.ts --modular
   ```
3. Commit the generated changes

## Validation

The SDK is validated on every PR to ensure:

- All Express routes are documented in the OpenAPI spec
- All OpenAPI paths are implemented in Express
- The generated SDK compiles with TypeScript
- The OpenAPI spec passes Spectral linting
