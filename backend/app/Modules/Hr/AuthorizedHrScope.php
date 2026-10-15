<?php

namespace App\Modules\Hr;

use Illuminate\Support\Str;
use InvalidArgumentException;
use LogicException;

final class AuthorizedHrScope
{
    public const Actions = [
        'hr.employees.list', 'hr.employees.create', 'hr.employees.owner.detail', 'hr.employees.mine.detail', 'hr.employees.update',
        'hr.attendance.mine.list', 'hr.attendance.record', 'hr.attendance.owner.list', 'hr.attendance.owner.correct',
        'hr.leave.types.list', 'hr.leave.types.create', 'hr.leave.mine.list', 'hr.leave.mine.create',
        'hr.leave.mine.detail', 'hr.leave.owner.list', 'hr.leave.owner.detail', 'hr.leave.owner.decide',
    ];

    private function __construct(
        public readonly int $organizationId,
        public readonly int $platformUserId,
        public readonly string $action,
        public readonly ?int $subjectPlatformUserId,
    ) {}

    /** @param callable(array<string, int|string>): bool $authorize */
    public static function fromVerifiedExchange(array $envelope, callable $authorize): ?self
    {
        $keys = array_keys($envelope);
        sort($keys);
        if ($keys !== ['destination', 'id', 'payload', 'source', 'topic', 'version']
            || ! is_string($envelope['id']) || ! Str::isUuid($envelope['id'])
            || $envelope['source'] !== 'platform' || $envelope['destination'] !== 'hr'
            || $envelope['topic'] !== 'hr.command' || $envelope['version'] !== 1
            || ! is_array($envelope['payload'])) {
            throw new InvalidArgumentException('Invalid HR service envelope.');
        }
        $payload = $envelope['payload'];
        $payloadKeys = array_keys($payload);
        sort($payloadKeys);
        if ($payloadKeys !== ['command', 'scope'] || ! is_array($payload['scope'])
            || ! is_array($payload['command']) || ! is_array($payload['command']['input'] ?? null)) {
            throw new InvalidArgumentException('Invalid HR command envelope.');
        }
        $command = $payload['command'];
        $commandKeys = array_keys($command);
        sort($commandKeys);
        if (! in_array($commandKeys, [['input', 'operation_id'], ['id', 'input', 'operation_id']], true)
            || ! is_string($command['operation_id']) || ! Str::isUuid($command['operation_id'])
            || (array_key_exists('id', $command) && ! self::positive($command['id']))) {
            throw new InvalidArgumentException('Invalid HR command target.');
        }
        $scope = $payload['scope'];
        $scopeKeys = array_keys($scope);
        sort($scopeKeys);
        $baseKeys = ['action', 'application', 'auth_version', 'organization_id', 'platform_user_id', 'token_id'];
        $withSubject = [...$baseKeys, 'subject_platform_user_id'];
        sort($withSubject);
        $action = $scope['action'] ?? null;
        $creation = $action === 'hr.employees.create';
        if ($scopeKeys !== ($creation ? $withSubject : $baseKeys)
            || $scope['application'] !== 'hr' || ! is_string($action)
            || ! in_array($action, self::Actions, true)
            || ! self::positive($scope['organization_id']) || ! self::positive($scope['platform_user_id'])
            || ! self::positive($scope['token_id']) || ! is_int($scope['auth_version'])
            || $scope['auth_version'] < 0
            || ($creation && (! self::positive($scope['subject_platform_user_id'])
                || ($command['input']['linked_platform_user_id'] ?? null) !== $scope['subject_platform_user_id']))) {
            throw new InvalidArgumentException('Invalid HR authorization scope.');
        }
        $allowed = $authorize($scope);
        if (! is_bool($allowed)) {
            throw new LogicException('Service authorization must return a boolean.');
        }

        return $allowed ? new self($scope['organization_id'], $scope['platform_user_id'], $action,
            $creation ? $scope['subject_platform_user_id'] : null) : null;
    }

    private static function positive(mixed $value): bool
    {
        return is_int($value) && $value > 0;
    }
}
