<?php

namespace App\Modules\Platform\Services;

use App\Models\ServiceDelivery;
use App\Models\ServiceInbox;
use Illuminate\Support\Facades\DB;
use Throwable;

final class ServiceResultAuthority
{
    private const Modules = ['crm' => 'Crm', 'helpdesk' => 'Helpdesk', 'learning' => 'Learning', 'insights' => 'Insights', 'builder' => 'Builder', 'erp' => 'Erp', 'hr' => 'Hr', 'lending' => 'Lending'];

    public function allows(string $service, array $request): bool
    {
        if (DB::transactionLevel() !== 0) {
            throw new \LogicException('Result authority starts outside a local transaction.');
        }
        $module = self::Modules[$service] ?? null;
        if ($module === null) {
            return false;
        }
        try {
            $stored = $this->stored($service, $request);
            if ($stored === null) {
                return false;
            }
            $peer = config('service_exchange.peers.platform', []);
            $transport = new ServiceTransport($peer['url'] ?? '', $peer['key'] ?? '', $service, 'platform');
            $scopeClass = 'App\\Modules\\'.$module.'\\Authorized'.$module.'Scope';
            $actionsClass = 'App\\Modules\\'.$module.'\\'.$module.'Actions';
            $scope = $scopeClass::fromVerifiedExchange($stored['message'], fn (array $scope): bool => $transport->authorize($scope));
            if ($scope === null) {
                return false;
            }

            return DB::transaction(function () use ($service, $request, $stored, $scope, $actionsClass): bool {
                $current = $this->stored($service, $request, true);

                return $current !== null && self::digest($current) === self::digest($stored)
                    && app($actionsClass)->authorizeResult($scope, $stored['message']['payload']['command'], $stored['result']) === true;
            });
        } catch (Throwable) {
            // Unknown bindings, unavailable central authority and domain denials never expose stored data.
            return false;
        }
    }

    private function stored(string $service, array $request, bool $lock = false): ?array
    {
        $inbox = ServiceInbox::where('message_id', $request['command_id'])->where('source', 'platform')->where('destination', $service)
            ->where('status', ServiceInbox::Succeeded)->when($lock, fn ($q) => $q->lockForUpdate())->first();
        $delivery = ServiceDelivery::where('message_id', $request['command_id'])->where('source', $service)->where('destination', 'platform')
            ->when($lock, fn ($q) => $q->lockForUpdate())->first();
        if (! $inbox || ! $delivery) {
            return null;
        }
        $message = json_decode($inbox->envelope, true, 32, JSON_THROW_ON_ERROR);
        $response = json_decode($delivery->envelope, true, 32, JSON_THROW_ON_ERROR);
        $payload = $response['payload'];
        if ($message['id'] !== $request['command_id']
            || $response['source'] !== $service || $response['destination'] !== 'platform' || $response['version'] !== 1
            || $message['payload']['command']['operation_id'] !== $request['operation_id']
            || self::digest($message['payload']['scope']) !== self::digest($request['scope'])
            || $response['id'] !== $request['command_id'] || $response['topic'] !== $service.'.result'
            || $payload['operation_id'] !== $request['operation_id'] || $payload['command_id'] !== $request['command_id']
            || $payload['organization_id'] !== $request['scope']['organization_id'] || $payload['action'] !== $request['scope']['action']
            || ! in_array($payload['http_status'], [200, 201], true) || self::digest($payload['result']) !== $request['result_digest']) {
            return null;
        }

        return ['message' => $message, 'result' => $payload['result']];
    }

    public static function digest(array $value): string
    {
        return hash('sha256', json_encode(self::canonical($value), JSON_THROW_ON_ERROR));
    }

    private static function canonical(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(fn ($item) => is_array($item) ? self::canonical($item) : $item, $value);
    }
}
