<?php

namespace Tests\Feature;

use App\Models\ServiceDelivery;
use App\Modules\Learning\AuthorizedLearningScope;
use App\Modules\Learning\LearningActions;
use App\Modules\Learning\LearningCommandHandler;
use App\Modules\Learning\Models\LearningAssessment as Assessment;
use App\Modules\Learning\Models\LearningAttempt as Attempt;
use App\Modules\Learning\Models\LearningCourse as Course;
use App\Modules\Learning\Models\LearningCourseAccessGrant as AccessGrant;
use App\Modules\Learning\Models\LearningEnrollment as Enrollment;
use App\Modules\Learning\Models\LearningLesson as Lesson;
use App\Modules\Learning\Models\LearningLessonView as LessonView;
use App\Modules\Platform\Services\ServiceAuthentication;
use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\TestCase;

class LearningTest extends TestCase
{
    protected bool $settleOperations = false;

    protected function setUp(): void
    {
        parent::setUp();
        $migration = require database_path('migrations/services/learning/2026_10_13_031046_create_learning_tables.php');
        $migration->down();
        $migration->up();
        if (! Schema::hasTable('service_inboxes')) {
            (require database_path('migrations/2026_10_13_015300_create_service_exchange_tables.php'))->up();
        }
        foreach (['service_inboxes', 'service_deliveries'] as $table) {
            DB::table($table)->delete();
        }
    }

    private function message(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        return ['id' => (string) Str::uuid(), 'source' => 'platform', 'destination' => 'learning', 'topic' => 'learning.command',
            'version' => 1, 'payload' => ['scope' => ['organization_id' => $org, 'platform_user_id' => $user, 'token_id' => 1,
                'auth_version' => 0, 'application' => 'learning', 'action' => 'learning.'.$action],
                'command' => ['operation_id' => (string) Str::uuid(), 'input' => $input, ...($id === null ? [] : ['id' => $id])]]];
    }

    private function runAction(string $action, array $input = [], ?int $id = null, int $user = 7, int $org = 11): array
    {
        $scope = AuthorizedLearningScope::fromVerifiedExchange($this->message($action, $input, $id, $user, $org), fn (): bool => true);

        return DB::transaction(fn () => app(LearningActions::class)->execute($scope, $input, $id));
    }

    private function denied(callable $run, int $status): void
    {
        try {
            $run();
            $this->fail('Expected rejection.');
        } catch (HttpExceptionInterface $error) {
            $this->assertSame($status, $error->getStatusCode());
        }
    }

    private function draft(string $access = 'free'): Course
    {
        $result = $this->runAction('courses.create', ['code' => 'course-'.Str::lower(Str::random(10)), 'title' => 'Course',
            'description' => 'Description', 'access_mode' => $access]);

        return Course::findOrFail($result['course']['id']);
    }

    private function content(Course $course): array
    {
        $lesson = $this->runAction('lessons.create', ['course_id' => $course->id, 'expected_version' => $course->refresh()->version,
            'title' => 'Lesson', 'content' => 'Native content', 'position' => 1])['lesson'];
        $assessment = $this->runAction('assessments.create', ['course_id' => $course->id, 'expected_version' => $course->refresh()->version,
            'title' => 'Quiz', 'questions' => [['prompt' => 'One plus one?', 'options' => ['Two', 'Three'], 'correct_index' => 0]],
            'pass_score' => 100, 'attempt_limit' => 2])['assessment'];

        return [$lesson['id'], $assessment['id']];
    }

    private function publish(Course $course): void
    {
        $this->runAction('courses.publish', ['expected_version' => $course->refresh()->version], $course->id);
    }

