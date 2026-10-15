<?php

namespace App\Modules\Helpdesk;

use Illuminate\Support\Str;
use InvalidArgumentException;
use LogicException;

final class AuthorizedHelpdeskScope
{
    private const Actions = [
        'helpdesk.queues.list', 'helpdesk.queues.create', 'helpdesk.queues.detail', 'helpdesk.queues.update',
        'helpdesk.agents.list', 'helpdesk.agents.assign', 'helpdesk.agents.revoke',
        'helpdesk.tickets.requester.list', 'helpdesk.tickets.requester.create', 'helpdesk.tickets.requester.detail',
        'helpdesk.tickets.agent.list', 'helpdesk.tickets.agent.detail', 'helpdesk.tickets.agent.status',
        'helpdesk.tickets.owner.list', 'helpdesk.tickets.owner.detail', 'helpdesk.tickets.owner.assign',
        'helpdesk.tickets.owner.status',
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
            || $envelope['source'] !== 'platform' || $envelope['destination'] !== 'helpdesk'
            || $envelope['topic'] !== 'helpdesk.command' || $envelope['version'] !== 1
            || ! is_array($envelope['payload'])) {
            throw new InvalidArgumentException('Invalid Helpdesk service envelope.');
        }
        $payload = $envelope['payload'];
        $payloadKeys = array_keys($payload);
        sort($payloadKeys);
        if ($payloadKeys !== ['command', 'scope'] || ! is_array($payload['scope'])
            || ! is_array($payload['command']) || ! is_array($payload['command']['input'] ?? null)) {
            throw new InvalidArgumentException('Invalid Helpdesk command envelope.');
        }
        $command = $payload['command'];
        $commandKeys = array_keys($command);
        sort($commandKeys);
        if (! in_array($commandKeys, [['input', 'operation_id'], ['id', 'input', 'operation_id']], true)
            || ! is_string($command['operation_id']) || ! Str::isUuid($command['operation_id'])
            || (array_key_exists('id', $command) && ! self::positive($command['id']))) {
            throw new InvalidArgumentException('Invalid Helpdesk command target.');
        }
        $scope = $payload['scope'];
        $scopeKeys = array_keys($scope);
        sort($scopeKeys);
        $baseKeys = ['action', 'application', 'auth_version', 'organization_id', 'platform_user_id', 'token_id'];
        $withSubject = [...$baseKeys, 'subject_platform_user_id'];
        sort($withSubject);
        $action = $scope['action'] ?? null;
        $assignment = in_array($action, ['helpdesk.agents.assign', 'helpdesk.tickets.owner.assign'], true);
        $targetField = $action === 'helpdesk.agents.assign' ? 'target_platform_user_id' : 'assigned_platform_user_id';
        if ($scopeKeys !== ($assignment ? $withSubject : $baseKeys)
            || $scope['application'] !== 'helpdesk' || ! is_string($action)
            || ! in_array($action, self::Actions, true)
            || ! self::positive($scope['organization_id']) || ! self::positive($scope['platform_user_id'])
            || ! self::positive($scope['token_id']) || ! is_int($scope['auth_version'])
            || $scope['auth_version'] < 0
            || ($assignment && (! self::positive($scope['subject_platform_user_id'])
                || ($command['input'][$targetField] ?? null) !== $scope['subject_platform_user_id']))) {
            throw new InvalidArgumentException('Invalid Helpdesk authorization scope.');
        }
        $allowed = $authorize($scope);
        if (! is_bool($allowed)) {
            throw new LogicException('Service authorization must return a boolean.');
        }
        if (! $allowed) {
            return null;
        }

        return new self($scope['organization_id'], $scope['platform_user_id'], $action,
            $assignment ? $scope['subject_platform_user_id'] : null);
    }

    private static function positive(mixed $value): bool
    {
        return is_int($value) && $value > 0;
    }
}
