<?php

namespace Tests\Feature;

use App\Models\PlatformUser;
use App\Modules\Builder\AuthorizedBuilderScope;
use App\Modules\Erp\AuthorizedErpScope;
use App\Modules\Helpdesk\AuthorizedHelpdeskScope;
use App\Modules\Hr\AuthorizedHrScope;
use App\Modules\Insights\AuthorizedInsightsScope;
use App\Modules\Learning\AuthorizedLearningScope;
use App\Modules\Lending\AuthorizedLendingScope;
use App\Modules\Platform\PlatformToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServicePermissionContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_domain_actions_match_ingress_worker_permissions_and_ai_contracts(): void
    {
        $contracts = ['crm' => array_keys(config('service_exchange.peers.crm.actions')),
            'helpdesk' => (new \ReflectionClass(AuthorizedHelpdeskScope::class))->getConstant('Actions'),
            'learning' => AuthorizedLearningScope::Actions,
            'builder' => AuthorizedBuilderScope::Actions,
            'insights' => AuthorizedInsightsScope::Actions,
            'erp' => AuthorizedErpScope::Actions,
            'hr' => AuthorizedHrScope::Actions,
            'lending' => AuthorizedLendingScope::Actions];
        foreach ($contracts as $service => $actions) {
            config(['platform.applications.'.$service => ['available' => true, 'provisioned' => true]]);
            $peer = config('service_exchange.peers.'.$service);
            $this->assertEqualsCanonicalizing($actions, array_keys($peer['actions']));
            foreach ($actions as $action) {
                $this->assertTrue(config('platform.actions')[$action]);
                $this->assertNotNull(Route::getRoutes()->getByName($action), $action);
                $minimum = config('platform.service_permissions')[$action];
                $roles = match ($minimum) {
                    'member' => ['member', 'admin', 'owner'], 'admin' => ['admin', 'owner'], 'owner' => ['owner'],
                };
                $this->assertEqualsCanonicalizing($roles, $peer['actions'][$action], $action);
            }
        }
        $available = app(PlatformToolRegistry::class)->available(PlatformUser::factory()->create());
        $tools = array_column($available, null, 'action');
        foreach ($contracts as $actions) {
            foreach ($actions as $action) {
                $this->assertArrayHasKey($action, $tools, $action);
                if (in_array(explode('.', $action)[array_key_last(explode('.', $action))], ['update', 'advance', 'revoke', 'assign', 'publish', 'archive', 'status'], true)
                    && isset($tools[$action]['parameters']['properties']['expected_version'])) {
                    $this->assertSame('integer', $tools[$action]['parameters']['properties']['expected_version']['type']);
                }
            }
        }
        $this->assertArrayHasKey('expected_version', $tools['crm.deals.update']['parameters']['properties']);
        $this->assertArrayHasKey('expected_version', $tools['learning.courses.publish']['parameters']['properties']);
        $this->assertArrayHasKey('expected_version', $tools['builder.pages.publish']['parameters']['properties']);
    }

    public function test_all_lending_http_commands_accept_durable_operations_with_matching_verbs(): void
    {
        $this->settleOperations = false;
        Sanctum::actingAs(PlatformUser::factory()->create(), ['platform']);
        foreach ([['GET', 'products'], ['POST', 'products'], ['GET', 'products/2'], ['PATCH', 'products/2'],
            ['GET', 'applications'], ['POST', 'applications'], ['GET', 'applications/2'], ['PATCH', 'applications/2'],
            ['POST', 'applications/2/submit'], ['POST', 'applications/2/withdraw'],
            ['GET', 'applications/2/schedule'], ['GET', 'reviews'], ['GET', 'reviews/2'],
            ['POST', 'reviews/2/decide']] as [$method, $path]) {
            $this->json($method, '/api/v1/platform/organizations/1/lending/'.$path)->assertStatus(202)
                ->assertJsonPath('status', 'queued');
        }
        $this->json('PUT', '/api/v1/platform/organizations/1/lending/products/2')->assertStatus(405);
        $this->json('PUT', '/api/v1/platform/organizations/1/lending/applications/2')->assertStatus(405);
    }
}
