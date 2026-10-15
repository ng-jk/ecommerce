<?php

namespace App\Modules\Crm;

use App\Modules\Platform\Services\ServiceExchange;
use App\Modules\Platform\Services\ServiceTransport;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class CrmCommandHandler
{
    public function __construct(
        private readonly ServiceExchange $exchange,
        private readonly ServiceTransport $transport,
        private readonly CrmActions $actions,
    ) {}

    /** Consume one durable inbox message. Remote authorization occurs before the local effect transaction. */
    public function consumeOne(): bool
    {
        $authorized = null;

        return $this->exchange->consume('crm', function (array $envelope) use (&$authorized): bool {
            $authorized = AuthorizedCrmScope::fromVerifiedExchange($envelope,
                fn (array $scope): bool => $this->transport->authorize($scope));

            return $authorized !== null;
        }, function (array $envelope) use (&$authorized): void {
            $command = $envelope['payload']['command'];
            $status = str_ends_with($authorized->action, '.create') ? 201 : 200;
            try {
                $result = DB::transaction(fn (): array => $this->actions->execute(
                    $authorized, $command['input'], $command['id'] ?? null));
            } catch (ValidationException $exception) {
                $status = 422;
                $result = ['validation_error' => $exception->errors()];
            } catch (ModelNotFoundException) {
                $status = 404;
                $result = ['message' => 'CRM record not found.'];
            } catch (HttpExceptionInterface $exception) {
                $status = $exception->getStatusCode();
                if (! in_array($status, [403, 404, 409, 422], true)) {
                    throw $exception;
                }
                $result = ['message' => $exception->getMessage() ?: 'CRM request rejected.'];
            }
            $this->exchange->enqueue([
                'id' => $envelope['id'], 'source' => 'crm', 'destination' => 'platform',
                'topic' => 'crm.result', 'version' => 1,
                'payload' => ['operation_id' => $command['operation_id'], 'command_id' => $envelope['id'],
                    'organization_id' => $authorized->organizationId, 'action' => $authorized->action,
                    'http_status' => $status, 'result' => $result],
            ]);
        });
    }
}
