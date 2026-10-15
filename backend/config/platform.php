<?php

$learningRead = ['learning.courses.list', 'learning.courses.detail', 'learning.enrollments.create', 'learning.enrollments.list',
    'learning.enrollments.detail', 'learning.lessons.read', 'learning.assessments.detail', 'learning.attempts.submit', 'learning.attempts.list'];
$learningWrite = ['learning.courses.author.list', 'learning.courses.create', 'learning.courses.author.detail',
    'learning.courses.update', 'learning.courses.publish', 'learning.courses.archive', 'learning.lessons.create',
    'learning.lessons.update', 'learning.lessons.author.detail', 'learning.assessments.create', 'learning.assessments.update', 'learning.assessments.author.detail'];
$builderRead = ['builder.pages.list', 'builder.pages.detail', 'builder.pages.render'];
$builderWrite = ['builder.pages.create', 'builder.pages.update', 'builder.pages.publish'];
$insightsRead = ['insights.datasets.list', 'insights.datasets.detail', 'insights.datasets.query',
    'insights.reports.list', 'insights.reports.create', 'insights.reports.detail', 'insights.reports.update', 'insights.reports.run',
    'insights.dashboards.list', 'insights.dashboards.create', 'insights.dashboards.detail', 'insights.dashboards.update', 'insights.dashboards.render'];
$insightsWrite = ['insights.datasets.create', 'insights.datasets.update', 'insights.datasets.replace'];
$erpRead = ['erp.accounts.list', 'erp.accounts.detail', 'erp.journals.list', 'erp.journals.detail', 'erp.ledger.list'];
$erpWrite = ['erp.accounts.create', 'erp.accounts.update', 'erp.journals.create', 'erp.journals.update', 'erp.journals.post', 'erp.journals.reverse'];
$hrRead = ['hr.employees.mine.detail', 'hr.attendance.mine.list', 'hr.attendance.record', 'hr.leave.types.list',
    'hr.leave.mine.list', 'hr.leave.mine.create', 'hr.leave.mine.detail'];
$hrOwner = ['hr.employees.list', 'hr.employees.create', 'hr.employees.owner.detail', 'hr.employees.update',
    'hr.attendance.owner.list', 'hr.attendance.owner.correct', 'hr.leave.types.create', 'hr.leave.owner.list',
    'hr.leave.owner.detail', 'hr.leave.owner.decide'];

$lendingRead = ['lending.products.list', 'lending.products.detail', 'lending.applications.list', 'lending.applications.create', 'lending.applications.detail', 'lending.applications.update', 'lending.applications.submit', 'lending.applications.withdraw', 'lending.applications.schedule'];
$lendingWrite = ['lending.products.create', 'lending.products.update', 'lending.reviews.list', 'lending.reviews.detail', 'lending.reviews.decide'];

