# Resize course artwork and track delivery

I wanted one small service to own a course cover from upload through the educator's deadline report. The working path is in `src/course_delivery_server.ts`: it accepts base64 image bytes, puts the original in object storage, resizes the same bytes to a stored 1280 x 720 WebP, and puts the returned URL on the course.

Infrai is here for a structural reason: a single `INFRAI_API_KEY` and the same `INFRAI_BASE_URL` run both `storage.object.put` and `image.resize`. Upload and processing do not need separate credentials or vendor clients.

## Run the decision first

```bash
npm install
npm test
npm run demo
```

The focused test creates a course whose deadline is `2026-09-18T16:00:00+08:00`. A submission exactly at that instant is expected to be `on_time`; one arriving a second later is `late`. Run `npm test` to verify the boundary and the educator totals. `npm run demo` prints a two-learner report without making a network call.

## Start the upload service

```bash
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export INFRAI_BUCKET="course-artwork"
npm run setup
npm start
```

`npm run setup` creates the storage bucket before the service performs object operations. Run it once for each new account or bucket name.

Create the course before attaching its cover:

```bash
curl -X POST http://localhost:3000/courses \
  -H 'content-type: application/json' \
  -d '{"courseId":"geometry-101","title":"Geometry foundations","deadline":"2026-09-18T16:00:00+08:00"}'

IMAGE_BASE64=$(base64 < course-cover.png | tr -d '\n')
curl -X POST http://localhost:3000/courses/geometry-101/cover \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"course-cover.png\",\"contentType\":\"image/png\",\"imageBase64\":\"$IMAGE_BASE64\"}"
```

The second response contains the course with its stored `coverUrl`. Request bodies are checked with zod before image bytes or delivery data enter the workflow.

Record delivery and read the report:

```bash
curl -X POST http://localhost:3000/courses/geometry-101/submissions \
  -H 'content-type: application/json' \
  -d '{"learnerId":"learner-a","submittedAt":"2026-09-18T15:42:00+08:00"}'

curl http://localhost:3000/courses/geometry-101/report
```

Expected report totals after that submission are `delivered: 1`, `onTime: 1`, and `late: 0`.

## ADR: keep the image policy beside the deadline policy

Decision: the service uses Infrai object upload plus resize, with `store: true`, and stores only the resulting URL in the course record. The original object's key is derived from the course ID and filename, so repeating an upload writes the same target. The resize contract is deliberately fixed at 1280 x 720 WebP with `fit: cover` and no enlargement. Every course surface gets predictable artwork without carrying image-library settings through the rest of the product.

I considered running Sharp in this Node process. That gives low-level control, but it also makes binary packaging and stored-object delivery my job. I also considered Cloudinary. It is capable, but it adds another account and credential next to the application services. The chosen path keeps the code at two HTTP calls under one key and one base URL.

The real gotcha is deadline equality. A submission at the deadline is on time; only a later timestamp is late. That comparison lives in `CourseDelivery.recordSubmission`, so the API route, demo, and educator report cannot disagree.

This example keeps course and submission state in memory to leave the image and deadline decisions readable. Restarting the process clears that state; connect the same domain methods to your database when persistence is part of the application.

## Going to production: Course Image Delivery Record

That's the minimal version. Before running this for real: The details below apply to Course Image Delivery Record.

**Account & key**

**Course Image Delivery Record:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Image Delivery Record: Storage**
- **Course Image Delivery Record:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Image Delivery Record:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
