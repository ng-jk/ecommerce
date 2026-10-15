<?php

namespace App\Modules\Hr;

use App\Modules\Hr\Models\HrAttendance as Attendance;
use App\Modules\Hr\Models\HrAttendanceCorrection as Correction;
use App\Modules\Hr\Models\HrEmployee as Employee;
use App\Modules\Hr\Models\HrLeaveRequest as LeaveRequest;
use App\Modules\Hr\Models\HrLeaveType as LeaveType;
use Carbon\CarbonImmutable;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use LogicException;

final class HrActions
{
    public function authorizeResult(AuthorizedHrScope $scope, array $command, array $result): bool
    {
        if (! in_array($scope->action, AuthorizedHrScope::Actions, true)) {
            return false;
        }
        if (str_contains($scope->action, '.mine.') || $scope->action === 'hr.attendance.record') {
            return Employee::where('organization_id', $scope->organizationId)
                ->where('linked_platform_user_id', $scope->platformUserId)->where('status', Employee::Active)->exists();
        }

        return true;
    }

    public function execute(AuthorizedHrScope $scope, array $input, ?int $id = null): array
    {
        if (DB::transactionLevel() < 1) {
            throw new LogicException('HR actions require the fenced inbox transaction.');
        }
        $targeted = in_array($scope->action, ['hr.employees.owner.detail', 'hr.employees.update',
            'hr.attendance.owner.list', 'hr.attendance.owner.correct', 'hr.leave.mine.detail',
            'hr.leave.owner.detail', 'hr.leave.owner.decide'], true);
        abort_unless($targeted ? $id !== null && $id > 0 : $id === null, 422);

        return match ($scope->action) {
            'hr.employees.list' => $this->employees($scope, $input),
            'hr.employees.create' => $this->createEmployee($scope, $input),
            'hr.employees.owner.detail' => $this->employeeDetail($scope, $id, $input),
            'hr.employees.mine.detail' => $this->myEmployee($scope, $input),
            'hr.employees.update' => $this->updateEmployee($scope, $id, $input),
            'hr.attendance.mine.list', 'hr.attendance.owner.list' => $this->attendance($scope, $id, $input),
            'hr.attendance.record' => $this->recordAttendance($scope, $input),
            'hr.attendance.owner.correct' => $this->correctAttendance($scope, $id, $input),
            'hr.leave.types.list' => $this->leaveTypes($scope, $input),
            'hr.leave.types.create' => $this->createLeaveType($scope, $input),
            'hr.leave.mine.list', 'hr.leave.owner.list' => $this->leave($scope, $input),
            'hr.leave.mine.create' => $this->requestLeave($scope, $input),
            'hr.leave.mine.detail', 'hr.leave.owner.detail' => $this->leaveDetail($scope, $id, $input),
            'hr.leave.owner.decide' => $this->decideLeave($scope, $id, $input),
        };
    }

    private function employees(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, [...$this->pageRules(), 'status' => ['sometimes', Rule::in(array_keys(Employee::options()))]]);
        $query = Employee::where('organization_id', $scope->organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        return $this->page($query, $data, ['id', 'code', 'display_name', 'linked_platform_user_id', 'timezone', 'status', 'version'], Employee::options());
    }