return [
    'service_names' => ['crm', 'helpdesk', 'learning', 'builder', 'insights', 'erp', 'hr', 'lending'],
    'actions' => [
        ...array_fill_keys([...$learningRead, ...$learningWrite, ...$builderRead, ...$builderWrite], true),
        ...array_fill_keys([...$insightsRead, ...$insightsWrite], true),
        ...array_fill_keys([...$erpRead, ...$erpWrite], true),
        ...array_fill_keys([...$hrRead, ...$hrOwner], true),
        ...array_fill_keys([...$lendingRead, ...$lendingWrite], true),
        'platform.assistant' => true,
        'platform.auth.register' => true, 'platform.auth.login' => true,
        'platform.auth.me' => true, 'platform.auth.logout' => true,
        'platform.organizations' => true, 'platform.organization.create' => true,
        'platform.organization' => true, 'platform.organization.update' => true,
        'platform.applications' => true, 'platform.memberships' => true,
        'platform.membership' => true, 'platform.membership.invite' => true,
        'platform.membership.role' => true, 'platform.membership.revoke' => true,
        'platform.membership.accept' => true,
        'platform.application.catalog' => true, 'platform.application.install' => true,
        'platform.application.disable' => true, 'platform.application.reenable' => true,
        'platform.solution.purchases' => true, 'platform.solution.purchase' => true,
        'platform.solution.retry' => true,
        'crm.companies.list' => true, 'crm.companies.create' => true,
        'crm.companies.detail' => true, 'crm.companies.update' => true,
        'crm.contacts.list' => true, 'crm.contacts.create' => true,
        'crm.contacts.detail' => true, 'crm.contacts.update' => true,
        'crm.leads.list' => true, 'crm.leads.create' => true,
        'crm.leads.detail' => true, 'crm.leads.update' => true, 'crm.leads.convert' => true,
        'crm.pipelines.list' => true, 'crm.pipelines.create' => true, 'crm.pipelines.detail' => true, 'crm.pipelines.update' => true,
        'crm.stages.list' => true, 'crm.stages.create' => true, 'crm.stages.detail' => true, 'crm.stages.update' => true,
        'crm.deals.list' => true, 'crm.deals.create' => true, 'crm.deals.detail' => true, 'crm.deals.update' => true, 'crm.deals.advance' => true,
        'crm.activities.list' => true, 'crm.activities.create' => true, 'crm.activities.detail' => true,
        'helpdesk.queues.list' => true, 'helpdesk.queues.create' => true, 'helpdesk.queues.detail' => true, 'helpdesk.queues.update' => true,
        'helpdesk.agents.list' => true, 'helpdesk.agents.assign' => true, 'helpdesk.agents.revoke' => true,
        'helpdesk.tickets.requester.list' => true, 'helpdesk.tickets.requester.create' => true, 'helpdesk.tickets.requester.detail' => true,
        'helpdesk.tickets.agent.list' => true, 'helpdesk.tickets.agent.detail' => true, 'helpdesk.tickets.agent.status' => true,
        'helpdesk.tickets.owner.list' => true, 'helpdesk.tickets.owner.detail' => true,
        'helpdesk.tickets.owner.assign' => true, 'helpdesk.tickets.owner.status' => true,
    ],
    'service_permissions' => [
        ...array_fill_keys($learningRead, 'member'), ...array_fill_keys($learningWrite, 'admin'),
        ...array_fill_keys($builderRead, 'member'), ...array_fill_keys($builderWrite, 'owner'),
        ...array_fill_keys($insightsRead, 'member'), ...array_fill_keys($insightsWrite, 'admin'),
        ...array_fill_keys($erpRead, 'member'), ...array_fill_keys($erpWrite, 'owner'),
        ...array_fill_keys($hrRead, 'member'), ...array_fill_keys($hrOwner, 'owner'),
        ...array_fill_keys($lendingRead, 'member'), ...array_fill_keys($lendingWrite, 'admin'),
        'crm.companies.list' => 'member', 'crm.companies.detail' => 'member',
        'crm.contacts.list' => 'member', 'crm.contacts.detail' => 'member',
        'crm.leads.list' => 'member', 'crm.leads.detail' => 'member',
        'crm.companies.create' => 'admin', 'crm.companies.update' => 'admin',
        'crm.contacts.create' => 'admin', 'crm.contacts.update' => 'admin',
        'crm.leads.create' => 'admin', 'crm.leads.update' => 'admin', 'crm.leads.convert' => 'admin',
        'crm.pipelines.list' => 'member', 'crm.pipelines.detail' => 'member', 'crm.pipelines.create' => 'admin', 'crm.pipelines.update' => 'admin',
        'crm.stages.list' => 'member', 'crm.stages.detail' => 'member', 'crm.stages.create' => 'admin', 'crm.stages.update' => 'admin',
        'crm.deals.list' => 'member', 'crm.deals.detail' => 'member', 'crm.deals.create' => 'admin', 'crm.deals.update' => 'admin', 'crm.deals.advance' => 'admin',
        'crm.activities.list' => 'member', 'crm.activities.detail' => 'member', 'crm.activities.create' => 'admin',
        'helpdesk.queues.list' => 'member', 'helpdesk.queues.detail' => 'member', 'helpdesk.queues.create' => 'owner', 'helpdesk.queues.update' => 'owner',
        'helpdesk.agents.list' => 'owner', 'helpdesk.agents.assign' => 'owner', 'helpdesk.agents.revoke' => 'owner',
        'helpdesk.tickets.requester.list' => 'member', 'helpdesk.tickets.requester.create' => 'member', 'helpdesk.tickets.requester.detail' => 'member',
        'helpdesk.tickets.agent.list' => 'member', 'helpdesk.tickets.agent.detail' => 'member', 'helpdesk.tickets.agent.status' => 'member',
        'helpdesk.tickets.owner.list' => 'owner', 'helpdesk.tickets.owner.detail' => 'owner',
        'helpdesk.tickets.owner.assign' => 'owner', 'helpdesk.tickets.owner.status' => 'owner',
    ],
    'applications' => [
        'erp' => ['name' => 'ERP', 'service' => 'erp', 'contract_version' => '1.0',
            'available' => env('ERP_SERVICE_AVAILABLE', false), 'provisioned' => env('ERP_SERVICE_PROVISIONED', false)],
        'hr' => ['name' => 'HR', 'service' => 'hr', 'contract_version' => '1.0',
            'available' => env('HR_SERVICE_AVAILABLE', false), 'provisioned' => env('HR_SERVICE_PROVISIONED', false)],
        'learning' => ['name' => 'Learning', 'service' => 'learning', 'contract_version' => '1.0',
            'available' => env('LEARNING_SERVICE_AVAILABLE', false), 'provisioned' => env('LEARNING_SERVICE_PROVISIONED', false)],
        'insights' => ['name' => 'Insights', 'service' => 'insights', 'contract_version' => '1.0',
            'available' => env('INSIGHTS_SERVICE_AVAILABLE', false), 'provisioned' => env('INSIGHTS_SERVICE_PROVISIONED', false)],
        'crm' => ['name' => 'CRM', 'service' => 'crm', 'contract_version' => '1.0',
            'available' => env('CRM_SERVICE_AVAILABLE', false), 'provisioned' => env('CRM_SERVICE_PROVISIONED', false)],
        'helpdesk' => ['name' => 'Helpdesk', 'service' => 'helpdesk', 'contract_version' => '1.0',
            'available' => env('HELPDESK_SERVICE_AVAILABLE', false), 'provisioned' => env('HELPDESK_SERVICE_PROVISIONED', false)],
        'lending' => ['name' => 'Lending', 'service' => 'lending', 'contract_version' => '1.0',
            'available' => env('LENDING_SERVICE_AVAILABLE', false), 'provisioned' => env('LENDING_SERVICE_PROVISIONED', false)],
        'framework' => ['name' => 'Framework workspace', 'service' => 'platform', 'contract_version' => '1.0', 'available' => true],
        'builder' => ['name' => 'Builder', 'service' => 'builder', 'contract_version' => '1.0',
            'available' => env('BUILDER_SERVICE_AVAILABLE', false), 'provisioned' => env('BUILDER_SERVICE_PROVISIONED', false)],
        'commerce' => ['name' => 'Commerce', 'service' => 'commerce', 'contract_version' => '1.0', 'available' => true],
    ],
];
