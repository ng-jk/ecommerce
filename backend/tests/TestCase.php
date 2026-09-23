<?php

namespace Tests;

use App\Domain\OperationProcessor;
use App\Models\Operation;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    protected bool $settleOperations = true;

    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        $headers += ['Idempotency-Key' => (string) Str::uuid(), 'X-Operation-Token' => str_repeat('a', 64)];
        if ($this->settleOperations && in_array(strtoupper($method), ['PUT', 'PATCH', 'DELETE', 'POST'], true)) {
            $actor = Auth::guard('sanctum')->user();
            if ($actor) {
                $version = $actor->fresh()->version;
                if (preg_match('~admin/(products|orders)/(\d+)~', $uri, $match)) {
                    $model = $match[1] === 'products' ? Product::class : Order::class;
                    $version = $model::find($match[2])?->version ?? 0;
                }
                $data += ['expected_version' => $version];
            }
        }
        $response = parent::json($method, $uri, $data, $headers, $options);
        if ($this->settleOperations && $response->status() === 202) {
            $actor = Auth::guard('sanctum')->user();
            app(OperationProcessor::class)->processNext();
            if ($actor) {
                Sanctum::actingAs($actor->fresh());
            }
            $operation = Operation::where('public_id', $response->json('operation_id'))->firstOrFail();

            return TestResponse::fromBaseResponse(response()->json($operation->result, $operation->http_status ?? 500));
        }

        return $response;
    }

    public function createApplication(): Application
    {
        $app = parent::createApplication();

        $connection = $app['config']->get('database.default');
        $sqlite = $connection === 'sqlite' && $app['config']->get('database.connections.sqlite.database') === ':memory:';
        $pgsql = $connection === 'pgsql' && $app['config']->get('database.connections.pgsql.database') === 'commerce_unit'
            && $app['config']->get('database.connections.pgsql.host') === 'db'
            && getenv('ISOLATED_TEST_DB') === '1';
        if (! $sqlite && ! $pgsql) {
            throw new \LogicException('Tests require in-memory SQLite or the explicitly isolated commerce_unit PostgreSQL database.');
        }

        return $app;
    }
}
