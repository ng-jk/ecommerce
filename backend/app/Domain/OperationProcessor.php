<?php

namespace App\Domain;

use App\Models\Operation;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class OperationProcessor
{
    public function processNext(): bool
    {
        $claimed = DB::transaction(function (): ?Operation {
            $query = Operation::whereIn('status', [Operation::Queued, Operation::Processing])->where('available_at', '<=', now())->orderBy('id');
            $query->whereNotExists(function ($q): void {
                $q->selectRaw('1')->from('operations as earlier')->whereColumn('earlier.user_id', 'operations.user_id')->whereColumn('earlier.id', '<', 'operations.id')->whereIn('earlier.status', [Operation::Queued, Operation::Processing])->whereNull('earlier.deleted_at');
            });
            $op = $query->lock(DB::getDriverName() === 'pgsql' ? 'FOR UPDATE SKIP LOCKED' : true)->first();
            if (! $op) {
                return null;
            }
            $op->update(['status' => Operation::Processing, 'attempts' => $op->attempts + 1, 'available_at' => now()->addSeconds(60)]);

            return $op;
        }, 3);
        if (! $claimed) {
            return false;
        }

        return DB::transaction(function () use ($claimed): bool {
            $op = Operation::whereKey($claimed->id)->lockForUpdate()->firstOrFail();
            if ($op->status !== Operation::Processing || $op->attempts !== $claimed->attempts) {
                return true;
            }
            if ($op->attempts > 3) {
                $op->update(['status' => Operation::Failed, 'http_status' => 503, 'result' => ['message' => 'Worker recovery retry limit reached.']]);

                return true;
            }
            try {
                $result = DB::transaction(function () use ($op): array {
                    return app(ActionExecutor::class)->execute($op);
                });
                $op->fill(['status' => Operation::Succeeded, 'result' => $result, 'http_status' => 200]);
            } catch (Throwable $error) {
                $status = match (true) {
                    $error instanceof ValidationException => 422,
                    $error instanceof ModelNotFoundException => 404,
                    $error instanceof AuthorizationException => 403,
                    $error instanceof HttpExceptionInterface => $error->getStatusCode(),
                    default => 500,
                };
                $retry = $status >= 500 && $op->attempts < 3;
                $op->fill(['status' => $retry ? Operation::Queued : ($status >= 500 ? Operation::Failed : Operation::Rejected), 'http_status' => $status, 'available_at' => now()->addSeconds(2 ** $op->attempts), 'result' => $error instanceof ValidationException ? ['validation_error' => $error->errors()] : ['message' => $status >= 500 ? 'The operation could not complete.' : ($error->getMessage() ?: 'Action rejected.')]]);
                $op->state_after = $op->state_before;
                if ($status >= 500) {
                    report($error);
                }
            } finally {
                Auth::forgetGuards();
            }
            if ((str_starts_with($op->action, 'auth.') || $op->action === 'assistant') && $op->status !== Operation::Queued) {
                $op->payload = [];
            }
            $op->save();

            return true;
        }, 3);
    }
}
