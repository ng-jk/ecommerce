// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: "2", recordId: "4" } }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { router: routing, useLocalSearchParams: () => routing.params,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]) };
});
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => createElement("div", {}, children) }));

const course = { id: 4, code: "native-course", title: "Native course", description: "Introduction", access_mode: "free" as const, status: "draft", version: 3 };
const lesson = { id: 5, course_id: 4, title: "Read", content: "Content", position: 1, version: 0 };
const question = { prompt: "Choose", options: ["A", "B"], correct_index: 1 };
const assessment = { id: 6, course_id: 4, title: "Quiz", pass_score: 80, attempt_limit: 2, version: 0, questions: [question] };
const enrollment = { id: 7, course_id: 4, platform_user_id: 8, status: "active", version: 0 };
const attempt = { id: 9, enrollment_id: 7, assessment_id: 6, number: 1, score: 100, status: "passed" };
const progress = { lessons_delivered: 1, lessons_total: 1, assessments_passed: 1, assessments_total: 1, delivery_is_not_proof_of_study: true };
const meta = { current_page: 1, last_page: 2, total: 2, per_page: 20 };
const detail = { course, lessons: { data: [lesson], meta }, assessments: { data: [assessment], meta }, options: { draft: "Draft", published: "Published", archived: "Archived" } };
const learning = {
  authorCourses: vi.fn(async () => ({ data: [course], meta })),
  courses: vi.fn(async () => ({ data: [course], meta })),
  enrollments: vi.fn(async () => ({ data: [enrollment], meta })),
  attempts: vi.fn(async () => ({ data: [attempt], meta })),
  authorCourse: vi.fn(async () => detail), course: vi.fn(async () => detail),
  createCourse: vi.fn(async () => ({ course })), updateCourse: vi.fn(async () => ({ course })),
  publishCourse: vi.fn(async () => ({ course: { ...course, status: "published" } })),
  archiveCourse: vi.fn(async () => ({ course: { ...course, status: "archived" } })),
  authorLesson: vi.fn(async () => ({ lesson })), readLesson: vi.fn(async () => ({ lesson, enrollment, progress })),
  createLesson: vi.fn(async () => ({ lesson })), updateLesson: vi.fn(async () => ({ lesson })),
  authorAssessment: vi.fn(async () => ({ assessment })),
  assessment: vi.fn(async () => ({ assessment: { ...assessment, questions: [{ prompt: question.prompt, options: question.options }] } })),
  createAssessment: vi.fn(async () => ({ assessment })), updateAssessment: vi.fn(async () => ({ assessment })),
  enroll: vi.fn(async () => ({ enrollment })), enrollment: vi.fn(async () => ({ enrollment, progress })),
  submitAttempt: vi.fn(async () => ({ attempt, enrollment, progress })),
};
const service = (application_key: string, available = true, entitled = true, state: string | null = "installed") =>
  ({ application_key, name: application_key === "erp" ? "ERP" : application_key.charAt(0).toUpperCase() + application_key.slice(1),
    available, entitled, state });
const workspace = { organization: vi.fn(async () => ({ can_update: true })),
  catalog: vi.fn(async (_id: string, page: number) => ({ data: page === 1
    ? [service("crm"), service("helpdesk"), service("learning"), service("builder")]
    : [service("erp"), service("insights"), service("hr"), service("commerce", true, false)],
  meta: { current_page: page, last_page: 2, total: 8, per_page: 4 } })) };
const session = { api: { learning, workspace }, user: { id: 8 } as { id: number } | null };
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => session,
  PlatformPage: ({ title, children }: { title: string; children: ReactNode }) => createElement("main", {}, createElement("h1", {}, title), children),
  PlatformText: ({ children }: { children: ReactNode }) => createElement("p", {}, children),
  PlatformButton: ({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, title),
  PlatformField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText(value: string): void }) =>
    createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value) }),
}));

import { LearningHub, LearningDirectory, LearningCourseRecord, LearningEnrollmentRecord, LearningLessonRecord,
  LearningAssessmentRecord, LearningCourseForm, LearningLessonForm, LearningAssessmentForm } from "../../frontend/admin/src/screens/platform_learning_screen";
