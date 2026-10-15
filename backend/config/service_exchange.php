<?php

$service = env('SERVICE_NAME', 'platform');
$read = ['member', 'admin', 'owner'];
$write = ['admin', 'owner'];
$actions = [
    'crm.companies.list' => $read, 'crm.companies.detail' => $read,
    'crm.contacts.list' => $read, 'crm.contacts.detail' => $read,
    'crm.leads.list' => $read, 'crm.leads.detail' => $read,
    'crm.companies.create' => $write, 'crm.companies.update' => $write,
    'crm.contacts.create' => $write, 'crm.contacts.update' => $write,
    'crm.leads.create' => $write, 'crm.leads.update' => $write, 'crm.leads.convert' => $write,
    'crm.pipelines.list' => $read, 'crm.pipelines.detail' => $read, 'crm.pipelines.create' => $write, 'crm.pipelines.update' => $write,
    'crm.stages.list' => $read, 'crm.stages.detail' => $read, 'crm.stages.create' => $write, 'crm.stages.update' => $write,
    'crm.deals.list' => $read, 'crm.deals.detail' => $read, 'crm.deals.create' => $write, 'crm.deals.update' => $write, 'crm.deals.advance' => $write,
    'crm.activities.list' => $read, 'crm.activities.detail' => $read, 'crm.activities.create' => $write,
];
$helpdeskActions = [
    'helpdesk.queues.list' => $read, 'helpdesk.queues.detail' => $read,
    'helpdesk.queues.create' => ['owner'], 'helpdesk.queues.update' => ['owner'],
    'helpdesk.agents.list' => ['owner'], 'helpdesk.agents.assign' => ['owner'], 'helpdesk.agents.revoke' => ['owner'],
    'helpdesk.tickets.requester.list' => $read, 'helpdesk.tickets.requester.create' => $read, 'helpdesk.tickets.requester.detail' => $read,
    'helpdesk.tickets.agent.list' => $read, 'helpdesk.tickets.agent.detail' => $read, 'helpdesk.tickets.agent.status' => $read,
    'helpdesk.tickets.owner.list' => ['owner'], 'helpdesk.tickets.owner.detail' => ['owner'],
    'helpdesk.tickets.owner.assign' => ['owner'], 'helpdesk.tickets.owner.status' => ['owner'],
];
$learningActions = array_fill_keys(['learning.courses.list', 'learning.courses.detail', 'learning.enrollments.create',
    'learning.enrollments.list', 'learning.enrollments.detail', 'learning.lessons.read', 'learning.assessments.detail',
    'learning.attempts.submit', 'learning.attempts.list'], $read) + array_fill_keys(['learning.courses.author.list',
        'learning.courses.create', 'learning.courses.author.detail', 'learning.courses.update', 'learning.courses.publish',
        'learning.courses.archive', 'learning.lessons.create', 'learning.lessons.update', 'learning.lessons.author.detail',
        'learning.assessments.create', 'learning.assessments.update', 'learning.assessments.author.detail'], $write);
$builderActions = array_fill_keys(['builder.pages.list', 'builder.pages.detail', 'builder.pages.render'], $read)
    + array_fill_keys(['builder.pages.create', 'builder.pages.update', 'builder.pages.publish'], ['owner']);
$insightsActions = array_fill_keys(['insights.datasets.list', 'insights.datasets.detail', 'insights.datasets.query',
    'insights.reports.list', 'insights.reports.create', 'insights.reports.detail', 'insights.reports.update', 'insights.reports.run',
    'insights.dashboards.list', 'insights.dashboards.create', 'insights.dashboards.detail', 'insights.dashboards.update', 'insights.dashboards.render'], $read)
    + array_fill_keys(['insights.datasets.create', 'insights.datasets.update', 'insights.datasets.replace'], $write);
$erpActions = array_fill_keys(['erp.accounts.list', 'erp.accounts.detail', 'erp.journals.list', 'erp.journals.detail', 'erp.ledger.list'], $read)
    + array_fill_keys(['erp.accounts.create', 'erp.accounts.update', 'erp.journals.create', 'erp.journals.update', 'erp.journals.post', 'erp.journals.reverse'], ['owner']);
$hrActions = array_fill_keys(['hr.employees.mine.detail', 'hr.attendance.mine.list', 'hr.attendance.record', 'hr.leave.types.list',
    'hr.leave.mine.list', 'hr.leave.mine.create', 'hr.leave.mine.detail'], $read)
    + array_fill_keys(['hr.employees.list', 'hr.employees.create', 'hr.employees.owner.detail', 'hr.employees.update',
        'hr.attendance.owner.list', 'hr.attendance.owner.correct', 'hr.leave.types.create', 'hr.leave.owner.list',
        'hr.leave.owner.detail', 'hr.leave.owner.decide'], ['owner']);
