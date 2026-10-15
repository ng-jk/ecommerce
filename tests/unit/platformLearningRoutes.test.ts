// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../../frontend/admin/src/screens/platform_learning_screen", () => ({
  LearningHub: () => createElement("span", {}, "hub"),
  LearningDirectory: ({ kind }: { kind: string }) => createElement("span", {}, `directory:${kind}`),
  LearningCourseRecord: ({ author }: { author?: boolean }) => createElement("span", {}, author ? "course:author" : "course:learner"),
  LearningEnrollmentRecord: () => createElement("span", {}, "enrollment"),
  LearningLessonRecord: ({ author }: { author?: boolean }) => createElement("span", {}, author ? "lesson:author" : "lesson:learner"),
  LearningAssessmentRecord: ({ author }: { author?: boolean }) => createElement("span", {}, author ? "assessment:author" : "assessment:learner"),
  LearningCourseForm: ({ edit }: { edit?: boolean }) => createElement("span", {}, edit ? "course:edit" : "course:create"),
  LearningLessonForm: ({ edit }: { edit?: boolean }) => createElement("span", {}, edit ? "lesson:edit" : "lesson:create"),
  LearningAssessmentForm: ({ edit }: { edit?: boolean }) => createElement("span", {}, edit ? "assessment:edit" : "assessment:create"),
}));
vi.mock("../../frontend/admin/src/screens/platform_services_screen", () => ({
  PlatformServices: () => createElement("span", {}, "services"),
}));

import Services from "../../frontend/admin/src/app/platform/organizations/[id]/service-hub";
import Hub from "../../frontend/admin/src/app/platform/organizations/[id]/learning";
import Courses from "../../frontend/admin/src/app/platform/organizations/[id]/learning/courses";
import Course from "../../frontend/admin/src/app/platform/organizations/[id]/learning/courses/[recordId]";
import AuthorCourses from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses";
import CreateCourse from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses/create";
import AuthorCourse from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses/[recordId]";
import EditCourse from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses/[recordId]/edit";
import CreateLesson from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses/[recordId]/lessons/create";
import CreateAssessment from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/courses/[recordId]/assessments/create";
import AuthorLesson from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/lessons/[recordId]";
import EditLesson from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/lessons/[recordId]/edit";
import AuthorAssessment from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/assessments/[recordId]";
import EditAssessment from "../../frontend/admin/src/app/platform/organizations/[id]/learning/author/assessments/[recordId]/edit";
import Enrollments from "../../frontend/admin/src/app/platform/organizations/[id]/learning/enrollments";
import Enrollment from "../../frontend/admin/src/app/platform/organizations/[id]/learning/enrollments/[recordId]";
import Attempts from "../../frontend/admin/src/app/platform/organizations/[id]/learning/attempts";
import Lesson from "../../frontend/admin/src/app/platform/organizations/[id]/learning/lessons/[recordId]";
import Assessment from "../../frontend/admin/src/app/platform/organizations/[id]/learning/assessments/[recordId]";

it.each([
  [Services, "services"], [Hub, "hub"], [Courses, "directory:courses"], [Course, "course:learner"],
  [AuthorCourses, "directory:author/courses"], [CreateCourse, "course:create"], [AuthorCourse, "course:author"],
  [EditCourse, "course:edit"], [CreateLesson, "lesson:create"], [CreateAssessment, "assessment:create"],
  [AuthorLesson, "lesson:author"], [EditLesson, "lesson:edit"], [AuthorAssessment, "assessment:author"],
  [EditAssessment, "assessment:edit"], [Enrollments, "directory:enrollments"], [Enrollment, "enrollment"],
  [Attempts, "directory:attempts"], [Lesson, "lesson:learner"], [Assessment, "assessment:learner"],
] as const)("wires each Learning page to its intended screen: %s", async (Page, expected) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(Page)));
  expect(container.textContent).toBe(expected);
  await act(async () => root.unmount());
});
