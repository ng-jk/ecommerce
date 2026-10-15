import { z } from "zod";
import * as schema from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createLearningClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${schema.learningId.parse(organizationId)}/learning`;
  const path = (
    organizationId: string | number,
    collection: string,
    id: string | number,
  ) => `${base(organizationId)}/${collection}/${schema.learningId.parse(id)}`;
  const paged = (
    organizationId: string | number,
    collection: string,
    page: number,
    perPage: number,
    status = "",
  ) => {
    const query = new URLSearchParams({
      page: String(schema.learningPage.parse(page)),
      per_page: String(z.number().int().min(1).max(50).parse(perPage)),
    });
    if (status) query.set("status", status);
    return `${base(organizationId)}/${collection}?${query.toString()}`;
  };
  return {
    authorCourses: (
      org: string | number,
      page = 1,
      perPage = 20,
      status = "",
    ) =>
      request(
        paged(org, "author/courses", page, perPage, status),
        schema.courseList,
      ),
    createCourse: (
      org: string | number,
      input: z.input<typeof schema.createCourse>,
    ) =>
      request(
        `${base(org)}/courses`,
        schema.courseResult,
        "POST",
        schema.createCourse.parse(input),
      ),
    authorCourse: (
      org: string | number,
      id: string | number,
      page = 1,
      perPage = 20,
    ) =>
      request(
        `${path(org, "author/courses", id)}?page=${schema.learningPage.parse(page)}&per_page=${z.number().int().min(1).max(50).parse(perPage)}`,
        schema.courseDetail,
      ),
    updateCourse: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateCourse>,
    ) =>
      request(
        path(org, "courses", id),
        schema.courseResult,
        "PUT",
        schema.updateCourse.parse(input),
      ),
    publishCourse: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.expectedVersion>,
    ) =>
      request(
        `${path(org, "courses", id)}/publish`,
        schema.courseResult,
        "POST",
        schema.expectedVersion.parse(input),
      ),
    archiveCourse: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.expectedVersion>,
    ) =>
      request(
        `${path(org, "courses", id)}/archive`,
        schema.courseResult,
        "POST",
        schema.expectedVersion.parse(input),
      ),
    createLesson: (
      org: string | number,
      input: z.input<typeof schema.createLesson>,
    ) =>
      request(
        `${base(org)}/lessons`,
        schema.lessonResult,
        "POST",
        schema.createLesson.parse(input),
      ),
    updateLesson: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateLesson>,
    ) =>
      request(
        path(org, "lessons", id),
        schema.lessonResult,
        "PUT",
        schema.updateLesson.parse(input),
      ),
    authorLesson: (org: string | number, id: string | number) =>
      request(path(org, "author/lessons", id), schema.lessonResult),
    createAssessment: (
      org: string | number,
      input: z.input<typeof schema.createAssessment>,
    ) =>
      request(
        `${base(org)}/assessments`,
        schema.assessmentResult,
        "POST",
        schema.createAssessment.parse(input),
      ),
    updateAssessment: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.updateAssessment>,
    ) =>
      request(
        path(org, "assessments", id),
        schema.assessmentResult,
        "PUT",
        schema.updateAssessment.parse(input),
      ),
    authorAssessment: (org: string | number, id: string | number) =>
      request(
        path(org, "author/assessments", id),
        schema.authorAssessmentResult,
      ),
    courses: (org: string | number, page = 1, perPage = 20) =>
      request(paged(org, "courses", page, perPage), schema.courseList),
    course: (
      org: string | number,
      id: string | number,
      page = 1,
      perPage = 20,
    ) =>
      request(
        `${path(org, "courses", id)}?page=${schema.learningPage.parse(page)}&per_page=${z.number().int().min(1).max(50).parse(perPage)}`,
        schema.courseDetail,
      ),
    enroll: (
      org: string | number,
      input: z.input<typeof schema.createEnrollment>,
    ) =>
      request(
        `${base(org)}/enrollments`,
        schema.enrollmentResult,
        "POST",
        schema.createEnrollment.parse(input),
      ),
    enrollments: (org: string | number, page = 1, perPage = 20) =>
      request(paged(org, "enrollments", page, perPage), schema.enrollmentList),
    enrollment: (org: string | number, id: string | number) =>
      request(path(org, "enrollments", id), schema.enrollmentDetail),
    readLesson: (org: string | number, id: string | number) =>
      request(path(org, "lessons", id), schema.lessonReadResult),
    assessment: (org: string | number, id: string | number) =>
      request(path(org, "assessments", id), schema.learnerAssessmentResult),
    submitAttempt: (
      org: string | number,
      id: string | number,
      input: z.input<typeof schema.submitAnswers>,
    ) =>
      request(
        `${path(org, "assessments", id)}/attempts`,
        schema.attemptResult,
        "POST",
        schema.submitAnswers.parse(input),
      ),
    attempts: (org: string | number, page = 1, perPage = 20) =>
      request(paged(org, "attempts", page, perPage), schema.attemptList),
  };
}