import { PlatformServices } from "../../frontend/admin/src/screens/platform_services_screen";
import { learningBase, learningPath } from "../../frontend/admin/src/screens/platform_learning_screen/logic/model";
import type { LearningDirectoryKind } from "../../frontend/admin/src/screens/platform_learning_screen/interface/Directories";

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 8 };
  workspace.organization.mockResolvedValue({ can_update: true });
  workspace.catalog.mockImplementation(async (_id, page) => ({ data: page === 1
    ? [service("crm"), service("helpdesk"), service("learning"), service("builder")]
    : [service("erp"), service("insights"), service("hr"), service("commerce", true, false)],
  meta: { current_page: page, last_page: 2, total: 8, per_page: 4 } }));
  learning.authorCourse.mockResolvedValue(detail);
  learning.course.mockResolvedValue(detail);
  learning.authorLesson.mockResolvedValue({ lesson });
  learning.authorAssessment.mockResolvedValue({ assessment });
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => { root.render(element); });
  return {
    container,
    button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent?.includes(label))!; },
    async press(label: string) { await act(async () => { this.button(label).click(); }); },
    async fill(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    },
    async close() { await act(async () => root.unmount()); },
  };
}

it("shows an actionable empty service directory when no installation is accessible", async () => {
  workspace.catalog.mockResolvedValueOnce({ data: [],
    meta: { current_page: 1, last_page: 1, total: 0, per_page: 4 } });
  const view = await render(createElement(PlatformServices));
  expect(view.container.textContent).toContain("No active services on this page.");
  expect(view.button("Previous page").disabled).toBe(true);
  expect(view.button("Next page").disabled).toBe(true);
  await view.press("Organization");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/2");
  await view.close();
});

it("exposes service and Learning hubs only after current identity and organization load", async () => {
  const services = await render(createElement(PlatformServices));
  for (const name of ["Crm", "Helpdesk", "Learning", "Builder"]) expect(services.container.textContent).toContain(name);
  await services.press("Learning");
  expect(routing.push).toHaveBeenCalledWith(learningBase("2"));
  await services.press("Crm");
  await services.press("Helpdesk");
  await services.press("Builder");
  await services.press("Next page");
  expect(workspace.catalog).toHaveBeenCalledWith("2", 2, "", 4);
  await services.press("ERP");
  await services.press("Insights");
  await services.press("Hr");
  expect(services.container.textContent).not.toContain("Commerce");
  await services.press("Previous page");
  await services.press("Organization");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/crm");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/helpdesk");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/builder/pages");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/erp");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/insights");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/hr");
  expect(routing.replace).toHaveBeenCalledWith("/platform/organizations/2");
  await services.close();
  const hub = await render(createElement(LearningHub));
  await hub.press("Author courses");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "author/courses"));
  await hub.press("Courses");
  await hub.press("My enrollments");
  await hub.press("My attempts");
  await hub.press("Organization");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "courses"));
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "enrollments"));
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "attempts"));
  await hub.close();
  workspace.organization.mockResolvedValueOnce({ can_update: false });
  const member = await render(createElement(LearningHub));
  expect(member.container.textContent).not.toContain("Author courses");
  await member.close();
  session.user = null;
  const signedOut = await render(createElement(LearningHub));
  expect(signedOut.container.textContent).toContain("Sign in");
  expect(learning.authorCourses).not.toHaveBeenCalled();
  await signedOut.close();
});

it("pages author and learner directories and opens only server returned records", async () => {
  for (const kind of ["courses", "author/courses", "enrollments", "attempts"] as LearningDirectoryKind[]) {
    const view = await render(createElement(LearningDirectory, { kind }));
    expect(view.container.textContent).toContain(kind === "enrollments" ? "Course 4" : kind === "attempts" ? "Attempt 1" : "Native course");
    await view.press("Next");
    await view.press("Previous");
    await view.press("Learning");
    await view.press(kind === "enrollments" ? "Course 4" : kind === "attempts" ? "Attempt 1" : "Native course");
    if (kind === "author/courses") await view.press("Create course");
    await view.close();
  }
  expect(learning.courses).toHaveBeenCalledWith("2", 2);
  expect(learning.authorCourses).toHaveBeenCalledWith("2", 2);
  expect(learning.enroll).toHaveBeenCalledWith("2", { course_id: 4 });
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "author/courses/create"));
});

