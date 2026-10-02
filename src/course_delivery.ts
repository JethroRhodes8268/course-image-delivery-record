import { z } from "zod";

export const createCourseBody = z.object({
  courseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
  title: z.string().min(1).max(160),
  deadline: z.string().datetime({ offset: true }),
});

export const coverUploadBody = z.object({
  filename: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  imageBase64: z.string().min(1),
});

export const learnerSubmissionBody = z.object({
  learnerId: z.string().min(1).max(80),
  submittedAt: z.string().datetime({ offset: true }),
});

export type Course = z.infer<typeof createCourseBody> & { coverUrl?: string };
export type SubmissionStatus = "on_time" | "late";
export type Submission = z.infer<typeof learnerSubmissionBody> & {
  courseId: string;
  status: SubmissionStatus;
};

export class CourseDelivery {
  private readonly courses = new Map<string, Course>();
  private readonly submissions: Submission[] = [];

  createCourse(input: z.infer<typeof createCourseBody>): Course {
    const course = { ...input };
    this.courses.set(course.courseId, course);
    return course;
  }

  requireCourse(courseId: string): Course {
    const course = this.courses.get(courseId);
    if (!course) throw new Error("Course not found");
    return course;
  }

  attachCover(courseId: string, coverUrl: string): Course {
    const course = this.requireCourse(courseId);
    const updated = { ...course, coverUrl };
    this.courses.set(courseId, updated);
    return updated;
  }

  recordSubmission(courseId: string, input: z.infer<typeof learnerSubmissionBody>): Submission {
    const course = this.requireCourse(courseId);
    const status: SubmissionStatus = Date.parse(input.submittedAt) <= Date.parse(course.deadline)
      ? "on_time"
      : "late";
    const submission = { courseId, ...input, status };
    this.submissions.push(submission);
    return submission;
  }

  educatorReport(courseId: string) {
    const course = this.requireCourse(courseId);
    const rows = this.submissions.filter((item) => item.courseId === courseId);
    return {
      courseId,
      title: course.title,
      deadline: course.deadline,
      coverUrl: course.coverUrl ?? null,
      delivered: rows.length,
      onTime: rows.filter((item) => item.status === "on_time").length,
      late: rows.filter((item) => item.status === "late").length,
      submissions: rows,
    };
  }
}
