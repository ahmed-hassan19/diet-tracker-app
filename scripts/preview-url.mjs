import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const url =
  data.result?.["diet-tracker-372ca"]?.url ||
  data.result?.url ||
  Object.values(data.result || {}).find((value) => value?.url)?.url;
if (!url) throw new Error("Firebase preview output did not contain a URL");
console.log(`url=${url}`);