it("shows course author controls with current versions and enrolled learner content", async () => {
  learning.authorCourse.mockResolvedValueOnce(detail).mockResolvedValue({ ...detail, course: { ...course, status: "published", version: 4 } });
  const author = await render(createElement(LearningCourseRecord, { author: true }));
  await author.press("Edit course");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "author/courses/4/edit"));
  await author.press("Add lesson");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "author/courses/4/lessons/create"));
  await author.press("Add assessment");
  await author.press("Publish");
  expect(learning.publishCourse).toHaveBeenCalledWith("2", 4, { expected_version: 3 });
  await author.press("Archive");
  expect(learning.archiveCourse).toHaveBeenCalledWith("2", 4, { expected_version: 4 });
  await author.close();
  const learnerView = await render(createElement(LearningCourseRecord));
  await learnerView.press("My enrollment");
  expect(learning.enroll).toHaveBeenCalledWith("2", { course_id: 4 });
  await learnerView.close();
  const enrollmentView = await render(createElement(LearningEnrollmentRecord));
  expect(enrollmentView.container.textContent).toContain("Delivery is not proof of study");
  await enrollmentView.press("Course");
  await enrollmentView.close();
});

it("shows author answer key and learner redacted questions, then sends selected answers", async () => {
  const author = await render(createElement(LearningAssessmentRecord, { author: true }));
  expect(author.container.textContent).toContain("Correct: B");
  await author.press("Edit assessment");
  await author.close();
  const learnerView = await render(createElement(LearningAssessmentRecord));
  expect(learnerView.container.textContent).not.toContain("Correct:");
  await learnerView.press("B");
  await learnerView.press("Submit answers");
  expect(learning.submitAttempt).toHaveBeenCalledWith("2", 6, { answers: [1] });
  expect(learnerView.container.textContent).toContain("100%");
  await learnerView.close();
  const lessonView = await render(createElement(LearningLessonRecord));
  expect(lessonView.container.textContent).toContain("Delivery is not proof of study");
  await lessonView.close();
});

it("creates course, lesson, and assessment with the latest course version", async () => {
  const create = await render(createElement(LearningCourseForm));
  await create.fill("Code", "NATIVE-COURSE");
  await create.press("Access:");
  await create.press("Access:");
  await create.press("Save course");
  expect(learning.createCourse).toHaveBeenCalledWith("2", { code: "native-course", title: "", description: "", access_mode: "free" });
  await create.close();
  const edit = await render(createElement(LearningCourseForm, { edit: true }));
  await edit.press("Access:");
  await edit.press("Save course");
  expect(learning.updateCourse).toHaveBeenCalledWith("2", 4, { title: "Native course", description: "Introduction", access_mode: "paid", expected_version: 3 });
  await edit.close();
  const lessonForm = await render(createElement(LearningLessonForm));
  await lessonForm.press("Author courses");
  await lessonForm.press("Save lesson");
  expect(learning.createLesson).toHaveBeenCalledWith("2", { course_id: 4, expected_version: 3, title: "", content: "", position: 1 });
  await lessonForm.close();
  const assessmentForm = await render(createElement(LearningAssessmentForm));
  await assessmentForm.press("Author courses");
  await assessmentForm.press("Add option");
  await assessmentForm.press("Next correct option");
  await assessmentForm.press("Save assessment");
  expect(learning.createAssessment).toHaveBeenCalledWith("2", expect.objectContaining({ course_id: 4, expected_version: 3, attempt_limit: 3 }));
  await assessmentForm.close();
});