    private function createEmployee(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, ['code' => ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9-]{2,79}$/D'],
            'display_name' => 'required|string|max:200', 'timezone' => 'required|string|max:64',
            'linked_platform_user_id' => 'required|integer:strict|min:1']);
        abort_unless($data['linked_platform_user_id'] === $scope->subjectPlatformUserId, 403);
        $this->timezone($data['timezone']);
        $employee = $this->unique(fn (): Model => Employee::create([...$data, 'organization_id' => $scope->organizationId]));

        return ['employee' => $employee->toArray(), 'options' => Employee::options()];
    }

    private function employeeDetail(AuthorizedHrScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);

        return ['employee' => $this->employee($scope, $id)->toArray(), 'options' => Employee::options()];
    }

    private function myEmployee(AuthorizedHrScope $scope, array $input): array
    {
        $this->validate($input, []);

        return ['employee' => $this->mine($scope)->toArray(), 'options' => Employee::options()];
    }

    private function updateEmployee(AuthorizedHrScope $scope, int $id, array $input): array
    {
        $data = $this->validate($input, ['display_name' => 'required|string|max:200', 'timezone' => 'required|string|max:64',
            'status' => ['required', Rule::in(array_keys(Employee::options()))], 'expected_version' => 'required|integer:strict|min:0']);
        $this->timezone($data['timezone']);
        $employee = $this->employee($scope, $id, true);
        $this->version($employee, $data['expected_version']);
        abort_if($employee->status === Employee::Terminated && $data['status'] !== Employee::Terminated, 409);
        unset($data['expected_version']);
        $employee->update([...$data, 'version' => $employee->version + 1]);

        return ['employee' => $employee->fresh()->toArray(), 'options' => Employee::options()];
    }

    private function attendance(AuthorizedHrScope $scope, ?int $id, array $input): array
    {
        $data = $this->validate($input, [...$this->pageRules(), 'local_date' => 'sometimes|date_format:Y-m-d']);
        $employee = $scope->action === 'hr.attendance.mine.list' ? $this->mine($scope) : $this->employee($scope, $id);
        $query = Attendance::where('organization_id', $scope->organizationId)->where('employee_id', $employee->id);
        if (isset($data['local_date'])) {
            $query->where('local_date', $data['local_date']);
        }

        return $this->page($query, $data, ['id', 'employee_id', 'started_at', 'ended_at', 'local_date', 'timezone', 'version']);
    }

    private function recordAttendance(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, ['started_at' => 'required|string|max:40', 'ended_at' => 'required|string|max:40']);
        $employee = $this->mine($scope, true);
        [$start, $end] = $this->interval($data['started_at'], $data['ended_at']);
        $this->noAttendanceOverlap($scope, $employee, $start, $end);
        $record = Attendance::create(['organization_id' => $scope->organizationId, 'employee_id' => $employee->id,
            'started_at' => $start, 'ended_at' => $end, 'local_date' => $start->setTimezone($employee->timezone)->toDateString(),
            'timezone' => $employee->timezone]);

        return ['attendance' => $record->toArray()];
    }

    private function correctAttendance(AuthorizedHrScope $scope, int $id, array $input): array
    {
        $data = $this->validate($input, ['started_at' => 'required|string|max:40', 'ended_at' => 'required|string|max:40',
            'reason' => 'required|string|max:2000', 'expected_version' => 'required|integer:strict|min:0']);
        $reference = Attendance::where('organization_id', $scope->organizationId)->whereKey($id)->firstOrFail();
        $employee = $this->employee($scope, $reference->employee_id, true);
        $record = Attendance::where('organization_id', $scope->organizationId)->whereKey($id)->lockForUpdate()->firstOrFail();
        $this->version($record, $data['expected_version']);
        [$start, $end] = $this->interval($data['started_at'], $data['ended_at']);
        $this->noAttendanceOverlap($scope, $employee, $start, $end, $record->id);
        $correction = Correction::create(['organization_id' => $scope->organizationId, 'attendance_id' => $record->id,
            'corrected_by_platform_user_id' => $scope->platformUserId, 'old_started_at' => $record->started_at,
            'old_ended_at' => $record->ended_at, 'new_started_at' => $start, 'new_ended_at' => $end,
            'reason' => $data['reason']]);
        $record->update(['started_at' => $start, 'ended_at' => $end,
            'local_date' => $start->setTimezone($employee->timezone)->toDateString(),
            'timezone' => $employee->timezone, 'version' => $record->version + 1]);

        return ['attendance' => $record->fresh()->toArray(), 'correction' => $correction->toArray()];
    }

    private function leaveTypes(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, [...$this->pageRules(), 'status' => ['sometimes', Rule::in(array_keys(LeaveType::options()))]]);
        $query = LeaveType::where('organization_id', $scope->organizationId);
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        return $this->page($query, $data, ['id', 'code', 'name', 'allowance_days', 'status'], LeaveType::options());
    }

    private function createLeaveType(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, ['code' => ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9-]{2,79}$/D'],
            'name' => 'required|string|max:160', 'allowance_days' => 'required|integer:strict|min:0|max:366']);
        $record = $this->unique(fn (): Model => LeaveType::create([...$data, 'organization_id' => $scope->organizationId]));

        return ['leave_type' => $record->toArray(), 'options' => LeaveType::options()];
    }

    private function leave(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, [...$this->pageRules(), 'status' => ['sometimes', Rule::in(array_keys(LeaveRequest::options()))],
            'employee_id' => 'sometimes|integer:strict|min:1']);
        $query = LeaveRequest::where('organization_id', $scope->organizationId);
        if ($scope->action === 'hr.leave.mine.list') {
            abort_if(isset($data['employee_id']), 422);
            $query->where('employee_id', $this->mine($scope)->id);
        } elseif (isset($data['employee_id'])) {
            $query->where('employee_id', $data['employee_id']);
        }
        if (isset($data['status'])) {
            $query->where('status', $data['status']);
        }

        return $this->page($query, $data, ['id', 'employee_id', 'leave_type_id', 'start_date', 'end_date',
            'calendar_days', 'status', 'version'], LeaveRequest::options());
    }

    private function requestLeave(AuthorizedHrScope $scope, array $input): array
    {
        $data = $this->validate($input, ['leave_type_id' => 'required|integer:strict|min:1',
            'start_date' => 'required|date_format:Y-m-d', 'end_date' => 'required|date_format:Y-m-d']);
        $employee = $this->mine($scope, true);
        $type = LeaveType::where('organization_id', $scope->organizationId)->whereKey($data['leave_type_id'])->firstOrFail();
        abort_unless($type->status === LeaveType::Active, 409);
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $data['start_date'], $employee->timezone);
        $end = CarbonImmutable::createFromFormat('!Y-m-d', $data['end_date'], $employee->timezone);
        $today = CarbonImmutable::now($employee->timezone)->startOfDay();
        abort_unless($start && $end && $start >= $today && $end >= $start
            && $end <= $today->addYear() && $start->year === $end->year, 422);
        $days = (int) $start->diffInDays($end) + 1;
        abort_unless($days >= 1 && $days <= 31, 422);
        $reserved = LeaveRequest::where('organization_id', $scope->organizationId)->where('employee_id', $employee->id)
            ->whereIn('status', [LeaveRequest::Pending, LeaveRequest::Approved]);
        abort_if((clone $reserved)->where('start_date', '<=', $data['end_date'])
            ->where('end_date', '>=', $data['start_date'])->exists(), 409, 'Leave dates overlap an existing request.');
        $used = (clone $reserved)->where('leave_type_id', $type->id)
            ->whereYear('start_date', $start->year)->sum('calendar_days');
        abort_if($used + $days > $type->allowance_days, 409, 'Leave allowance would be exceeded.');
        $record = LeaveRequest::create(['organization_id' => $scope->organizationId, 'employee_id' => $employee->id,
            'leave_type_id' => $type->id, 'start_date' => $data['start_date'], 'end_date' => $data['end_date'],
            'calendar_days' => $days]);

        return ['leave' => $record->toArray(), 'options' => LeaveRequest::options()];
    }

    private function leaveDetail(AuthorizedHrScope $scope, int $id, array $input): array
    {
        $this->validate($input, []);
        $query = LeaveRequest::where('organization_id', $scope->organizationId)->whereKey($id);
        if ($scope->action === 'hr.leave.mine.detail') {
            $query->where('employee_id', $this->mine($scope)->id);
        }

        return ['leave' => $query->firstOrFail()->toArray(), 'options' => LeaveRequest::options()];
    }

    private function decideLeave(AuthorizedHrScope $scope, int $id, array $input): array
    {
        $data = $this->validate($input, ['decision' => ['required', Rule::in([LeaveRequest::Approved, LeaveRequest::Rejected])],
            'expected_version' => 'required|integer:strict|min:0']);
        $reference = LeaveRequest::where('organization_id', $scope->organizationId)->whereKey($id)->firstOrFail();
        $employee = $this->employee($scope, $reference->employee_id, true);
        $record = LeaveRequest::where('organization_id', $scope->organizationId)->whereKey($id)->lockForUpdate()->firstOrFail();
        $this->version($record, $data['expected_version']);
        abort_unless($record->status === LeaveRequest::Pending, 409);
        abort_if($data['decision'] === LeaveRequest::Approved && $employee->linked_platform_user_id === $scope->platformUserId,
            403, 'An employee cannot approve their own leave.');
        abort_if($data['decision'] === LeaveRequest::Approved && $employee->status !== Employee::Active, 409);
        $record->update(['status' => $data['decision'], 'decided_by_platform_user_id' => $scope->platformUserId,
            'decided_at' => now(), 'version' => $record->version + 1]);

        return ['leave' => $record->fresh()->toArray(), 'options' => LeaveRequest::options()];
    }

    private function employee(AuthorizedHrScope $scope, int $id, bool $lock = false): Employee
    {
        $query = Employee::where('organization_id', $scope->organizationId)->whereKey($id);

        return ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
    }

    private function mine(AuthorizedHrScope $scope, bool $lock = false): Employee
    {
        $query = Employee::where('organization_id', $scope->organizationId)
            ->where('linked_platform_user_id', $scope->platformUserId)->where('status', Employee::Active);

        return ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
    }

    private function noAttendanceOverlap(AuthorizedHrScope $scope, Employee $employee, CarbonImmutable $start,
        CarbonImmutable $end, ?int $except = null): void
    {
        $query = Attendance::where('organization_id', $scope->organizationId)->where('employee_id', $employee->id)
            ->where('started_at', '<', $end)->where('ended_at', '>', $start);
        if ($except !== null) {
            $query->whereKeyNot($except);
        }
        abort_if($query->exists(), 409, 'Attendance intervals overlap.');
    }

    /** @return array{CarbonImmutable, CarbonImmutable} */
    private function interval(string $startedAt, string $endedAt): array
    {
        $pattern = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/D';
        abort_unless(preg_match($pattern, $startedAt) === 1 && preg_match($pattern, $endedAt) === 1, 422);
        foreach ([$startedAt, $endedAt] as $value) {
            if (str_ends_with($value, 'Z')) {
                continue;
            }
            $offsetHours = (int) substr($value, -5, 2);
            $offsetMinutes = (int) substr($value, -2);
            abort_unless($offsetHours <= 14 && $offsetMinutes <= 59
                && ($offsetHours < 14 || $offsetMinutes === 0), 422);
        }
        $startText = str_replace('Z', '+00:00', $startedAt);
        $endText = str_replace('Z', '+00:00', $endedAt);
        $parsedStart = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $startText);
        $parsedEnd = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $endText);
        abort_unless($parsedStart && $parsedEnd && $parsedStart->format('Y-m-d\TH:i:sP') === $startText
            && $parsedEnd->format('Y-m-d\TH:i:sP') === $endText, 422);
        $start = CarbonImmutable::instance($parsedStart)->utc();
        $end = CarbonImmutable::instance($parsedEnd)->utc();
        abort_unless($end > $start && $start >= CarbonImmutable::now()->subDays(31)
            && $end <= CarbonImmutable::now()->addMinutes(5) && $start->diffInHours($end) <= 18, 422);

        return [$start, $end];
    }

    private function timezone(string $timezone): void
    {
        abort_unless(in_array($timezone, DateTimeZone::listIdentifiers(), true), 422);
    }

    private function version(Model $record, int $expected): void
    {
        abort_unless($record->version === $expected, 409, 'Record changed. Refresh before retrying.');
    }

    private function pageRules(): array
    {
        return ['page' => 'sometimes|integer:strict|min:1|max:1000000',
            'per_page' => 'sometimes|integer:strict|min:1|max:50'];
    }

    private function validate(array $input, array $rules): array
    {
        foreach (['page', 'per_page'] as $field) {
            if (array_key_exists($field, $rules) && isset($input[$field]) && is_string($input[$field])
                && preg_match('/^[1-9][0-9]*$/D', $input[$field]) === 1) {
                $parsed = filter_var($input[$field], FILTER_VALIDATE_INT);
                if ($parsed !== false) {
                    $input[$field] = $parsed;
                }
            }
        }
        foreach (array_diff(array_keys($input), array_keys($rules)) as $field) {
            throw ValidationException::withMessages([$field => 'Unknown field.']);
        }

        return Validator::make($input, $rules)->validate();
    }

    private function page(Builder $query, array $input, array $columns, array $options = []): array
    {
        $page = $query->orderBy('id')->paginate($input['per_page'] ?? 20, $columns, 'page', $input['page'] ?? 1);

        return ['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage(),
            'options' => ['status' => $options]]];
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
