import { popupApi } from "../../src/browser-api.ts";
import { mountPopup } from "../../src/popup.ts";

const root = document.getElementById("app");
if (root) void mountPopup(root, popupApi).refresh();