it("guards signed-out pages and exposes retry after current API failures", async () => {
  session.user = null;
  const signedOutHub = await render(createElement(LearningHub));
  await signedOutHub.press("Sign in");
  await signedOutHub.close();
  for (const element of [createElement(PlatformServices), createElement(LearningDirectory, { kind: "courses" }),
    createElement(LearningCourseRecord), createElement(LearningEnrollmentRecord), createElement(LearningLessonRecord),
    createElement(LearningAssessmentRecord), createElement(LearningCourseForm), createElement(LearningLessonForm),
    createElement(LearningAssessmentForm)]) {
    const view = await render(element);
    expect(view.container.textContent).toContain("Sign in");
    await view.press("Sign in");
    await view.close();
  }
  expect(routing.replace).toHaveBeenCalledWith("/platform/login");
  session.user = { id: 8 };
  workspace.catalog.mockRejectedValueOnce(new Error("Catalog unavailable"));
  const services = await render(createElement(PlatformServices));
  expect(services.container.textContent).toContain("Catalog unavailable");
  await services.press("Retry");
  expect(services.container.textContent).toContain("Builder");
  await services.press("Builder");
  expect(routing.push).toHaveBeenCalledWith("/platform/organizations/2/builder/pages");
  await services.close();
  workspace.organization.mockRejectedValueOnce(new Error("Learning organization unavailable"));
  const hub = await render(createElement(LearningHub));
  expect(hub.container.textContent).toContain("Learning organization unavailable");
  await hub.press("Retry");
  expect(hub.container.textContent).toContain("Author courses");
  await hub.close();
  learning.courses.mockRejectedValueOnce(new Error("Courses unavailable"));
  const directory = await render(createElement(LearningDirectory, { kind: "courses" }));
  expect(directory.container.textContent).toContain("Courses unavailable");
  await directory.press("Retry");
  expect(directory.container.textContent).toContain("Native course");
  await directory.close();
  learning.enrollment.mockRejectedValueOnce(new Error("Enrollment unavailable"));
  const enrollmentView = await render(createElement(LearningEnrollmentRecord));
  expect(enrollmentView.container.textContent).toContain("Enrollment unavailable");
  await enrollmentView.press("Retry");
  expect(enrollmentView.container.textContent).toContain("Lesson");
  await enrollmentView.close();
});

it("uses server failures as actionable feedback during enrollment and author transitions", async () => {
  learning.courses.mockResolvedValueOnce({ data: [], meta });
  const empty = await render(createElement(LearningDirectory, { kind: "courses" }));
  expect(empty.container.textContent).toContain("No records on this page");
  await empty.close();
  learning.enroll.mockRejectedValueOnce(new Error("Payment required"));
  const list = await render(createElement(LearningDirectory, { kind: "courses" }));
  await list.press("Enroll:");
  expect(list.container.textContent).toContain("Payment required");
  await list.press("Enroll:");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "courses/4"));
  await list.close();
  learning.publishCourse.mockRejectedValueOnce(new Error("Add a lesson first"));
  const author = await render(createElement(LearningCourseRecord, { author: true }));
  await author.press("Publish");
  expect(author.container.textContent).toContain("Add a lesson first");
  await author.press("Publish");
  expect(learning.publishCourse).toHaveBeenCalledTimes(2);
  await author.close();
  learning.submitAttempt.mockRejectedValueOnce(new Error("Attempt limit reached"));
  const quiz = await render(createElement(LearningAssessmentRecord));
  await quiz.press("B");
  await quiz.press("Submit answers");
  expect(quiz.container.textContent).toContain("Attempt limit reached");
  await quiz.close();
});

it("edits loaded lesson and assessment versions and keeps published content read-only", async () => {
  const authorLesson = await render(createElement(LearningLessonRecord, { author: true }));
  await authorLesson.press("Edit lesson");
  expect(routing.push).toHaveBeenCalledWith(learningPath("2", "author/lessons/5/edit"));
  await authorLesson.close();
  const lessonForm = await render(createElement(LearningLessonForm, { edit: true }));
  await lessonForm.fill("Position", "2");
  await lessonForm.press("Save lesson");
  expect(learning.updateLesson).toHaveBeenCalledWith("2", 5, { expected_version: 0, title: "Read", content: "Content", position: 2 });
  await lessonForm.close();
  const form = await render(createElement(LearningAssessmentForm, { edit: true }));
  await form.press("Add question");
  await form.press("Remove last question");
  await form.press("Remove last option");
  await form.press("Save assessment");
  expect(learning.updateAssessment).toHaveBeenCalledWith("2", 6, expect.objectContaining({ expected_version: 0, title: "Quiz" }));
  await form.close();
  learning.authorCourse.mockResolvedValueOnce({ ...detail, course: { ...course, status: "published" } });
  const publishedForm = await render(createElement(LearningCourseRecord, { author: true }));
  expect(publishedForm.container.textContent).not.toContain("Add lesson");
  expect(publishedForm.container.textContent).toContain("Archive");
  await publishedForm.close();
});

