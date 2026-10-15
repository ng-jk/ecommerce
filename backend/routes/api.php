<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CustomPaymentController;
use App\Http\Controllers\OperationController;
use App\Http\Controllers\PaymentWebhookController;
use App\Http\Controllers\PlatformOperationController;
use App\Http\Controllers\StripeWebhookController;
use Illuminate\Support\Facades\Route;

require __DIR__.'/service_exchange.php';

// A domain runtime exposes its signed inbox only, never platform or commerce ingress.
if (config('service_exchange.name') !== 'platform') {
    return;
}

Route::prefix('v1/platform')->middleware('throttle:'.config('commerce.rate_limit').',1,platform-')->group(function (): void {
    Route::get('operations/{id}', [PlatformOperationController::class, 'show'])->whereUuid('id');
    Route::post('auth/register', [PlatformOperationController::class, 'submit'])->name('platform.auth.register')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,platform-auth-');
    Route::post('auth/login', [PlatformOperationController::class, 'submit'])->name('platform.auth.login')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,platform-auth-');
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('assistant', [PlatformOperationController::class, 'submit'])->name('platform.assistant');
        Route::get('auth/me', [PlatformOperationController::class, 'submit'])->name('platform.auth.me');
        Route::post('auth/logout', [PlatformOperationController::class, 'submit'])->name('platform.auth.logout');
        Route::get('organizations/{id}/application-catalog', [PlatformOperationController::class, 'submit'])->name('platform.application.catalog')->whereNumber('id');
        Route::get('organizations/{id}/solution-purchases', [PlatformOperationController::class, 'submit'])->name('platform.solution.purchases')->whereNumber('id');
        Route::get('organizations/{id}/solution-purchases/detail', [PlatformOperationController::class, 'submit'])->name('platform.solution.purchase')->whereNumber('id');
        Route::post('organizations/{id}/solution-purchases/retry', [PlatformOperationController::class, 'submit'])->name('platform.solution.retry')->whereNumber('id');
        foreach (['install', 'disable', 'reenable'] as $verb) {
            Route::post('organizations/{id}/applications/{applicationKey}/'.$verb, [PlatformOperationController::class, 'submit'])
                ->name('platform.application.'.$verb)->whereNumber('id')->where('applicationKey', '[a-z][a-z0-9_-]{0,79}');
        }
        foreach (['companies', 'contacts', 'leads', 'pipelines', 'stages', 'deals'] as $resource) {
            foreach ([['get', '', 'list'], ['post', '', 'create'], ['get', '/{id}', 'detail'], ['patch', '/{id}', 'update']] as [$method, $suffix, $verb]) {
                Route::$method('organizations/{organization_id}/crm/'.$resource.$suffix, [PlatformOperationController::class, 'submit'])
                    ->name('crm.'.$resource.'.'.$verb)->whereNumber(['organization_id', 'id']);
            }
        }
        Route::post('organizations/{organization_id}/crm/leads/{id}/convert', [PlatformOperationController::class, 'submit'])
            ->name('crm.leads.convert')->whereNumber(['organization_id', 'id']);
        Route::post('organizations/{organization_id}/crm/deals/{id}/advance', [PlatformOperationController::class, 'submit'])
            ->name('crm.deals.advance')->whereNumber(['organization_id', 'id']);
        foreach ([['get', '', 'list'], ['post', '', 'create'], ['get', '/{id}', 'detail']] as [$method, $suffix, $verb]) {
            Route::$method('organizations/{organization_id}/crm/activities'.$suffix, [PlatformOperationController::class, 'submit'])
                ->name('crm.activities.'.$verb)->whereNumber(['organization_id', 'id']);
        }
        foreach ([['get', 'queues', 'queues.list'], ['post', 'queues', 'queues.create'], ['get', 'queues/{id}', 'queues.detail'],
            ['patch', 'queues/{id}', 'queues.update'], ['get', 'agents', 'agents.list'], ['post', 'agents', 'agents.assign'],
            ['post', 'agents/{id}/revoke', 'agents.revoke'], ['get', 'tickets', 'tickets.requester.list'],
            ['post', 'tickets', 'tickets.requester.create'], ['get', 'tickets/{id}', 'tickets.requester.detail'],
            ['get', 'agent/tickets', 'tickets.agent.list'], ['get', 'agent/tickets/{id}', 'tickets.agent.detail'],
            ['post', 'agent/tickets/{id}/status', 'tickets.agent.status'], ['get', 'owner/tickets', 'tickets.owner.list'],
            ['get', 'owner/tickets/{id}', 'tickets.owner.detail'], ['post', 'owner/tickets/{id}/assign', 'tickets.owner.assign'],
            ['post', 'owner/tickets/{id}/status', 'tickets.owner.status']] as [$method, $path, $action]) {
            Route::$method('organizations/{organization_id}/helpdesk/'.$path, [PlatformOperationController::class, 'submit'])
                ->name('helpdesk.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach ([['get', 'author/courses', 'courses.author.list'], ['get', 'author/courses/{id}', 'courses.author.detail'],
            ['post', 'courses', 'courses.create'], ['put', 'courses/{id}', 'courses.update'],
            ['post', 'courses/{id}/publish', 'courses.publish'], ['post', 'courses/{id}/archive', 'courses.archive'],
            ['post', 'lessons', 'lessons.create'], ['put', 'lessons/{id}', 'lessons.update'], ['get', 'author/lessons/{id}', 'lessons.author.detail'],
            ['post', 'assessments', 'assessments.create'], ['put', 'assessments/{id}', 'assessments.update'],
            ['get', 'author/assessments/{id}', 'assessments.author.detail'], ['get', 'courses', 'courses.list'],
            ['get', 'courses/{id}', 'courses.detail'], ['post', 'enrollments', 'enrollments.create'],
            ['get', 'enrollments', 'enrollments.list'], ['get', 'enrollments/{id}', 'enrollments.detail'],
            ['get', 'lessons/{id}', 'lessons.read'], ['get', 'assessments/{id}', 'assessments.detail'],
            ['post', 'assessments/{id}/attempts', 'attempts.submit'], ['get', 'attempts', 'attempts.list']] as [$method, $path, $action]) {
            Route::$method('organizations/{organization_id}/learning/'.$path, [PlatformOperationController::class, 'submit'])
                ->name('learning.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach ([['get', '', 'list'], ['post', '', 'create'], ['get', '/{id}', 'detail'], ['patch', '/{id}', 'update'],
            ['post', '/{id}/publish', 'publish'], ['get', '/{id}/render', 'render']] as [$method, $suffix, $action]) {
            Route::$method('organizations/{organization_id}/builder/pages'.$suffix, [PlatformOperationController::class, 'submit'])
                ->name('builder.pages.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach (['datasets', 'reports', 'dashboards'] as $resource) {
            foreach ([['get', '', 'list'], ['post', '', 'create'], ['get', '/{id}', 'detail'], ['put', '/{id}', 'update']] as [$method, $suffix, $action]) {
                Route::$method('organizations/{organization_id}/insights/'.$resource.$suffix, [PlatformOperationController::class, 'submit'])
                    ->name('insights.'.$resource.'.'.$action)->whereNumber(['organization_id', 'id']);
            }
        }
        foreach ([['datasets', 'rows', 'replace'], ['datasets', 'query', 'query'], ['reports', 'run', 'run'], ['dashboards', 'render', 'render']] as [$resource, $path, $action]) {
            Route::post('organizations/{organization_id}/insights/'.$resource.'/{id}/'.$path, [PlatformOperationController::class, 'submit'])
                ->name('insights.'.$resource.'.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach (['accounts', 'journals'] as $resource) {
            foreach ([['get', '', 'list'], ['post', '', 'create'], ['get', '/{id}', 'detail'], ['patch', '/{id}', 'update']] as [$method, $suffix, $action]) {
                Route::$method('organizations/{organization_id}/erp/'.$resource.$suffix, [PlatformOperationController::class, 'submit'])
                    ->name('erp.'.$resource.'.'.$action)->whereNumber(['organization_id', 'id']);
            }
        }
        foreach (['post', 'reverse'] as $action) {
            Route::post('organizations/{organization_id}/erp/journals/{id}/'.$action, [PlatformOperationController::class, 'submit'])
                ->name('erp.journals.'.$action)->whereNumber(['organization_id', 'id']);
        }
        Route::get('organizations/{organization_id}/erp/ledger', [PlatformOperationController::class, 'submit'])
            ->name('erp.ledger.list')->whereNumber('organization_id');
        foreach ([['get', 'employees', 'employees.list'], ['post', 'employees', 'employees.create'],
            ['get', 'owner/employees/{id}', 'employees.owner.detail'], ['get', 'employees/me', 'employees.mine.detail'],
            ['patch', 'employees/{id}', 'employees.update'], ['get', 'attendance', 'attendance.mine.list'],
            ['post', 'attendance', 'attendance.record'], ['get', 'employees/{id}/attendance', 'attendance.owner.list'],
            ['post', 'attendance/{id}/correct', 'attendance.owner.correct'], ['get', 'leave-types', 'leave.types.list'],
            ['post', 'leave-types', 'leave.types.create'], ['get', 'leave', 'leave.mine.list'], ['post', 'leave', 'leave.mine.create'],
            ['get', 'leave/{id}', 'leave.mine.detail'], ['get', 'owner/leave', 'leave.owner.list'],
            ['get', 'owner/leave/{id}', 'leave.owner.detail'], ['post', 'owner/leave/{id}/decide', 'leave.owner.decide']] as [$method, $path, $action]) {
            Route::$method('organizations/{organization_id}/hr/'.$path, [PlatformOperationController::class, 'submit'])
                ->name('hr.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach ([['get', 'products', 'products.list'], ['post', 'products', 'products.create'],
            ['get', 'products/{id}', 'products.detail'], ['patch', 'products/{id}', 'products.update'],
            ['get', 'applications', 'applications.list'], ['post', 'applications', 'applications.create'],
            ['get', 'applications/{id}', 'applications.detail'], ['patch', 'applications/{id}', 'applications.update'],
            ['post', 'applications/{id}/submit', 'applications.submit'],
            ['post', 'applications/{id}/withdraw', 'applications.withdraw'],
            ['get', 'applications/{id}/schedule', 'applications.schedule'],
            ['get', 'reviews', 'reviews.list'], ['get', 'reviews/{id}', 'reviews.detail'],
            ['post', 'reviews/{id}/decide', 'reviews.decide']] as [$method, $path, $action]) {
            Route::$method('organizations/{organization_id}/lending/'.$path, [PlatformOperationController::class, 'submit'])
                ->name('lending.'.$action)->whereNumber(['organization_id', 'id']);
        }
        foreach ([['get', 'organizations', 'platform.organizations'], ['post', 'organizations', 'platform.organization.create'],
            ['get', 'organizations/{id}', 'platform.organization'], ['patch', 'organizations/{id}', 'platform.organization.update'],
            ['get', 'organizations/{id}/applications', 'platform.applications'], ['get', 'organizations/{id}/memberships', 'platform.memberships'],
            ['post', 'organizations/{id}/memberships', 'platform.membership.invite'], ['get', 'organizations/{id}/memberships/{membership_id}', 'platform.membership'],
            ['patch', 'organizations/{id}/memberships/{membership_id}', 'platform.membership.role'],
            ['post', 'organizations/{id}/memberships/{membership_id}/revoke', 'platform.membership.revoke'],
            ['post', 'organizations/{id}/memberships/{membership_id}/accept', 'platform.membership.accept']] as [$method, $path, $action]) {
            Route::$method($path, [PlatformOperationController::class, 'submit'])->name('standalone.'.$action)->whereNumber(['id', 'membership_id']);
        }
    });
});

