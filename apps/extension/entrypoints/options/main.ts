import { optionsApi } from "../../src/browser-api.ts";
import { mountOptions } from "../../src/options.ts";

const root = document.getElementById("app");
if (root) void mountOptions(root, optionsApi).refresh();