it("navigates content and pages while preserving author versus learner destinations", async () => {
  for (const author of [true, false]) {
    const view = await render(createElement(LearningCourseRecord, { author }));
    await view.press("Read");
    await view.press("Quiz");
    await view.press("Next");
    await view.press("Previous");
    await view.press(author ? "Author courses" : "Courses");
    expect(routing.push).toHaveBeenCalledWith(learningPath("2", `${author ? "author/" : ""}lessons/5`));
    expect(routing.push).toHaveBeenCalledWith(learningPath("2", `${author ? "author/" : ""}assessments/6`));
    expect(author ? learning.authorCourse : learning.course).toHaveBeenCalledWith("2", "4", 2);
    await view.close();
  }
  const lessonView = await render(createElement(LearningLessonRecord, { author: true }));
  await lessonView.press("Learning");
  expect(routing.replace).toHaveBeenCalledWith(learningPath("2", "courses"));
  await lessonView.close();
  const enrollmentView = await render(createElement(LearningEnrollmentRecord));
  await enrollmentView.press("My enrollments");
  expect(routing.replace).toHaveBeenCalledWith(learningPath("2", "enrollments"));
  await enrollmentView.close();
});

it("reports missing course, lesson, and assessment records with retry", async () => {
  learning.course.mockRejectedValueOnce(new Error("Course unavailable"));
  const courseView = await render(createElement(LearningCourseRecord));
  expect(courseView.container.textContent).toContain("Course unavailable");
  await courseView.press("Retry");
  expect(courseView.container.textContent).toContain("Native course");
  await courseView.close();
  learning.readLesson.mockRejectedValueOnce(new Error("Lesson unavailable"));
  const lessonView = await render(createElement(LearningLessonRecord));
  expect(lessonView.container.textContent).toContain("Lesson unavailable");
  await lessonView.press("Retry");
  expect(lessonView.container.textContent).toContain("Read");
  await lessonView.close();
  learning.assessment.mockRejectedValueOnce(new Error("Assessment unavailable"));
  const assessmentView = await render(createElement(LearningAssessmentRecord));
  expect(assessmentView.container.textContent).toContain("Assessment unavailable");
  await assessmentView.press("Retry");
  expect(assessmentView.container.textContent).toContain("Quiz");
  await assessmentView.press("Courses");
  await assessmentView.close();
});

it("keeps course status, answer options, and author form failures visible", async () => {
  learning.authorCourse.mockResolvedValueOnce({ ...detail, course: { ...course, status: "archived", description: undefined }, options: {} });
  const archived = await render(createElement(LearningCourseRecord, { author: true }));
  expect(archived.container.textContent).toContain("archived");
  expect(archived.container.textContent).not.toContain("Publish");
  await archived.close();
  learning.createCourse.mockRejectedValueOnce(new Error("Code reserved"));
  const courseForm = await render(createElement(LearningCourseForm));
  await courseForm.press("Save course");
  expect(courseForm.container.textContent).toContain("Code reserved");
  await courseForm.press("Author courses");
  await courseForm.close();
  learning.createLesson.mockRejectedValueOnce(new Error("Position reserved"));
  const lessonForm = await render(createElement(LearningLessonForm));
  await lessonForm.press("Save lesson");
  expect(lessonForm.container.textContent).toContain("Position reserved");
  await lessonForm.close();
  learning.createAssessment.mockRejectedValueOnce(new Error("Answer invalid"));
  const assessmentForm = await render(createElement(LearningAssessmentForm));
  await assessmentForm.press("Save assessment");
  expect(assessmentForm.container.textContent).toContain("Answer invalid");
  await assessmentForm.close();
});

