import { InfraiImageClient } from "./infrai_image_client.ts";

const infrai = InfraiImageClient.fromEnv();
const name = process.env.INFRAI_BUCKET ?? "course-artwork";

await infrai.storage.bucket.create({ name });
console.log(`Course artwork bucket ready: ${name}`);