    public function test_authoring_publication_and_server_scored_completion(): void
    {
        $course = $this->draft();
        $this->denied(fn () => $this->publish($course), 409);
        $this->runAction('courses.update', ['title' => 'Updated', 'description' => 'Updated description', 'access_mode' => 'free',
            'expected_version' => 0], $course->id);
        [$lesson, $assessment] = $this->content($course);
        $this->assertSame(1, $this->runAction('courses.author.list', ['status' => 'draft', 'page' => '1', 'per_page' => '1'])['meta']['total']);
        $this->assertSame(0, $this->runAction('courses.list')['meta']['total']);
        $detail = $this->runAction('courses.author.detail', [], $course->id);
        $this->assertSame(1, $detail['lessons']['meta']['total']);
        $this->assertSame('Native content', $this->runAction('lessons.author.detail', [], $lesson)['lesson']['content']);
        $this->assertSame(0, $this->runAction('assessments.author.detail', [], $assessment)['assessment']['questions'][0]['correct_index']);
        $this->runAction('lessons.update', ['expected_version' => 0, 'title' => 'Revised', 'content' => 'Revised content', 'position' => 1], $lesson);
        $this->runAction('assessments.update', ['expected_version' => 0, 'title' => 'Revised quiz',
            'questions' => [['prompt' => 'One plus one?', 'options' => ['Two', 'Three'], 'correct_index' => 0]], 'pass_score' => 100, 'attempt_limit' => 2], $assessment);
        $this->publish($course);
        $this->assertSame(1, $this->runAction('courses.list')['meta']['total']);
        $enrollment = $this->runAction('enrollments.create', ['course_id' => $course->id])['enrollment'];
        $this->assertSame($enrollment['id'], $this->runAction('enrollments.create', ['course_id' => $course->id])['enrollment']['id']);
        $this->assertSame(1, $this->runAction('courses.detail', [], $course->id)['assessments']['meta']['total']);
        $quiz = $this->runAction('assessments.detail', [], $assessment);
        $this->assertArrayNotHasKey('correct_index', $quiz['assessment']['questions'][0]);
        $first = $this->runAction('attempts.submit', ['answers' => [1]], $assessment);
        $this->assertSame(0, $first['attempt']['score']);
        $this->assertSame('active', $first['enrollment']['status']);
        $second = $this->runAction('attempts.submit', ['answers' => [0]], $assessment);
        $this->assertSame(100, $second['attempt']['score']);
        $this->assertSame('active', $second['enrollment']['status']);
        $read = $this->runAction('lessons.read', [], $lesson);
        $this->assertSame('complete', $read['enrollment']['status']);
        $this->assertTrue($read['progress']['delivery_is_not_proof_of_study']);
        $this->assertSame(1, $this->runAction('lessons.read', [], $lesson)['enrollment']['version']);
        $this->assertSame(1, $this->runAction('enrollments.list')['meta']['total']);
        $this->assertSame(2, $this->runAction('attempts.list')['meta']['total']);
        $this->assertSame('complete', $this->runAction('enrollments.detail', [], $enrollment['id'])['enrollment']['status']);
        $this->denied(fn () => $this->runAction('attempts.submit', ['answers' => [0]], $assessment), 409);
        $this->assertStringNotContainsString('correct_index', DB::table('learning_assessments')->value('questions'));
        $this->denied(fn () => $this->runAction('lessons.update', ['expected_version' => 1, 'title' => 'x', 'content' => 'x', 'position' => 1], $lesson), 409);
        $this->runAction('courses.archive', ['expected_version' => $course->refresh()->version], $course->id);
        $this->denied(fn () => $this->runAction('lessons.read', [], $lesson), 404);
        $this->denied(fn () => $this->runAction('courses.archive', ['expected_version' => $course->refresh()->version], $course->id), 409);
    }

    public function test_paid_access_requires_current_server_settlement_and_is_tenant_scoped(): void
    {
        $course = $this->draft('paid');
        [$lesson, $assessment] = $this->content($course);
        $this->publish($course);
        $this->denied(fn () => $this->runAction('enrollments.create', ['course_id' => $course->id]), 403);
        $grant = AccessGrant::factory()->create(['course_id' => $course->id, 'platform_user_id' => 7]);
        $enrollment = $this->runAction('enrollments.create', ['course_id' => $course->id])['enrollment'];
        $this->runAction('lessons.read', [], $lesson);
        $grant->update(['revoked_at' => now()]);
        $this->denied(fn () => $this->runAction('assessments.detail', [], $assessment), 403);
        $grant->update(['revoked_at' => null, 'expires_at' => now()->subSecond()]);
        $this->denied(fn () => $this->runAction('lessons.read', [], $lesson), 403);
        $grant->update(['expires_at' => now()->addHour()]);
        $this->assertSame(1, $this->runAction('enrollments.detail', [], $enrollment['id'])['progress']['lessons_delivered']);
        $this->assertSame(0, $this->runAction('enrollments.list', [], null, 8)['meta']['total']);
        $this->assertSame(0, $this->runAction('courses.list', [], null, 7, 12)['meta']['total']);
        $this->expectException(ModelNotFoundException::class);
        $this->runAction('lessons.read', [], $lesson, 7, 12);
    }

    public function test_strict_input_conflicts_and_no_client_completion_authority(): void
    {
        $course = $this->draft();
        $this->denied(fn () => $this->runAction('courses.create', ['code' => $course->code, 'title' => 'Duplicate',
            'description' => 'duplicate', 'access_mode' => 'free']), 409);
        $this->denied(fn () => $this->runAction('courses.update', ['expected_version' => 99, 'title' => 'x', 'description' => 'x', 'access_mode' => 'free'], $course->id), 409);
        $this->denied(fn () => $this->runAction('courses.list', [], 1), 422);
        [$lesson, $assessment] = $this->content($course);
        $this->denied(fn () => $this->runAction('lessons.create', ['course_id' => $course->id, 'expected_version' => $course->refresh()->version,
            'title' => 'Duplicate position', 'content' => 'x', 'position' => 1]), 409);
        $this->denied(fn () => $this->runAction('assessments.update', ['expected_version' => 0, 'title' => 'Bad',
            'questions' => [['prompt' => 'x', 'options' => ['a', 'b'], 'correct_index' => 2]], 'pass_score' => 50, 'attempt_limit' => 1], $assessment), 422);
        $this->publish($course);
        $this->runAction('enrollments.create', ['course_id' => $course->id]);
        $this->denied(fn () => $this->runAction('attempts.submit', ['answers' => [9]], $assessment), 422);
        $this->denied(fn () => $this->runAction('attempts.submit', ['answers' => [0, 0]], $assessment), 422);
        $this->expectException(ValidationException::class);
        $this->runAction('attempts.submit', ['answers' => [0], 'score' => 100, 'complete' => true], $assessment);
    }

