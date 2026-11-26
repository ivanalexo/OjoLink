import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../src/permissions.ts";
import { justifications, renderPermissions } from "../src/store.ts";

/** The address is a build setting; the store material names the resolver by its role. */
export const EXAMPLE_RESOLVER = "https://resolver.example";

const target = join(process.cwd(), "store", "permisos.es.md");
writeFileSync(target, renderPermissions(justifications(buildManifest(EXAMPLE_RESOLVER))));
process.stdout.write(`Wrote ${target}\n`);
