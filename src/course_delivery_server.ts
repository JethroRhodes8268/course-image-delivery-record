import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { CourseDelivery, coverUploadBody, createCourseBody, learnerSubmissionBody } from "./course_delivery.ts";
import { InfraiError, InfraiImageClient } from "./infrai_image_client.ts";

const delivery = new CourseDelivery();
const infrai = InfraiImageClient.fromEnv();
const bucket = process.env.INFRAI_BUCKET ?? "course-artwork";

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (method === "POST" && url.pathname === "/courses") {
      const course = delivery.createCourse(createCourseBody.parse(await readJson(request)));
      return json(response, 201, course);
    }

    if (method === "POST" && parts[0] === "courses" && parts[2] === "cover") {
      delivery.requireCourse(parts[1]);
      const body = coverUploadBody.parse(await readJson(request));
      const objectKey = `courses/${parts[1]}/${body.filename}`;
      await infrai.storage.object.put(bucket, objectKey, {
        data_base64: body.imageBase64,
      });
      const resized = await infrai.image.resize({
        image: { base64: body.imageBase64 },
        width: 1280,
        height: 720,
        fit: "cover",
        enlarge: false,
        format: "webp",
        store: true,
      });
      return json(response, 201, delivery.attachCover(parts[1], resized.url));
    }

    if (method === "POST" && parts[0] === "courses" && parts[2] === "submissions") {
      const submission = delivery.recordSubmission(
        parts[1],
        learnerSubmissionBody.parse(await readJson(request)),
      );
      return json(response, 201, submission);
    }

    if (method === "GET" && parts[0] === "courses" && parts[2] === "report") {
      return json(response, 200, delivery.educatorReport(parts[1]));
    }

    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "Invalid request body", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(response, message === "Course not found" ? 404 : 500, { error: message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Course delivery service listening on http://localhost:${port}`));
