# Cosmo router config (placeholder)

This directory holds the three files the Cosmo router reads when we front the
`@ship2prod/graph` subgraph.

- `graph.yaml`: subgraph map. Points the router at `http://graph:4001/graphql`.
- `config.yaml`: runtime config. Serves GraphQL on `:3002`, MCP on `:5025`.
- `config.json`: the compiled federation plan.

`config.json` is a minimal placeholder that boots a single-subgraph setup. The
real plan should be regenerated from the SDL whenever `src/schema.graphql`
changes. Run:

```
wgc router compose --input router/graph.yaml --out router/config.json
```

The router image in `docker-compose.yml` mounts this folder read-only at
`/etc/router`.
