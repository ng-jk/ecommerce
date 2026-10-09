import { createMiniappSDK } from "./miniapp-sdk.js";

const sdk = window.MiniappSDK || createMiniappSDK();
const output = document.getElementById("result");
document.getElementById("load").addEventListener("click", async () => {
  output.textContent = "Loading…";
  try {
    output.textContent = JSON.stringify(await sdk.catalog(1), null, 2);
  } catch {
    output.textContent = "Unable to load products. Reopen this Mini App and try again.";
  }
});