$lendingActions = array_fill_keys(['lending.products.list', 'lending.products.detail', 'lending.applications.list', 'lending.applications.create', 'lending.applications.detail', 'lending.applications.update', 'lending.applications.submit', 'lending.applications.withdraw', 'lending.applications.schedule'], $read)
    + array_fill_keys(['lending.products.create', 'lending.products.update', 'lending.reviews.list', 'lending.reviews.detail', 'lending.reviews.decide'], $write);
$peers = match ($service) {
    'platform' => ['crm' => ['key' => env('PLATFORM_CRM_SERVICE_KEY', ''), 'application' => 'crm',
        'url' => env('CRM_SERVICE_URL', ''), 'actions' => $actions, 'topics' => ['crm.result']],
        'helpdesk' => ['key' => env('PLATFORM_HELPDESK_SERVICE_KEY', ''), 'application' => 'helpdesk',
            'url' => env('HELPDESK_SERVICE_URL', ''), 'actions' => $helpdeskActions, 'topics' => ['helpdesk.result']],
        'learning' => ['key' => env('PLATFORM_LEARNING_SERVICE_KEY', ''), 'application' => 'learning',
            'url' => env('LEARNING_SERVICE_URL', ''), 'actions' => $learningActions, 'topics' => ['learning.result']],
        'builder' => ['key' => env('PLATFORM_BUILDER_SERVICE_KEY', ''), 'application' => 'builder',
            'url' => env('BUILDER_SERVICE_URL', ''), 'actions' => $builderActions, 'topics' => ['builder.result']],
        'insights' => ['key' => env('PLATFORM_INSIGHTS_SERVICE_KEY', ''), 'application' => 'insights',
            'url' => env('INSIGHTS_SERVICE_URL', ''), 'actions' => $insightsActions, 'topics' => ['insights.result']],
        'erp' => ['key' => env('PLATFORM_ERP_SERVICE_KEY', ''), 'application' => 'erp',
            'url' => env('ERP_SERVICE_URL', ''), 'actions' => $erpActions, 'topics' => ['erp.result']],
        'hr' => ['key' => env('PLATFORM_HR_SERVICE_KEY', ''), 'application' => 'hr',
            'url' => env('HR_SERVICE_URL', ''), 'actions' => $hrActions, 'topics' => ['hr.result']],
        'lending' => ['key' => env('PLATFORM_LENDING_SERVICE_KEY', ''), 'application' => 'lending',
            'url' => env('LENDING_SERVICE_URL', ''), 'actions' => $lendingActions, 'topics' => ['lending.result']]],
    'crm' => ['platform' => ['key' => env('PLATFORM_CRM_SERVICE_KEY', ''), 'application' => 'crm',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['crm.command']]],
    'helpdesk' => ['platform' => ['key' => env('PLATFORM_HELPDESK_SERVICE_KEY', ''), 'application' => 'helpdesk',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['helpdesk.command']]],
    'learning' => ['platform' => ['key' => env('PLATFORM_LEARNING_SERVICE_KEY', ''), 'application' => 'learning',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['learning.command']]],
    'builder' => ['platform' => ['key' => env('PLATFORM_BUILDER_SERVICE_KEY', ''), 'application' => 'builder',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['builder.command']]],
    'insights' => ['platform' => ['key' => env('PLATFORM_INSIGHTS_SERVICE_KEY', ''), 'application' => 'insights',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['insights.command']]],
    'erp' => ['platform' => ['key' => env('PLATFORM_ERP_SERVICE_KEY', ''), 'application' => 'erp',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['erp.command']]],
    'hr' => ['platform' => ['key' => env('PLATFORM_HR_SERVICE_KEY', ''), 'application' => 'hr',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['hr.command']]],
    'lending' => ['platform' => ['key' => env('PLATFORM_LENDING_SERVICE_KEY', ''), 'application' => 'lending',
        'url' => env('PLATFORM_SERVICE_URL', ''), 'actions' => [], 'topics' => ['lending.command']]],
    default => [],
};

return [
    'enabled' => env('SERVICE_EXCHANGE_ENABLED', false),
    'name' => $service,
    // Operator-owned peer keys, one application, explicit action-to-role lists and topics.
    // Missing keys/endpoints deny access; feature and provisioning gates remain separate.
    'peers' => $peers,
];
