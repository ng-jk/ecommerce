import { z } from "zod";

const id = z.number().int().positive();
const version = z.number().int().nonnegative();
export const learningId = z.coerce.number().int().positive();
export const learningPage = z.number().int().min(1).max(1000000);
const pageMeta = z.object({
  current_page: learningPage,
  last_page: learningPage,
  total: version,
  per_page: z.number().int().min(1).max(50),
});
const pageOf = <T extends z.ZodTypeAny>(record: T) =>
  z.object({ data: z.array(record), meta: pageMeta });

export const course = z.object({
  id,
  code: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  access_mode: z.enum(["free", "paid"]),
  version,
});
export const courseList = pageOf(course);
export type LearningCourse = z.infer<typeof course>;
export const lesson = z.object({
  id,
  course_id: id.optional(),
  title: z.string(),
  content: z.string().optional(),
  position: z.number().int().positive(),
  version,
});
export type LearningLesson = z.infer<typeof lesson>;
export const authorQuestion = z.object({
  prompt: z.string(),
  options: z.array(z.string()),
  correct_index: z.number().int().nonnegative(),
});
export const learnerQuestion = authorQuestion.omit({ correct_index: true });
export const assessment = z.object({
  id,
  course_id: id.optional(),
  title: z.string(),
  pass_score: z.number().int().min(1).max(100),
  attempt_limit: z.number().int().min(1).max(10),
  version,
});
export type LearningAssessment = z.infer<typeof assessment>;
export const enrollment = z.object({
  id,
  course_id: id,
  platform_user_id: id,
  status: z.string(),
  version,
});
export const attempt = z.object({
  id,
  enrollment_id: id,
  assessment_id: id,
  number: id,
  score: z.number().int().min(0).max(100),
  status: z.string(),
});
export const progress = z.object({
  lessons_delivered: version,
  lessons_total: version,
  assessments_passed: version,
  assessments_total: version,
  delivery_is_not_proof_of_study: z.literal(true),
});
export const courseResult = z.object({ course });
export const courseDetail = courseResult.extend({
  lessons: pageOf(lesson),
  assessments: pageOf(assessment),
  options: z.record(z.string()),
});
export const lessonResult = z.object({ lesson });
export const assessmentResult = z.object({ assessment });
export const authorAssessmentResult = z.object({
  assessment: assessment.extend({ questions: z.array(authorQuestion) }),
});
export const learnerAssessmentResult = z.object({
  assessment: assessment.extend({ questions: z.array(learnerQuestion) }),
});
export const enrollmentResult = z.object({ enrollment });
export const enrollmentDetail = enrollmentResult.extend({ progress });
export const lessonReadResult = lessonResult.extend({ enrollment, progress });
export const attemptResult = z.object({ attempt, enrollment, progress });
export const enrollmentList = pageOf(enrollment);
export const attemptList = pageOf(attempt);

export const createCourse = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    access_mode: z.enum(["free", "paid"]),
  })
  .strict();
export const updateCourse = createCourse
  .omit({ code: true })
  .extend({ expected_version: version })
  .strict();
export const expectedVersion = z.object({ expected_version: version }).strict();
export const createLesson = z
  .object({
    course_id: id,
    expected_version: version,
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(20000),
    position: z.number().int().min(1).max(10000),
  })
  .strict();
export const updateLesson = createLesson.omit({ course_id: true }).strict();
export const questionInput = authorQuestion
  .extend({
    options: z.array(z.string().min(1).max(500)).min(2).max(6),
    prompt: z.string().min(1).max(1000),
  })
  .strict();
export const createAssessment = z
  .object({
    course_id: id,
    expected_version: version,
    title: z.string().min(1).max(200),
    questions: z.array(questionInput).min(1).max(20),
    pass_score: z.number().int().min(1).max(100),
    attempt_limit: z.number().int().min(1).max(10),
  })
  .strict()
  .refine(
    (data) => data.questions.every((q) => q.correct_index < q.options.length),
    "Answer index must match an option.",
  );
export const updateAssessment = createAssessment
  .innerType()
  .omit({ course_id: true })
  .strict()
  .refine(
    (data) => data.questions.every((q) => q.correct_index < q.options.length),
    "Answer index must match an option.",
  );
export const createEnrollment = z.object({ course_id: id }).strict();
export const submitAnswers = z
  .object({ answers: z.array(z.number().int().nonnegative()).min(1).max(20) })
  .strict();
