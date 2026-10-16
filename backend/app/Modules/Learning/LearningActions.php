<?php

namespace App\Modules\Learning;

use App\Modules\Learning\Models\LearningAssessment as Assessment;
use App\Modules\Learning\Models\LearningAttempt as Attempt;
use App\Modules\Learning\Models\LearningCourse as Course;
use App\Modules\Learning\Models\LearningCourseAccessGrant as AccessGrant;
use App\Modules\Learning\Models\LearningEnrollment as Enrollment;
use App\Modules\Learning\Models\LearningLesson as Lesson;
use App\Modules\Learning\Models\LearningLessonView as LessonView;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class LearningActions
{
    /** Central action permission and the stored command/result binding are checked by ServiceResultAuthority. */
    public function authorizeResult(AuthorizedLearningScope $scope, array $command, array $result): bool
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Learning result authorization requires a local transaction.');
        }
        $kind = explode('.', $scope->action)[1];
        [$class, $field] = match ($kind) {
            'courses' => [Course::class, 'course'],
            'lessons' => [Lesson::class, 'lesson'],
            'assessments' => [Assessment::class, 'assessment'],
            'enrollments' => [Enrollment::class, 'enrollment'],
            'attempts' => [Attempt::class, 'attempt'],
        };
        $list = str_ends_with($scope->action, '.list');
        $records = $list ? ($result['data'] ?? null) : (isset($result[$field]) ? [$result[$field]] : null);
        if (! is_array($records) || ! array_is_list($records) || count($records) > 50) {
            return false;
        }
        $seen = [];
        foreach ($records as $record) {
            if (! is_array($record) || ! is_int($record['id'] ?? null) || $record['id'] < 1 || isset($seen[$record['id']])) {
                return false;
            }
            $seen[$record['id']] = true;
            // Parent references and enrollment ownership are immutable; lock the course before learner access.
            $row = $class::whereKey($record['id'])->firstOrFail();
            $subject = $kind === 'attempts' ? $row->assessment_id : $row->id;
            if (! $list && isset($command['id']) && $subject !== $command['id']) {
                return false;
            }
            $enrollment = $kind === 'attempts'
                ? Enrollment::whereKey($row->enrollment_id)->firstOrFail() : null;
            if ($kind === 'enrollments') {
                $enrollment = $row;
            }
            if ($enrollment !== null && $enrollment->platform_user_id !== $scope->platformUserId) {
                return false;
            }
            $course = $this->course($scope, $kind === 'courses' ? $row->id : ($enrollment?->course_id ?? $row->course_id));
            if (isset($command['input']['course_id']) && $course->id !== $command['input']['course_id']) {
                return false;
            }
            if ($scope->action === 'learning.courses.list') {
                abort_unless($course->status === Course::Published, 404);
            } elseif (in_array($scope->action, ['learning.courses.detail', 'learning.lessons.read',
                'learning.assessments.detail', 'learning.enrollments.create', 'learning.enrollments.list',
                'learning.enrollments.detail', 'learning.attempts.submit', 'learning.attempts.list'], true)) {
                $current = $this->access($scope, $course);
                if (isset($result['enrollment']['id']) && $current->id !== $result['enrollment']['id']) {
                    return false;
                }
            }
        }

        return true;
    }

    public function execute(AuthorizedLearningScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('Learning actions require the fenced inbox transaction.');
        }
        $targeted = in_array($scope->action, ['learning.courses.author.detail', 'learning.courses.update', 'learning.courses.publish',
            'learning.courses.archive', 'learning.lessons.update', 'learning.assessments.update', 'learning.courses.detail',
            'learning.enrollments.detail', 'learning.lessons.author.detail', 'learning.assessments.author.detail', 'learning.lessons.read', 'learning.assessments.detail', 'learning.attempts.submit'], true);
        abort_unless($targeted ? $id !== null && $id > 0 : $id === null, 422);

        return match ($scope->action) {
            'learning.courses.author.list', 'learning.courses.list' => $this->courses($scope, $input),
            'learning.courses.create' => $this->createCourse($scope, $input),
            'learning.courses.author.detail', 'learning.courses.detail' => $this->courseDetail($scope, $id, $input),
            'learning.courses.update', 'learning.courses.publish', 'learning.courses.archive' => $this->changeCourse($scope, $id, $input),
            'learning.lessons.create', 'learning.lessons.update' => $this->saveContent($scope, $id, $input, false),
            'learning.assessments.create', 'learning.assessments.update' => $this->saveContent($scope, $id, $input, true),
            'learning.enrollments.create' => $this->enroll($scope, $input),
            'learning.enrollments.list', 'learning.attempts.list' => $this->learnerList($scope, $input),
            'learning.enrollments.detail' => $this->enrollmentDetail($scope, $id, $input),
            'learning.lessons.author.detail', 'learning.assessments.author.detail' => $this->authorContent($scope, $id, $input),
            'learning.lessons.read' => $this->readLesson($scope, $id, $input),
            'learning.assessments.detail' => $this->assessmentDetail($scope, $id, $input),
            'learning.attempts.submit' => $this->submit($scope, $id, $input),
        };
    }

    private function courses(AuthorizedLearningScope $scope, array $input): array
    {
        $data = $this->validate($input, [...$this->pageRules(), 'status' => ['sometimes', Rule::in(array_keys(Course::options()))]]);
        $query = Course::where('organization_id', $scope->organizationId);
        if ($scope->action === 'learning.courses.list') {
            $query->where('status', Course::Published);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        return $this->page($query, $data, ['id', 'code', 'title', 'status', 'access_mode', 'version']);
    }

    private function createCourse(AuthorizedLearningScope $scope, array $input): array
    {
        $data = $this->validate($input, ['code' => ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9-]{2,79}$/D'],
            'title' => 'required|string|max:200', 'description' => 'required|string|max:10000', 'access_mode' => ['required', Rule::in(array_keys(Course::options('access_mode')))]]);
        $course = $this->unique(fn () => Course::create([...$data, 'organization_id' => $scope->organizationId,
            'created_by_platform_user_id' => $scope->platformUserId]));

        return ['course' => $course->toArray()];
    }

    private function course(AuthorizedLearningScope $scope, int $id): Course
    {
        return Course::where('organization_id', $scope->organizationId)->whereKey($id)->lockForUpdate()->firstOrFail();
    }

    private function courseDetail(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $input = $this->validate($input, $this->pageRules());
        $course = $this->course($scope, $id);
        $author = $scope->action === 'learning.courses.author.detail';
        if (! $author) {
            $this->access($scope, $course);
        }

        return ['course' => $course->toArray(),
            'lessons' => $this->page(Lesson::where('course_id', $id), $input, ['id', 'title', 'position', 'version']),
            'assessments' => $this->page(Assessment::where('course_id', $id), $input, ['id', 'title', 'pass_score', 'attempt_limit', 'version']),
            'options' => Course::options()];
    }

    private function changeCourse(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $update = $scope->action === 'learning.courses.update';
        $data = $this->validate($input, ['expected_version' => 'required|integer:strict|min:0',
            ...($update ? ['title' => 'required|string|max:200', 'description' => 'required|string|max:10000', 'access_mode' => ['required', Rule::in(array_keys(Course::options('access_mode')))]] : [])]);
        $course = $this->course($scope, $id);
        $this->version($course, $data['expected_version']);
        abort_if($course->status === Course::Archived || ($update && $course->status !== Course::Draft), 409);
        if ($scope->action === 'learning.courses.publish') {
            abort_unless($course->status === Course::Draft && Lesson::where('course_id', $id)->exists()
                && Assessment::where('course_id', $id)->exists(), 409, 'A draft needs lessons and assessments before publication.');
            $data = ['status' => Course::Published];
        } elseif ($scope->action === 'learning.courses.archive') {
            $data = ['status' => Course::Archived];
        }
        unset($data['expected_version']);
        $course->update([...$data, 'version' => $course->version + 1]);

        return ['course' => $course->fresh()->toArray()];
    }

    private function saveContent(AuthorizedLearningScope $scope, ?int $id, array $input, bool $assessment): array
    {
        $class = $assessment ? Assessment::class : Lesson::class;
        $rules = ['expected_version' => 'required|integer:strict|min:0', 'title' => 'required|string|max:200',
            ...($id === null ? ['course_id' => 'required|integer:strict|min:1'] : [])];
        $rules += $assessment ? ['questions' => 'required|array|min:1|max:20', 'questions.*' => 'required|array:prompt,options,correct_index',
            'questions.*.prompt' => 'required|string|max:1000', 'questions.*.options' => 'required|array|min:2|max:6',
            'questions.*.options.*' => 'required|string|max:500', 'questions.*.correct_index' => 'required|integer:strict|min:0',
            'pass_score' => 'required|integer:strict|min:1|max:100', 'attempt_limit' => 'required|integer:strict|min:1|max:10']
            : ['content' => 'required|string|max:20000', 'position' => 'required|integer:strict|min:1|max:10000'];
        $data = $this->validate($input, $rules);
        if ($assessment) {
            foreach ($data['questions'] as $question) {
                abort_unless(array_is_list($data['questions']) && array_is_list($question['options'])
                    && $question['correct_index'] < count($question['options']), 422);
            }
        }
        $reference = $id === null ? null : $class::findOrFail($id);
        $course = $this->course($scope, $reference?->course_id ?? $data['course_id']);
        abort_unless($course->status === Course::Draft, 409, 'Published course content is immutable.');
        $record = $id === null ? null : $class::whereKey($id)->lockForUpdate()->firstOrFail();
        $this->version($record ?? $course, $data['expected_version']);
        unset($data['expected_version'], $data['course_id']);
        $record = $this->unique(function () use ($record, $class, $data, $course): Model {
            if ($record) {
                $record->update([...$data, 'version' => $record->version + 1]);

                return $record;
            }

            return $class::create([...$data, 'course_id' => $course->id]);
        });
        $course->increment('version');

        return [$assessment ? 'assessment' : 'lesson' => $record->toArray()];
    }

    private function enroll(AuthorizedLearningScope $scope, array $input): array
    {
        $data = $this->validate($input, ['course_id' => 'required|integer:strict|min:1']);
        $course = $this->course($scope, $data['course_id']);
        $this->available($scope, $course);
        $enrollment = Enrollment::firstOrCreate(['course_id' => $course->id, 'platform_user_id' => $scope->platformUserId]);

        return ['enrollment' => $enrollment->toArray()];
    }

    private function available(AuthorizedLearningScope $scope, Course $course): void
    {
        abort_unless($course->status === Course::Published, 404);
        abort_unless($course->access_mode === Course::Free || AccessGrant::where('course_id', $course->id)
            ->where('platform_user_id', $scope->platformUserId)->where('source', AccessGrant::VerifiedSettlement)->whereNull('revoked_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->exists(), 403,
            'Paid course access requires a current verified settlement grant.');
    }

    private function access(AuthorizedLearningScope $scope, Course $course): Enrollment
    {
        $this->available($scope, $course);

        return Enrollment::where('course_id', $course->id)->where('platform_user_id', $scope->platformUserId)
            ->lockForUpdate()->firstOrFail();
    }

    private function learnerList(AuthorizedLearningScope $scope, array $input): array
    {
        $data = $this->validate($input, $this->pageRules());
        $courses = Course::where('organization_id', $scope->organizationId)->select('id');
        $enrollments = Enrollment::whereIn('course_id', $courses)->where('platform_user_id', $scope->platformUserId);

        return $scope->action === 'learning.enrollments.list'
            ? $this->page($enrollments, $data, ['id', 'course_id', 'status', 'version'])
            : $this->page(Attempt::whereIn('enrollment_id', $enrollments->select('id')), $data, ['id', 'assessment_id', 'number', 'score', 'status']);
    }

    private function enrollmentDetail(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);
        $reference = Enrollment::whereKey($id)->where('platform_user_id', $scope->platformUserId)->firstOrFail();
        $course = $this->course($scope, $reference->course_id);

        return $this->progress($this->access($scope, $course), $course);
    }

    private function readLesson(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);
        $lesson = Lesson::findOrFail($id);
        $course = $this->course($scope, $lesson->course_id);
        $enrollment = $this->access($scope, $course);
        LessonView::firstOrCreate(['enrollment_id' => $enrollment->id, 'lesson_id' => $id]);

        return ['lesson' => $lesson->toArray(), ...$this->progress($enrollment, $course)];
    }

    private function authorContent(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);
        $assessment = $scope->action === 'learning.assessments.author.detail';
        $record = $assessment ? Assessment::findOrFail($id) : Lesson::findOrFail($id);
        $this->course($scope, $record->course_id);

        return [$assessment ? 'assessment' : 'lesson' => $assessment
            ? [...$record->toArray(), 'questions' => $record->questions] : $record->toArray()];
    }

    private function assessmentDetail(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);
        $assessment = Assessment::findOrFail($id);
        $this->access($scope, $this->course($scope, $assessment->course_id));

        return ['assessment' => [...$assessment->toArray(), 'questions' => array_map(
            fn (array $question): array => ['prompt' => $question['prompt'], 'options' => $question['options']], $assessment->questions)]];
    }

    private function submit(AuthorizedLearningScope $scope, int $id, array $input): array
    {
        $data = $this->validate($input, ['answers' => 'required|array|min:1|max:20', 'answers.*' => 'required|integer:strict|min:0']);
        $assessment = Assessment::findOrFail($id);
        $course = $this->course($scope, $assessment->course_id);
        $enrollment = $this->access($scope, $course);
        $number = Attempt::withTrashed()->where('enrollment_id', $enrollment->id)->where('assessment_id', $id)->count() + 1;
        abort_if($number > $assessment->attempt_limit, 409, 'Assessment attempt limit reached.');
        abort_unless(array_is_list($data['answers']) && count($data['answers']) === count($assessment->questions), 422);
        $correct = 0;
        foreach ($assessment->questions as $index => $question) {
            abort_unless($data['answers'][$index] < count($question['options']), 422);
            $correct += (int) ($data['answers'][$index] === $question['correct_index']);
        }
        $score = intdiv(100 * $correct, count($assessment->questions));
        $attempt = Attempt::create(['enrollment_id' => $enrollment->id, 'assessment_id' => $id, 'number' => $number,
            'score' => $score, 'status' => $score >= $assessment->pass_score ? Attempt::Passed : Attempt::Failed, 'answers' => $data['answers']]);

        return ['attempt' => $attempt->toArray(), ...$this->progress($enrollment, $course)];
    }

    private function progress(Enrollment $enrollment, Course $course): array
    {
        $lessons = Lesson::where('course_id', $course->id)->count();
        $delivered = LessonView::where('enrollment_id', $enrollment->id)->count();
        $assessments = Assessment::where('course_id', $course->id)->count();
        $passed = Attempt::where('enrollment_id', $enrollment->id)->where('status', Attempt::Passed)->distinct()->count('assessment_id');
        if ($lessons > 0 && $assessments > 0 && $delivered === $lessons && $passed === $assessments && $enrollment->status !== Enrollment::Complete) {
            $enrollment->update(['status' => Enrollment::Complete, 'version' => $enrollment->version + 1]);
        }

        return ['enrollment' => $enrollment->toArray(), 'progress' => ['lessons_delivered' => $delivered, 'lessons_total' => $lessons,
            'assessments_passed' => $passed, 'assessments_total' => $assessments, 'delivery_is_not_proof_of_study' => true]];
    }

    private function version(Model $model, int $expected): void
    {
        abort_unless($model->version === $expected, 409, 'Record changed. Refresh before retrying.');
    }

    private function validate(array $input, array $rules): array
    {
        foreach (['page', 'per_page'] as $field) {
            if (isset($rules[$field], $input[$field]) && is_string($input[$field]) && preg_match('/^[1-9][0-9]{0,6}$/D', $input[$field])) {
                $input[$field] = (int) $input[$field];
            }
        }
        $allowed = array_filter(array_keys($rules), fn (string $key): bool => ! str_contains($key, '.'));
        foreach (array_diff(array_keys($input), $allowed) as $field) {
            throw ValidationException::withMessages([$field => 'Unknown field.']);
        }

        return Validator::make($input, $rules)->validate();
    }

    private function pageRules(): array
    {
        return ['page' => 'sometimes|integer:strict|min:1|max:1000000', 'per_page' => 'sometimes|integer:strict|min:1|max:50'];
    }

    private function page(Builder $query, array $input, array $columns): array
    {
        $page = $query->orderBy('id')->paginate($input['per_page'] ?? 20, $columns, 'page', $input['page'] ?? 1);

        return ['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
            'total' => $page->total(), 'per_page' => $page->perPage()]];
    }

    private function unique(callable $write): Model
    {
        try {
            return DB::transaction($write);
        } catch (QueryException $error) {
            if (in_array($error->getCode(), ['23505', '23000', '19'], true)) {
                abort(409, 'The unique value is already reserved.');
            }
            throw $error;
        }
    }
}
