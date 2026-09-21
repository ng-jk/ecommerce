import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = new URL("../.env", import.meta.url);
if (existsSync(path)) {
  console.log(".env already exists; leaving it unchanged.");
} else {
  const template = readFileSync(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  writeFileSync(
    path,
    template
      .replace(
        "APP_KEY=",
        "APP_KEY=base64:" + randomBytes(32).toString("base64"),
      )
      .replace(
        "DB_PASSWORD=",
        "DB_PASSWORD=" + randomBytes(24).toString("hex"),
      ),
    { mode: 0o600 },
  );
  console.log("Created .env with unique local credentials.");
}
