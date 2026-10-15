<?php

namespace App\Modules\Platform;

use App\Domain\Assistant\ToolRegistry;
use App\Models\Organization;
use App\Models\OrganizationMembership;
use App\Models\PlatformUser;
use App\Modules\Builder\Models\Page;
use App\Modules\Crm\Models\Activity;
use App\Modules\Crm\Models\Deal;
use App\Modules\Crm\Models\Lead;
use App\Modules\Crm\Models\Stage;
use App\Modules\Erp\Models\Account;
use App\Modules\Erp\Models\Journal;
use App\Modules\Helpdesk\Models\HelpdeskQueue;
use App\Modules\Helpdesk\Models\HelpdeskQueueAgent;
use App\Modules\Helpdesk\Models\HelpdeskTicket;
use App\Modules\Hr\Models\HrEmployee;
use App\Modules\Hr\Models\HrLeaveRequest;
use App\Modules\Hr\Models\HrLeaveType;
use App\Modules\Insights\Models\InsightDashboard;
use App\Modules\Insights\Models\InsightDataset;
use App\Modules\Insights\Models\InsightReport;
use App\Modules\Learning\Models\LearningCourse;
use App\Modules\Learning\Models\LearningEnrollment;
use App\Modules\Lending\Models\LendingApplication;
use App\Modules\Lending\Models\LendingProduct;

final class PlatformToolRegistry
{
    public function available(PlatformUser $user): array
    {
        abort_unless($user->account_status === PlatformUser::Active && $user->exists, 403);
        $tools = [];
        foreach (app(ToolRegistry::class)->all() as $tool) {
            if (! str_starts_with($tool['path'], '/api/v1/platform/')) {
                continue;
            }
            $action = str_starts_with($tool['action'], 'standalone.') ? substr($tool['action'], strlen('standalone.')) : $tool['action'];
            if (in_array($action, ['platform.auth.register', 'platform.auth.login', 'platform.assistant'], true)
                || ! $tool['callable'] || (config('platform.actions')[$action] ?? false) !== true) {
                continue;
            }
            $tool['action'] = $action;
            if (in_array($action, ['platform.application.install', 'platform.application.disable', 'platform.application.reenable',
                'platform.organization.update', 'platform.membership.role', 'platform.membership.revoke', 'platform.membership.accept'], true)) {
                unset($tool['parameters']['properties']['expected_version']);
                $tool['parameters']['required'] = array_values(array_diff($tool['parameters']['required'] ?? [], ['expected_version']));
            }
            if (in_array(explode('.', $action)[0], config('platform.service_names'), true)
                && (config('platform.applications.'.explode('.', $action)[0].'.available') !== true
                || config('platform.applications.'.explode('.', $action)[0].'.provisioned') !== true)) {
                continue;
            }
            foreach (['status', 'role', 'outcome', 'type', 'access_mode', 'visibility', 'source_kind', 'aggregate', 'decision'] as $field) {
                $options = $this->options($action, $field);
                if ($options !== null && isset($tool['parameters']['properties'][$field])) {
                    $tool['parameters']['properties'][$field]['enum'] = array_keys($options);
                    $tool['parameters']['properties'][$field]['options'] = $options;
                }
            }
            $tools[] = $tool;
        }

        return $tools;
    }

    private function options(string $action, string $field): ?array
    {
        $resource = implode('.', array_slice(explode('.', $action), 0, 2));

        return match ($resource.'.'.$field) {
            'crm.leads.status' => Lead::options(),
            'crm.deals.status' => Deal::options(),
            'crm.stages.outcome' => Stage::options(),
            'crm.activities.type' => Activity::options(),
            'helpdesk.queues.status' => HelpdeskQueue::options(),
            'helpdesk.agents.status' => HelpdeskQueueAgent::options(),
            'helpdesk.tickets.status' => HelpdeskTicket::options(),
            'learning.courses.status' => LearningCourse::options(),
            'learning.courses.access_mode' => LearningCourse::options('access_mode'),
            'learning.enrollments.status' => LearningEnrollment::options(),
            'builder.pages.status' => Page::options(),
            'insights.datasets.status', 'insights.datasets.visibility', 'insights.datasets.source_kind', 'insights.datasets.type', 'insights.datasets.aggregate' => InsightDataset::options($field),
            'insights.reports.status', 'insights.reports.visibility' => InsightReport::options($field),
            'insights.dashboards.status', 'insights.dashboards.visibility' => InsightDashboard::options($field),
            'erp.accounts.type' => Account::options(),
            'erp.journals.status' => Journal::options(),
            'hr.employees.status' => HrEmployee::options(),
            'hr.leave.status' => str_starts_with($action, 'hr.leave.types.') ? HrLeaveType::options() : HrLeaveRequest::options(),
            'hr.leave.decision' => array_intersect_key(HrLeaveRequest::options(), array_flip([HrLeaveRequest::Approved, HrLeaveRequest::Rejected])),
            'lending.products.status' => LendingProduct::options(),
            'lending.applications.status', 'lending.reviews.status' => LendingApplication::options(),
            'lending.reviews.decision' => array_intersect_key(LendingApplication::options(), array_flip([LendingApplication::Approved, LendingApplication::Rejected])),
            default => str_starts_with($action, 'platform.') ? match ($field) {
                'role' => OrganizationMembership::options(),
                'status' => $action === 'platform.organizations' ? Organization::options() : OrganizationMembership::options('status'),
                default => null,
            } : null,
        };
    }

    public function find(string $name, PlatformUser $user): array
    {
        foreach ($this->available($user) as $tool) {
            if ($tool['name'] === $name) {
                return $tool;
            }
        }
        abort(403, 'This platform action is not available.');
    }

    public function describe(array $tool): array
    {
        return ['name' => $tool['name'], 'method' => $tool['method'], 'path' => $tool['path'],
            'description' => $tool['description'], 'parameters' => $tool['parameters'],
            'confirmation_required' => $tool['confirmation'], 'natural_language_confirmation_required' => true,
            'allowed_roles' => array_keys(OrganizationMembership::options()), 'role_options' => OrganizationMembership::options(), 'contract_version' => '1.0'];
    }
}
