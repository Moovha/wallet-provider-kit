/** Pinned official Caddy image; HTTPS starts only when the operator selects the https Compose profile. */
export const caddyImage =
  'caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f';

export function caddyConfiguration(origin: string) {
  return {
    admin: { disabled: true },
    logging: { logs: { default: { writer: { output: 'discard' } } } },
    apps: {
      http: {
        servers: {
          provider: {
            listen: [':443'],
            routes: [
              {
                match: [{ host: [new URL(origin).hostname] }],
                handle: [
                  {
                    handler: 'reverse_proxy',
                    upstreams: [{ dial: 'api:8080' }],
                  },
                ],
                terminal: true,
              },
            ],
          },
        },
      },
    },
  };
}