it("edits every author field, nested option, and validation error without reverting cleared text", async () => {
  learning.updateCourse.mockRejectedValueOnce(new ApiError("Invalid course", 422, "validation", { title: ["Required"] }));
  const courseForm = await render(createElement(LearningCourseForm, { edit: true }));
  await courseForm.fill("Title", "");
  expect(courseForm.container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe("");
  await courseForm.fill("Description", "Rewritten");
  await courseForm.press("Access:");
  await courseForm.press("Save course");
  expect(courseForm.container.textContent).toContain("title: Required");
  expect(learning.updateCourse).toHaveBeenCalledWith("2", 4, { title: "", description: "Rewritten", access_mode: "paid", expected_version: 3 });
  await courseForm.close();
  const lessonForm = await render(createElement(LearningLessonForm, { edit: true }));
  await lessonForm.fill("Title", "New lesson");
  await lessonForm.fill("Content", "New content");
  await lessonForm.press("Save lesson");
  expect(learning.updateLesson).toHaveBeenCalledWith("2", 5, { title: "New lesson", content: "New content", position: 1, expected_version: 0 });
  await lessonForm.close();
  const assessmentForm = await render(createElement(LearningAssessmentForm, { edit: true }));
  await assessmentForm.press("Add question");
  const prompts = [...assessmentForm.container.querySelectorAll<HTMLInputElement>('input[aria-label="Prompt"]')];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(prompts[1], "Second prompt");
    prompts[1].dispatchEvent(new Event("input", { bubbles: true }));
    prompts[1].dispatchEvent(new Event("change", { bubbles: true }));
  });
  await assessmentForm.press("Remove last question");
  await assessmentForm.fill("Title", "New quiz");
  await assessmentForm.fill("Pass score (1–100)", "90");
  await assessmentForm.fill("Attempt limit (1–10)", "4");
  await assessmentForm.fill("Prompt", "New prompt");
  await assessmentForm.fill("Option 2 (correct)", "New B");
  await assessmentForm.press("Add option");
  await assessmentForm.press("Remove last option");
  await assessmentForm.press("Save assessment");
  expect(learning.updateAssessment).toHaveBeenCalledWith("2", 6, expect.objectContaining({
    title: "New quiz", pass_score: 90, attempt_limit: 4,
    questions: [{ prompt: "New prompt", options: ["A", "New B"], correct_index: 1 }],
  }));
  await assessmentForm.close();
});

it("retries failed author form loads and respects unavailable or published courses", async () => {
  learning.authorCourse.mockRejectedValueOnce(new Error("Course draft unavailable"));
  const courseForm = await render(createElement(LearningCourseForm, { edit: true }));
  expect(courseForm.container.textContent).toContain("Course draft unavailable");
  await courseForm.press("Retry");
  await courseForm.press("Access:");
  await courseForm.press("Access:");
  expect(courseForm.container.textContent).toContain("free");
  await courseForm.close();

  learning.authorLesson.mockRejectedValueOnce(new Error("Lesson draft unavailable"));
  const lessonForm = await render(createElement(LearningLessonForm, { edit: true }));
  expect(lessonForm.container.textContent).toContain("Lesson draft unavailable");
  await lessonForm.press("Retry");
  expect(lessonForm.container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe("Read");
  await lessonForm.close();
  learning.authorCourse.mockRejectedValueOnce(new Error("Course unavailable"));
  const createLesson = await render(createElement(LearningLessonForm));
  expect(createLesson.container.textContent).toContain("Course unavailable");
  await createLesson.press("Retry");
  await createLesson.close();

  learning.authorAssessment.mockRejectedValueOnce(new Error("Assessment draft unavailable"));
  const assessmentForm = await render(createElement(LearningAssessmentForm, { edit: true }));
  expect(assessmentForm.container.textContent).toContain("Assessment draft unavailable");
  await assessmentForm.press("Retry");
  expect(assessmentForm.container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe("Quiz");
  await assessmentForm.close();
  learning.authorCourse.mockRejectedValueOnce(new Error("Course unavailable"));
  const createAssessment = await render(createElement(LearningAssessmentForm));
  expect(createAssessment.container.textContent).toContain("Course unavailable");
  await createAssessment.press("Retry");
  await createAssessment.close();

  learning.authorCourse.mockResolvedValueOnce({ ...detail, course: { ...course, status: "published" } });
  const publishedLesson = await render(createElement(LearningLessonForm));
  expect(publishedLesson.button("Save lesson").disabled).toBe(true);
  await publishedLesson.close();
  learning.authorCourse.mockResolvedValueOnce({ ...detail, course: { ...course, status: "published" } });
  const publishedAssessment = await render(createElement(LearningAssessmentForm));
  expect(publishedAssessment.button("Save assessment").disabled).toBe(true);
  await publishedAssessment.close();
});
