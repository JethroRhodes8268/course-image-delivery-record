import assert from "node:assert/strict";
import test from "node:test";
import { CourseDelivery } from "./course_delivery.ts";

test("the educator report separates submissions at and after the deadline", () => {
  const delivery = new CourseDelivery();
  delivery.createCourse({
    courseId: "geometry-101",
    title: "Geometry foundations",
    deadline: "2026-09-18T16:00:00+08:00",
  });

  delivery.recordSubmission("geometry-101", {
    learnerId: "learner-a",
    submittedAt: "2026-09-18T16:00:00+08:00",
  });
  delivery.recordSubmission("geometry-101", {
    learnerId: "learner-b",
    submittedAt: "2026-09-18T16:00:01+08:00",
  });

  const report = delivery.educatorReport("geometry-101");
  assert.deepEqual(
    { delivered: report.delivered, onTime: report.onTime, late: report.late },
    { delivered: 2, onTime: 1, late: 1 },
  );
});
