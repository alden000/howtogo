#!/usr/bin/env node
// Writes wrangler.embed.toml from wrangler.toml (src/embed-config.ts): the same two Workers and test env,
// minus [assets], for the embedded-assets deploy path (`npm run deploy:preview -- --embed`). Use it only where
// wrangler's assets upload fails (e.g. behind an API-token-injecting proxy). test/config.test.ts fails when
// the committed wrangler.embed.toml is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { embedConfig } from "../src/embed-config.ts";

const src = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
writeFileSync(new URL("../wrangler.embed.toml", import.meta.url), embedConfig(src));
console.log("embed-config: wrangler.embed.toml written");
