<?php

namespace App\Modules\Learning;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use LogicException;

final class AuthorizedLearningScope
{
    public const Actions = ['learning.courses.author.list', 'learning.courses.create', 'learning.courses.author.detail', 'learning.courses.update', 'learning.courses.publish', 'learning.courses.archive', 'learning.lessons.author.detail', 'learning.assessments.author.detail', 'learning.lessons.create', 'learning.lessons.update', 'learning.assessments.create', 'learning.assessments.update', 'learning.courses.list', 'learning.courses.detail', 'learning.enrollments.create', 'learning.enrollments.list', 'learning.enrollments.detail', 'learning.lessons.read', 'learning.assessments.detail', 'learning.attempts.submit', 'learning.attempts.list'];

    private function __construct(public readonly int $organizationId, public readonly int $platformUserId, public readonly string $action) {}

    public static function fromVerifiedExchange(array $message, callable $authorize): ?self
    {
        $data = Validator::make(['message' => $message], [
            'message' => 'required|array:id,source,destination,topic,version,payload',
            'message.id' => 'required|uuid', 'message.source' => 'required|in:platform', 'message.destination' => 'required|in:learning',
            'message.topic' => 'required|in:learning.command', 'message.version' => 'required|integer:strict|in:1',
            'message.payload' => 'required|array:scope,command',
            'message.payload.command' => 'required|array:operation_id,id,input',
            'message.payload.command.operation_id' => 'required|uuid', 'message.payload.command.id' => 'sometimes|integer:strict|min:1',
            'message.payload.command.input' => 'present|array',
            'message.payload.scope' => 'required|array:platform_user_id,organization_id,application,action,auth_version,token_id',
            'message.payload.scope.platform_user_id' => 'required|integer:strict|min:1',
            'message.payload.scope.organization_id' => 'required|integer:strict|min:1',
            'message.payload.scope.token_id' => 'required|integer:strict|min:1',
            'message.payload.scope.auth_version' => 'required|integer:strict|min:0',
            'message.payload.scope.application' => 'required|in:learning',
            'message.payload.scope.action' => ['required', Rule::in(self::Actions)],
        ])->validate()['message'];
        $scope = $data['payload']['scope'];
        $allowed = $authorize($scope);
        if (! is_bool($allowed)) {
            throw new LogicException('Service authorization must return a boolean.');
        }

        return $allowed ? new self($scope['organization_id'], $scope['platform_user_id'], $scope['action']) : null;
    }
}