Route::prefix('v1/shops/{shop:slug}')->middleware('throttle:'.config('commerce.rate_limit').',1,commerce-')->group(function (): void {
    Route::post('assistant', [OperationController::class, 'submit'])->name('assistant')->middleware('throttle:'.config('assistant.rate_limit').',1,assistant-');
    Route::get('operations/{id}', [OperationController::class, 'show']);
    Route::get('products', [OperationController::class, 'submit'])->name('catalog');
    Route::get('products/{id}', [OperationController::class, 'submit'])->name('product');
    Route::get('solutions/offerings', [OperationController::class, 'submit'])->name('solutions.offerings');
    Route::get('solutions/offerings/{id}', [OperationController::class, 'submit'])->name('solutions.offering')->whereNumber('id');
    Route::post('auth/register', [OperationController::class, 'submit'])->name('auth.register')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,auth-');
    Route::post('auth/login', [OperationController::class, 'submit'])->name('auth.login')->middleware('throttle:'.config('commerce.auth_rate_limit').',1,auth-');
    Route::middleware(['auth:sanctum', 'shop.access'])->group(function (): void {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [OperationController::class, 'submit'])->name('auth.logout');
        Route::post('admin/solutions/offerings', [OperationController::class, 'submit'])->name('admin.solution.publish');
        Route::post('platform/organizations/{id}/solution-purchases', [OperationController::class, 'submit'])->name('platform.solution.bind')->whereNumber('id');
        Route::get('platform/organizations/{id}/solution-purchases', [OperationController::class, 'submit'])->name('platform.solution.purchases')->whereNumber('id');
        Route::get('platform/organizations/{id}/solution-purchases/detail', [OperationController::class, 'submit'])->name('platform.solution.purchase')->whereNumber('id');
        Route::post('platform/organizations/{id}/solution-purchases/retry', [OperationController::class, 'submit'])->name('platform.solution.retry')->whereNumber('id');
        Route::get('platform/organizations', [OperationController::class, 'submit'])->name('platform.organizations');
        Route::post('platform/organizations', [OperationController::class, 'submit'])->name('platform.organization.create');
        Route::get('platform/organizations/{id}', [OperationController::class, 'submit'])->name('platform.organization')->whereNumber('id');
        Route::patch('platform/organizations/{id}', [OperationController::class, 'submit'])->name('platform.organization.update')->whereNumber('id');
        Route::get('platform/organizations/{id}/applications', [OperationController::class, 'submit'])->name('platform.applications')->whereNumber('id');
        foreach ([['get', 'platform/organizations/{id}/memberships', 'platform.memberships'],
            ['post', 'platform/organizations/{id}/memberships', 'platform.membership.invite'],
            ['get', 'platform/organizations/{id}/memberships/{membership_id}', 'platform.membership'],
            ['patch', 'platform/organizations/{id}/memberships/{membership_id}', 'platform.membership.role'],
            ['post', 'platform/organizations/{id}/memberships/{membership_id}/revoke', 'platform.membership.revoke'],
            ['post', 'platform/organizations/{id}/memberships/{membership_id}/accept', 'platform.membership.accept']] as [$method, $path, $action]) {
            Route::$method($path, [OperationController::class, 'submit'])->name($action)->whereNumber(['id', 'membership_id']);
        }
        foreach ([['get', 'cart', 'cart.read'], ['put', 'cart', 'cart.update'], ['post', 'checkout', 'checkout'], ['get', 'orders', 'orders'], ['get', 'admin/products', 'admin.products'], ['get', 'admin/products/{id}', 'admin.product'], ['post', 'admin/products', 'admin.create'], ['patch', 'admin/products/{id}', 'admin.update'], ['delete', 'admin/products/{id}', 'admin.delete'], ['get', 'admin/orders', 'admin.orders'], ['patch', 'admin/orders/{id}', 'admin.advance'], ['get', 'admin/plugins', 'admin.plugins'], ['get', 'admin/plugins/{id}', 'admin.plugin'], ['post', 'admin/plugins', 'admin.plugin.install'], ['patch', 'admin/plugins/{id}', 'admin.plugin.update'], ['get', 'miniapps', 'miniapps.list'], ['post', 'miniapps/{id}/launch', 'miniapps.launch'], ['post', 'miniapps/{id}/invoke', 'miniapps.invoke'], ['get', 'admin/miniapps', 'admin.miniapps'], ['post', 'admin/miniapps', 'admin.miniapp.install'], ['patch', 'admin/miniapps/{id}', 'admin.miniapp.update'], ['get', 'plugins/loyalty/balance', 'plugin.loyalty.balance'], ['post', 'admin/plugins/loyalty/credit', 'admin.plugin.loyalty.credit']] as [$method,$path,$action]) {
            Route::$method($path, [OperationController::class, 'submit'])->name($action);
        }
    });
});

Route::post('v1/payments/billplz/{reference}', PaymentWebhookController::class)->whereUuid('reference')->middleware('throttle:120,1,billplz-');
Route::post('v1/payments/stripe', StripeWebhookController::class)->middleware('throttle:120,1,stripe-');
Route::prefix('v1/payment-integrations/{integration}')->where(['integration' => '[a-z][a-z0-9_-]{0,79}'])->middleware('throttle:120,1,custom-payment-')->group(function (): void {
    Route::post('confirm', [CustomPaymentController::class, 'confirm']);
    Route::get('{event}', [CustomPaymentController::class, 'show'])->whereNumber('event');
});
