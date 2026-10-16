<?php

namespace App\Modules\Platform\Services;

use App\Modules\Builder\BuilderActions;
use App\Modules\Builder\BuilderCommandHandler;
use App\Modules\Crm\CrmActions;
use App\Modules\Crm\CrmCommandHandler;
use App\Modules\Erp\ErpActions;
use App\Modules\Erp\ErpCommandHandler;
use App\Modules\Helpdesk\HelpdeskActions;
use App\Modules\Helpdesk\HelpdeskCommandHandler;
use App\Modules\Hr\HrActions;
use App\Modules\Hr\HrCommandHandler;
use App\Modules\Insights\InsightsActions;
use App\Modules\Insights\InsightsCommandHandler;
use App\Modules\Learning\LearningActions;
use App\Modules\Learning\LearningCommandHandler;
use App\Modules\Lending\LendingActions;
use App\Modules\Lending\LendingCommandHandler;
use Illuminate\Support\Str;

class ServiceWorker
{
    public function processNext(): bool
    {
        abort_unless(config('service_exchange.enabled') === true, 503);
        $source = config('service_exchange.name');
        abort_unless(in_array($source, ['platform', ...config('platform.service_names')], true), 503);
        $exchange = app(ServiceExchange::class);
        $worked = false;
        // Every configured fixed peer gets one bounded consume/relay turn per cycle.
        foreach ($source === 'platform' ? config('platform.service_names') : ['platform'] as $destination) {
            $settings = config('service_exchange.peers.'.$destination, []);
            if ($source === 'platform' && empty($settings['url'])) {
                continue;
            }
            $transport = new ServiceTransport($settings['url'] ?? '', $settings['key'] ?? '', $source, $destination);
            $health = $exchange->consume($source, function (array $message) use ($source, $destination): bool {
                $keys = array_keys($message);
                sort($keys);
                if ($keys !== ['destination', 'id', 'payload', 'source', 'topic', 'version']
                    || $message['source'] !== $destination || $message['destination'] !== $source
                    || $message['topic'] !== 'transport.health' || $message['version'] !== 1
                    || ! is_array($message['payload']) || array_keys($message['payload']) !== ['nonce']
                    || ! is_string($message['payload']['nonce']) || ! Str::isUuid($message['payload']['nonce'])) {
                    return false;
                }

                return true;
            }, function (array $message) use ($exchange, $source): void {
                if ($source !== 'platform') {
                    $exchange->enqueue(['id' => $message['id'], 'source' => $source, 'destination' => 'platform',
                        'topic' => 'transport.health', 'version' => 1, 'payload' => $message['payload']]);
                }
            }, $destination, 'transport.health');
            $consumed = match ($source) {
                'platform' => app(RemoteCommandCoordinator::class)->consumeResult($destination),
                'crm' => (new CrmCommandHandler($exchange, $transport, app(CrmActions::class)))->consumeOne(),
                'helpdesk' => (new HelpdeskCommandHandler($exchange, $transport, app(HelpdeskActions::class)))->consumeOne(),
                'learning' => (new LearningCommandHandler($exchange, $transport, app(LearningActions::class)))->consumeOne(),
                'builder' => (new BuilderCommandHandler($exchange, $transport, app(BuilderActions::class)))->consumeOne(),
                'insights' => (new InsightsCommandHandler($exchange, $transport, app(InsightsActions::class)))->consumeOne(),
                'erp' => (new ErpCommandHandler($exchange, $transport, app(ErpActions::class)))->consumeOne(),
                'lending' => (new LendingCommandHandler($exchange, $transport, app(LendingActions::class)))->consumeOne(),
                'hr' => (new HrCommandHandler($exchange, $transport, app(HrActions::class)))->consumeOne(),
            };
            $relayed = $exchange->relay($transport, $destination);
            $worked = $health || $consumed || $relayed || $worked;
        }

        return $worked;
    }
}
