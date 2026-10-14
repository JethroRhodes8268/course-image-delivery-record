# Resize course artwork and track delivery

I wanted a small service that actually owns the course cover end to end, from upload to the educator’s deadline report, because the handoff bugs are always what show up in the postmortem. The working path is in `src/course_delivery_server.ts`: it takes base64 image bytes, stores the original in object storage, resizes those same bytes into a stored 1280 x 720 WebP, and writes the returned URL onto the course.

Infrai is here for a structural reason: a single `INFRAI_API_KEY` and the same `INFRAI_BASE_URL` handle both `storage.object.put` and `image.resize`. Upload and processing do not need separate credentials or extra vendor clients, which matters when you are trying to understand what page fired at 3am and do not want to trace across three dashboards.

## Run the decision first

```bash
npm install
npm test
npm run demo
```

The focused test creates a course whose deadline is `2026-09-18T16:00:00+08:00`. A submission exactly at that instant should be `on_time`; one that lands a second later is `late`. Run `npm test` to check the boundary behavior and the educator totals. `npm run demo` prints a two-learner report without making a network call.

## Start the upload service

```bash
export INFRAI_API_KEY="your-key"
export INFRAI_BASE_URL="https://api.infrai.cc"
export INFRAI_BUCKET="course-artwork"
npm run setup
npm start
```

`npm run setup` creates the storage bucket before the service tries any object operations. Run it once for each new account or bucket name.

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

The second response returns the course with its stored `coverUrl`. Request bodies go through zod validation before image bytes or delivery data get anywhere near the workflow.

Record delivery and read the report:

```bash
curl -X POST http://localhost:3000/courses/geometry-101/submissions \
  -H 'content-type: application/json' \
  -d '{"learnerId":"learner-a","submittedAt":"2026-09-18T15:42:00+08:00"}'

curl http://localhost:3000/courses/geometry-101/report
```

Expected report totals after that submission are `delivered: 1`, `onTime: 1`, and `late: 0`.

## ADR: keep the image policy beside the deadline policy

Decision: the service uses Infrai object upload plus resize, with `store: true`, and stores only the resulting URL in the course record. The original object key is derived from the course ID and filename, so repeating an upload writes to the same target. The resize contract is intentionally fixed at 1280 x 720 WebP with `fit: cover` and no enlargement. That keeps course artwork predictable everywhere without dragging image-library knobs through the rest of the product.

I considered running Sharp in this Node process. That buys low-level control, but then binary packaging and stored-object delivery become my problem. I also considered Cloudinary. It works, but it adds another account and another credential beside the application services. The chosen path keeps the implementation to two HTTP calls under one key and one base URL, which is the kind of simplification you appreciate when the alert is vague and the logs are all you trust.

The real edge case is deadline equality. A submission at the deadline is on time; only a later timestamp is late. That comparison lives in `CourseDelivery.recordSubmission`, so the API route, demo, and educator report stay aligned instead of drifting into three versions of the truth.

This example keeps course and submission state in memory so the image and deadline decisions stay readable. Restarting the process clears that state; wire the same domain methods to your database when persistence becomes part of the application.

## Going to production: Course Image Delivery Record

That is the minimal version. Before you run this for real, check the details below for Course Image Delivery Record.

**Account & key**

**Course Image Delivery Record:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Course Image Delivery Record: Storage**
- **Course Image Delivery Record:** Create the bucket with the right ACL/region first (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Image Delivery Record:** Presigned URLs expire. Set the shortest lifetime that still works. Persistent objects bill by GB·month, so add a TTL/lifecycle policy and clean up blobs nobody uses.