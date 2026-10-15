<?php

namespace App\Modules\Crm;

use Illuminate\Support\Str;
use InvalidArgumentException;
use LogicException;

final class AuthorizedCrmScope
{
    private function __construct(
        public readonly int $organizationId,
        public readonly int $platformUserId,
        public readonly string $action,
        public readonly ?int $subjectPlatformUserId,
    ) {}

    /**
     * Called in the inbox authorization callback, before its fenced business transaction.
     * The callback must be the server-owned signed ServiceTransport::authorize method.
     *
     * @param  array<string, mixed>  $envelope
     * @param  callable(array<string, int|string>): bool  $authorize
     */
    public static function fromVerifiedExchange(array $envelope, callable $authorize): ?self
    {
        $envelopeKeys = array_keys($envelope);
        sort($envelopeKeys);
        if ($envelopeKeys !== ['destination', 'id', 'payload', 'source', 'topic', 'version']
            || ! is_string($envelope['id']) || ! Str::isUuid($envelope['id'])
            || $envelope['source'] !== 'platform' || $envelope['destination'] !== 'crm'
            || $envelope['topic'] !== 'crm.command' || $envelope['version'] !== 1
            || ! is_array($envelope['payload'])) {
            throw new InvalidArgumentException('Invalid CRM service envelope.');
        }
        $payload = $envelope['payload'];
        $payloadKeys = array_keys($payload);
        sort($payloadKeys);
        if ($payloadKeys !== ['command', 'scope'] || ! is_array($payload['scope'])
            || ! is_array($payload['command']) || ! is_array($payload['command']['input'] ?? null)) {
            throw new InvalidArgumentException('Invalid CRM command envelope.');
        }
        $commandKeys = array_keys($payload['command']);
        sort($commandKeys);
        if (! in_array($commandKeys, [['input', 'operation_id'], ['id', 'input', 'operation_id']], true)
            || ! is_string($payload['command']['operation_id']) || ! Str::isUuid($payload['command']['operation_id'])
            || (array_key_exists('id', $payload['command']) && ! self::positive($payload['command']['id']))) {
            throw new InvalidArgumentException('Invalid CRM command target.');
        }
        $scope = $payload['scope'];
        $keys = array_keys($scope);
        sort($keys);
        $baseKeys = ['action', 'application', 'auth_version', 'organization_id', 'platform_user_id', 'token_id'];
        $subjectKeys = ['action', 'application', 'auth_version', 'organization_id', 'platform_user_id',
            'subject_platform_user_id', 'token_id'];
        if (! in_array($keys, [$baseKeys, $subjectKeys], true)
            || $scope['application'] !== 'crm' || ! is_string($scope['action'])
            || ! preg_match('/^crm\.[a-z.]{1,80}$/D', $scope['action'])
            || ! self::positive($scope['organization_id']) || ! self::positive($scope['platform_user_id'])
            || ! self::positive($scope['token_id']) || ! is_int($scope['auth_version'])
            || $scope['auth_version'] < 0) {
            throw new InvalidArgumentException('Invalid CRM authorization scope.');
        }
        $subject = $scope['subject_platform_user_id'] ?? null;
        if (in_array($scope['action'], ['crm.deals.create', 'crm.deals.update'], true)) {
            $target = $payload['command']['input']['assignee_platform_user_id'] ?? null;
            if (($target !== null && (! self::positive($target) || $subject !== $target))
                || ($target === null && array_key_exists('subject_platform_user_id', $scope))) {
                throw new InvalidArgumentException('Invalid CRM assignment authorization.');
            }
        } elseif (array_key_exists('subject_platform_user_id', $scope)) {
            throw new InvalidArgumentException('Unexpected CRM assignment authorization.');
        }
        $allowed = $authorize($scope);
        if (! is_bool($allowed)) {
            throw new LogicException('Service authorization must return a boolean.');
        }
        if (! $allowed) {
            return null;
        }

        return new self($scope['organization_id'], $scope['platform_user_id'], $scope['action'], $subject);
    }

    private static function positive(mixed $value): bool
    {
        return is_int($value) && $value > 0;
    }
}