    public function test_trusted_scope_is_exact_and_authority_must_be_positive_boolean(): void
    {
        $message = $this->message('courses.list');
        $this->assertNull(AuthorizedLearningScope::fromVerifiedExchange($message, fn (): bool => false));
        try {
            AuthorizedLearningScope::fromVerifiedExchange($message, fn (): int => 1);
            $this->fail();
        } catch (\LogicException) {
            $this->assertTrue(true);
        }
        foreach ([['source' => 'learning'], ['payload' => [...$message['payload'], 'admin' => true]], ['version' => 2]] as $override) {
            try {
                AuthorizedLearningScope::fromVerifiedExchange([...$message, ...$override], fn (): bool => true);
                $this->fail();
            } catch (ValidationException) {
                $this->assertTrue(true);
            }
        }
        $scope = AuthorizedLearningScope::fromVerifiedExchange($message, fn (): bool => true);
        $this->expectException(\LogicException::class);
        app(LearningActions::class)->execute($scope, []);
    }

    public function test_handler_commits_effect_and_response_once_and_records_safe_errors(): void
    {
        $exchange = new ServiceExchange;
        $transport = new ServiceTransport('https://platform.test', str_repeat('k', 32), 'learning', 'platform');
        Http::fake(function ($request) {
            $body = json_encode(['nonce' => $request['nonce'], 'allowed' => true]);

            return Http::response($body, 200, ['Content-Type' => 'application/json', 'X-Service-Receipt' => ServiceAuthentication::receipt(str_repeat('k', 32), $request->header('X-Service-Nonce')[0], $body)]);
        });
        $handler = new LearningCommandHandler($exchange, $transport, app(LearningActions::class));
        $message = $this->message('courses.create', ['code' => 'worker-course', 'title' => 'Worker', 'description' => 'Native', 'access_mode' => 'free']);
        $exchange->accept($message, 'platform', 'learning');
        $this->assertTrue($handler->consumeOne());
        $this->assertFalse($handler->consumeOne());
        $exchange->accept($message, 'platform', 'learning');
        $this->assertFalse($handler->consumeOne());
        $this->assertSame(1, Course::count());
        $response = json_decode(ServiceDelivery::firstOrFail()->envelope, true);
        $this->assertSame(201, $response['payload']['http_status']);
        foreach ([['courses.create', ['code' => '!'], null, 422], ['courses.author.detail', [], 999, 404],
            ['courses.publish', ['expected_version' => 0], Course::firstOrFail()->id, 409]] as [$action, $input, $id, $status]) {
            $exchange->accept($this->message($action, $input, $id), 'platform', 'learning');
            $this->assertTrue($handler->consumeOne());
            $this->assertSame($status, json_decode(ServiceDelivery::orderByDesc('id')->firstOrFail()->envelope, true)['payload']['http_status']);
        }
        Course::creating(fn () => abort(503));
        $exchange->accept($this->message('courses.create', ['code' => 'failed-service', 'title' => 'x', 'description' => 'x', 'access_mode' => 'free']), 'platform', 'learning');
        $this->assertTrue($handler->consumeOne());
        Course::flushEventListeners();
        Course::creating(fn () => throw new QueryException('sqlite', 'insert', [], new \PDOException('failure', 1234)));
        $this->travel(4)->seconds();
        $this->assertTrue($handler->consumeOne());
        Course::flushEventListeners();
    }

    public function test_model_options_and_factories_match_persistent_states(): void
    {
        foreach ([Course::class, Lesson::class, Assessment::class, Enrollment::class, Attempt::class, LessonView::class, AccessGrant::class] as $class) {
            $model = $class::factory()->make();
            $this->assertNotEmpty($model->getAttributes());
            $this->assertIsArray($model->toArray());
        }
        $this->assertSame(['draft', 'published', 'archived'], array_keys(Course::options()));
        $this->assertSame(['free', 'paid'], array_keys(Course::options('access_mode')));
        $this->assertSame(['active', 'complete'], array_keys(Enrollment::options()));
        $this->assertSame(['passed', 'failed'], array_keys(Attempt::options()));
        $this->assertSame(['verified_settlement'], array_keys(AccessGrant::options()));
    }
}
