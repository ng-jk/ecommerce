<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('helpdesk_queue_agents', function (Blueprint $table): void {
            $table->index(['organization_id', 'id'], 'hd_agents_org_id');
            $table->index(['organization_id', 'status', 'id'], 'hd_agents_org_status_id');
            $table->index(['organization_id', 'queue_id', 'id'], 'hd_agents_org_queue_id');
        });
        Schema::table('helpdesk_tickets', function (Blueprint $table): void {
            $table->index(['organization_id', 'status', 'id'], 'hd_tickets_org_status_id');
            $table->index(['organization_id', 'queue_id', 'id'], 'hd_tickets_org_queue_id');
            $table->index(['organization_id', 'requester_platform_user_id', 'id'], 'hd_tickets_requester_id');
            $table->index(['organization_id', 'requester_platform_user_id', 'queue_id', 'id'], 'hd_tickets_requester_queue_id');
            $table->index(['organization_id', 'requester_platform_user_id', 'queue_id', 'status', 'id'], 'hd_tickets_requester_queue_status_id');
        });
    }

    public function down(): void
    {
        Schema::table('helpdesk_queue_agents', function (Blueprint $table): void {
            foreach (['hd_agents_org_id', 'hd_agents_org_status_id', 'hd_agents_org_queue_id'] as $index) {
                $table->dropIndex($index);
            }
        });
        Schema::table('helpdesk_tickets', function (Blueprint $table): void {
            foreach (['hd_tickets_org_status_id', 'hd_tickets_org_queue_id', 'hd_tickets_requester_id',
                'hd_tickets_requester_queue_id', 'hd_tickets_requester_queue_status_id'] as $index) {
                $table->dropIndex($index);
            }
        });
    }
};
