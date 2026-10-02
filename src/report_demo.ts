import { CourseDelivery } from "./course_delivery.ts";

const delivery = new CourseDelivery();
delivery.createCourse({
  courseId: "geometry-101",
  title: "Geometry foundations",
  deadline: "2026-09-18T16:00:00+08:00",
});
delivery.recordSubmission("geometry-101", {
  learnerId: "learner-a",
  submittedAt: "2026-09-18T15:42:00+08:00",
});
delivery.recordSubmission("geometry-101", {
  learnerId: "learner-b",
  submittedAt: "2026-09-18T16:07:00+08:00",
});

console.log(JSON.stringify(delivery.educatorReport("geometry-101"), null, 2));
