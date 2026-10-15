<?php

namespace Tests\Feature;

use App\Modules\Hr\AuthorizedHrScope;
use App\Modules\Hr\HrActions;
use App\Modules\Hr\Models\HrAttendance;
use App\Modules\Hr\Models\HrAttendanceCorrection;
use App\Modules\Hr\Models\HrEmployee;
use App\Modules\Hr\Models\HrLeaveRequest;
use App\Modules\Hr\Models\HrLeaveType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use LogicException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class HrActionsTest extends TestCase
{
    use DatabaseMigrations;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--path' => 'database/migrations/services/hr', '--force' => true]);
    }

    private function envelope(string $action, array $input = [], int $org = 7, int $actor = 11, ?int $subject = null): array
    {
        $scope = ['platform_user_id' => $actor, 'organization_id' => $org, 'application' => 'hr',
            'action' => $action, 'auth_version' => 0, 'token_id' => 43];
        if ($subject !== null) {
            $scope['subject_platform_user_id'] = $subject;
        }

        return ['id' => 'e37a3e1e-62df-4b13-bbbf-fc0963f5c189', 'source' => 'platform',
            'destination' => 'hr', 'topic' => 'hr.command', 'version' => 1,
            'payload' => ['scope' => $scope, 'command' => ['input' => $input,
                'operation_id' => '3b630bea-44aa-4567-91c7-d61d70161802']]];
    }

    private function act(string $action, array $input = [], ?int $id = null, int $org = 7, int $actor = 11,
        ?int $subject = null): array
    {
        $scope = AuthorizedHrScope::fromVerifiedExchange($this->envelope($action, $input, $org, $actor, $subject),
            fn (): bool => true);

        return DB::transaction(fn (): array => app(HrActions::class)->execute($scope, $input, $id));
    }

    private function rejects(callable $effect, string $type): void
    {
        try {
            $effect();
            $this->fail('Request unexpectedly succeeded.');
        } catch (\Throwable $error) {
            $this->assertInstanceOf($type, $error);
        }
    }

    public function test_signed_scope_requires_exact_target_and_envelope(): void
    {
        $valid = $this->envelope('hr.employees.create', ['linked_platform_user_id' => 22], 7, 11, 22);
        $scope = AuthorizedHrScope::fromVerifiedExchange($valid, fn (): bool => true);
        $this->assertSame([7, 11, 'hr.employees.create', 22],
            [$scope->organizationId, $scope->platformUserId, $scope->action, $scope->subjectPlatformUserId]);
        $this->assertNull(AuthorizedHrScope::fromVerifiedExchange($valid, fn (): bool => false));
        foreach (['source' => 'browser', 'destination' => 'crm', 'topic' => 'crm.command', 'version' => 2, 'id' => 'bad'] as $key => $value) {
            $invalid = $valid;
            $invalid[$key] = $value;
            $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        }
        foreach (['application' => 'crm', 'organization_id' => 0, 'auth_version' => -1, 'action' => 'hr.fake'] as $key => $value) {
            $invalid = $valid;
            $invalid['payload']['scope'][$key] = $value;
            $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        }
        $invalid = $valid;
        $invalid['payload']['command']['input']['linked_platform_user_id'] = 23;
        $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        $invalid = $valid;
        unset($invalid['payload']['scope']['subject_platform_user_id']);
        $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        $invalid = $valid;
        $invalid['payload']['extra'] = true;
        $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        $invalid = $valid;
        $invalid['payload']['command']['id'] = 0;
        $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($invalid, fn (): bool => true), InvalidArgumentException::class);
        $this->rejects(fn () => AuthorizedHrScope::fromVerifiedExchange($valid, fn () => 'yes'), LogicException::class);
        $this->rejects(fn () => app(HrActions::class)->execute($scope, ['code' => 'unfenced']), LogicException::class);
    }

    public function test_all_seventeen_actions_cover_employee_attendance_leave_and_audit(): void
    {
        $employee = $this->act('hr.employees.create', ['code' => 'staff-one', 'display_name' => 'Maya',
            'timezone' => 'Asia/Kuala_Lumpur', 'linked_platform_user_id' => 22], null, 7, 11, 22)['employee'];
        $this->assertSame('Maya', $this->act('hr.employees.mine.detail', [], null, 7, 22)['employee']['display_name']);
        $this->assertSame($employee['id'], $this->act('hr.employees.owner.detail', [], $employee['id'])['employee']['id']);
        $this->assertSame(1, $this->act('hr.employees.list', ['page' => '1', 'per_page' => '1', 'status' => 'active'])['meta']['total']);
        $employee = $this->act('hr.employees.update', ['display_name' => 'Maya Updated',
            'timezone' => 'Asia/Kuala_Lumpur', 'status' => 'active', 'expected_version' => 0], $employee['id'])['employee'];
        $this->assertSame(1, $employee['version']);
        $start = CarbonImmutable::now()->subHours(9)->startOfMinute()->toIso8601String();
        $end = CarbonImmutable::now()->subHour()->startOfMinute()->toIso8601String();
        $attendance = $this->act('hr.attendance.record', ['started_at' => $start, 'ended_at' => $end], null, 7, 22)['attendance'];
        $this->assertSame(1, $this->act('hr.attendance.mine.list', ['page' => '1'], null, 7, 22)['meta']['total']);
        $localDate = CarbonImmutable::parse($start)->setTimezone('Asia/Kuala_Lumpur')->toDateString();
        $this->assertSame($localDate, DB::table('hr_attendances')->value('local_date'));
        $this->assertSame(1, $this->act('hr.attendance.owner.list', ['local_date' => $localDate], $employee['id'])['meta']['total']);
        $corrected = $this->act('hr.attendance.owner.correct', ['started_at' => $start,
            'ended_at' => CarbonImmutable::now()->subMinutes(30)->startOfMinute()->toIso8601String(),
            'reason' => 'Approved correction', 'expected_version' => 0], $attendance['id']);
        $this->assertSame(1, $corrected['attendance']['version']);
        $this->assertSame(11, $corrected['correction']['corrected_by_platform_user_id']);
        $type = $this->act('hr.leave.types.create', ['code' => 'annual', 'name' => 'Annual', 'allowance_days' => 10])['leave_type'];
        $this->assertSame(1, $this->act('hr.leave.types.list', ['status' => 'active'])['meta']['total']);
        $from = CarbonImmutable::now('Asia/Kuala_Lumpur')->addDays(10)->toDateString();
        $to = CarbonImmutable::now('Asia/Kuala_Lumpur')->addDays(11)->toDateString();
        $leave = $this->act('hr.leave.mine.create', ['leave_type_id' => $type['id'], 'start_date' => $from,
            'end_date' => $to], null, 7, 22)['leave'];
        $this->assertSame(2, $leave['calendar_days']);
        $this->assertSame(1, $this->act('hr.leave.mine.list', ['status' => 'pending'], null, 7, 22)['meta']['total']);
        $this->assertSame($leave['id'], $this->act('hr.leave.mine.detail', [], $leave['id'], 7, 22)['leave']['id']);
        $this->assertSame(1, $this->act('hr.leave.owner.list', ['employee_id' => $employee['id']])['meta']['total']);
        $this->assertSame($leave['id'], $this->act('hr.leave.owner.detail', [], $leave['id'])['leave']['id']);
        $decided = $this->act('hr.leave.owner.decide', ['decision' => 'approved', 'expected_version' => 0], $leave['id'])['leave'];
        $this->assertSame('approved', $decided['status']);
        $this->assertSame(11, $decided['decided_by_platform_user_id']);
    }

    public function test_overlap_quota_self_approval_and_cross_organization_are_denied(): void
    {
        $owner = $this->act('hr.employees.create', ['code' => 'staff-self', 'display_name' => 'Owner',
            'timezone' => 'UTC', 'linked_platform_user_id' => 11], null, 7, 11, 11)['employee'];
        $other = $this->act('hr.employees.create', ['code' => 'staff-other', 'display_name' => 'Other',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22], null, 7, 11, 22)['employee'];
        $this->rejects(fn () => $this->act('hr.employees.mine.detail', [], null, 8, 22), ModelNotFoundException::class);
        $this->rejects(fn () => $this->act('hr.employees.owner.detail', [], $other['id'], 8), ModelNotFoundException::class);
        $type = $this->act('hr.leave.types.create', ['code' => 'limited', 'name' => 'Limited', 'allowance_days' => 2])['leave_type'];
        $from = CarbonImmutable::now('UTC')->addDays(5)->toDateString();
        $to = CarbonImmutable::now('UTC')->addDays(6)->toDateString();
        $leave = $this->act('hr.leave.mine.create', ['leave_type_id' => $type['id'], 'start_date' => $from,
            'end_date' => $to], null, 7, 11)['leave'];
        $this->rejects(fn () => $this->act('hr.leave.owner.decide', ['decision' => 'approved',
            'expected_version' => 0], $leave['id'], 7, 11), HttpException::class);
        $this->rejects(fn () => $this->act('hr.leave.mine.create', ['leave_type_id' => $type['id'],
            'start_date' => $from, 'end_date' => $to], null, 7, 11), HttpException::class);
        $later = CarbonImmutable::now('UTC')->addDays(8)->toDateString();
        $this->rejects(fn () => $this->act('hr.leave.mine.create', ['leave_type_id' => $type['id'],
            'start_date' => $later, 'end_date' => $later], null, 7, 11), HttpException::class);
        $this->assertSame('rejected', $this->act('hr.leave.owner.decide', ['decision' => 'rejected',
            'expected_version' => 0], $leave['id'], 7, 11)['leave']['status']);
        $this->rejects(fn () => $this->act('hr.leave.mine.detail', [], $leave['id'], 7, 22), ModelNotFoundException::class);
        $a = CarbonImmutable::now()->subHours(8)->startOfMinute()->toIso8601String();
        $b = CarbonImmutable::now()->subHours(4)->startOfMinute()->toIso8601String();
        $this->act('hr.attendance.record', ['started_at' => $a, 'ended_at' => $b], null, 7, 22);
        $this->rejects(fn () => $this->act('hr.attendance.record', ['started_at' => $a, 'ended_at' => $b], null, 7, 22), HttpException::class);
        $this->rejects(fn () => $this->act('hr.employees.create', ['code' => 'invalid', 'display_name' => 'X',
            'timezone' => 'Mars/Olympus', 'linked_platform_user_id' => 23], null, 7, 11, 23), HttpException::class);
        $this->rejects(fn () => $this->act('hr.employees.create', ['code' => 'forged', 'display_name' => 'X',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22, 'organization_id' => 999], null, 7, 11, 22), ValidationException::class);
        $this->assertSame(2, HrEmployee::count());
        $this->assertSame(1, HrAttendance::count());
        $this->assertSame($owner['id'], HrEmployee::where('linked_platform_user_id', 11)->firstOrFail()->id);
        $this->assertSame(1, HrLeaveRequest::where('status', 'rejected')->count());
    }

    public function test_attendance_requires_real_offset_timestamps_and_versioned_nonoverlapping_corrections(): void
    {
        $employee = $this->act('hr.employees.create', ['code' => 'offset-one', 'display_name' => 'Offset',
            'timezone' => 'Asia/Kuala_Lumpur', 'linked_platform_user_id' => 22], null, 7, 11, 22)['employee'];
        $start = CarbonImmutable::now()->subHours(8)->startOfMinute()->toIso8601String();
        $end = CarbonImmutable::now()->subHours(7)->startOfMinute()->toIso8601String();
        foreach (['2026-02-30T09:00:00+08:00', '2026-10-13T25:00:00+08:00', '2026-10-13 08:00:00',
            '2026-10-13T08:00:00+25:00'] as $bad) {
            $this->rejects(fn () => $this->act('hr.attendance.record',
                ['started_at' => $bad, 'ended_at' => $end], null, 7, 22), HttpException::class);
        }
        $first = $this->act('hr.attendance.record', ['started_at' => $start, 'ended_at' => $end], null, 7, 22)['attendance'];
        $this->rejects(fn () => $this->act('hr.attendance.record', ['started_at' => '2026-02-30T09:00:00Z',
            'ended_at' => $end], null, 7, 22), HttpException::class);
        $secondStart = CarbonImmutable::now()->subHours(6)->startOfMinute()->toIso8601String();
        $secondEnd = CarbonImmutable::now()->subHours(5)->startOfMinute()->toIso8601String();
        $second = $this->act('hr.attendance.record',
            ['started_at' => $secondStart, 'ended_at' => $secondEnd], null, 7, 22)['attendance'];
        $this->rejects(fn () => $this->act('hr.attendance.owner.correct', ['started_at' => $start,
            'ended_at' => $secondEnd, 'reason' => 'Overlaps first', 'expected_version' => 0], $second['id']), HttpException::class);
        $this->rejects(fn () => $this->act('hr.attendance.owner.correct', ['started_at' => $secondStart,
            'ended_at' => $secondEnd, 'reason' => 'Stale', 'expected_version' => 9], $second['id']), HttpException::class);
        $this->assertSame(0, DB::table('hr_attendance_corrections')->count());
        $this->assertSame($employee['id'], $first['employee_id']);
        $this->assertSame(2, $this->act('hr.attendance.owner.list', ['per_page' => '1'], $employee['id'])['meta']['total']);
        $this->rejects(fn () => $this->act('hr.attendance.record',
            ['started_at' => $start, 'ended_at' => $end, 'platform_user_id' => 11], null, 7, 22), ValidationException::class);
    }

    public function test_employee_state_and_leave_decision_recheck_current_versions(): void
    {
        $employee = $this->act('hr.employees.create', ['code' => 'state-one', 'display_name' => 'State',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22], null, 7, 11, 22)['employee'];
        $this->rejects(fn () => $this->act('hr.employees.create', ['code' => 'state-two', 'display_name' => 'Duplicate',
            'timezone' => 'UTC', 'linked_platform_user_id' => 22], null, 7, 11, 22), HttpException::class);
        $this->rejects(fn () => $this->act('hr.employees.update', ['display_name' => 'Stale', 'timezone' => 'UTC',
            'status' => 'active', 'expected_version' => 5], $employee['id']), HttpException::class);
        $type = $this->act('hr.leave.types.create', ['code' => 'annual-two', 'name' => 'Annual', 'allowance_days' => 3])['leave_type'];
        $from = CarbonImmutable::now('UTC')->addDays(3)->toDateString();
        $leave = $this->act('hr.leave.mine.create', ['leave_type_id' => $type['id'],
            'start_date' => $from, 'end_date' => $from], null, 7, 22)['leave'];
        $this->rejects(fn () => $this->act('hr.leave.owner.decide',
            ['decision' => 'approved', 'expected_version' => 3], $leave['id']), HttpException::class);
        $this->act('hr.employees.update', ['display_name' => 'Inactive', 'timezone' => 'UTC',
            'status' => 'inactive', 'expected_version' => 0], $employee['id']);
        $this->rejects(fn () => $this->act('hr.leave.owner.decide',
            ['decision' => 'approved', 'expected_version' => 0], $leave['id']), HttpException::class);
        $this->rejects(fn () => $this->act('hr.leave.mine.list', [], null, 7, 22), ModelNotFoundException::class);
        $this->act('hr.employees.update', ['display_name' => 'Active', 'timezone' => 'UTC',
            'status' => 'active', 'expected_version' => 1], $employee['id']);
        $this->assertSame('approved', $this->act('hr.leave.owner.decide',
            ['decision' => 'approved', 'expected_version' => 0], $leave['id'])['leave']['status']);
        $this->rejects(fn () => $this->act('hr.leave.owner.decide',
            ['decision' => 'rejected', 'expected_version' => 1], $leave['id']), HttpException::class);
        $this->act('hr.employees.update', ['display_name' => 'Terminated', 'timezone' => 'UTC',
            'status' => 'terminated', 'expected_version' => 2], $employee['id']);
        $this->rejects(fn () => $this->act('hr.employees.update', ['display_name' => 'Return', 'timezone' => 'UTC',
            'status' => 'active', 'expected_version' => 3], $employee['id']), HttpException::class);
    }

    public function test_models_expose_factories_and_nonunique_database_errors_are_not_hidden(): void
    {
        $this->assertInstanceOf(HrEmployee::class, HrEmployee::factory()->make());
        $this->assertInstanceOf(HrAttendance::class, HrAttendance::factory()->make());
        $this->assertInstanceOf(HrAttendanceCorrection::class, HrAttendanceCorrection::factory()->make());
        $this->assertInstanceOf(HrLeaveType::class, HrLeaveType::factory()->make());
        $this->assertInstanceOf(HrLeaveRequest::class, HrLeaveRequest::factory()->make());
        Schema::dropIfExists('hr_leave_requests');
        Schema::dropIfExists('hr_leave_types');
        $this->rejects(fn () => $this->act('hr.leave.types.create',
            ['code' => 'broken', 'name' => 'Broken', 'allowance_days' => 2]), QueryException::class);
    }
}
